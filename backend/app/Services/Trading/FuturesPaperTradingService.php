<?php

// ZAINEX_DB_PHASE2B1_LARAVEL_FUTURES_ENGINE_V1_1
// ZAINEX_ROOT_USER_LINKED_WALLET_AVATAR_V1
// ZAINEX_SESSION_USER_DYNAMIC_INITIALS_V1

namespace App\Services\Trading;

use App\Exceptions\FuturesTradingException;
use App\Models\FuturesOrder;
use App\Models\FuturesPosition;
use App\Models\IdempotencyRecord;
use App\Models\TradingAccount;
use App\Models\TradingAuditLog;
use App\Models\TradingBalance;
use App\Models\TradingExecution;
use App\Models\User;
use Brick\Math\BigDecimal;
use Brick\Math\RoundingMode;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Throwable;

final class FuturesPaperTradingService
{
    private const CURRENCY = 'USDT';
    private const INITIAL_BALANCE = '10000.00000000';
    private const FEE_RATE = '0.00050000';
    private const MAINTENANCE_MARGIN_RATE = '0.00500000';
    private const MAX_HISTORY_ITEMS = 500;
    private const IDEMPOTENCY_TTL_DAYS = 7;

    /** @var list<int> */
    private const ALLOWED_LEVERAGE = [1, 2, 5, 10, 20];

    public function __construct(
        private readonly FuturesMarketPriceService $prices,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function account(string $sessionId, string $requestId): array
    {
        $this->assertSessionId($sessionId);
        $this->ensureAccountExists($sessionId);
        $this->refreshOpenPosition($sessionId, $requestId);

        return $this->snapshot($sessionId);
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function orders(string $sessionId, string $requestId): array
    {
        return $this->account($sessionId, $requestId)['orders'];
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function positions(string $sessionId, string $requestId): array
    {
        return $this->account($sessionId, $requestId)['positions'];
    }

    /**
     * @param array<string, mixed> $input
     * @return array<string, mixed>
     */
    public function open(
        string $sessionId,
        string $requestId,
        array $input,
        ?string $ipAddress = null,
        ?string $userAgent = null,
    ): array {
        $this->assertSessionId($sessionId);
        $request = $this->normalizeOpenRequest($input);
        $quote = $this->prices->price($request['symbol']);

        return DB::transaction(function () use (
            $sessionId,
            $requestId,
            $request,
            $quote,
            $ipAddress,
            $userAgent,
        ): array {
            [$account, $balance] = $this->lockedAccountAndBalance($sessionId);

            $route = '/api/trading/futures/orders';
            $requestHash = $this->requestHash($request);
            $replay = $this->readIdempotentResult(
                $account,
                $route,
                $request['clientOrderId'],
                $requestHash,
            );

            if ($replay !== null) {
                return $replay;
            }

            $existingPosition = FuturesPosition::query()
                ->where('trading_account_id', $account->id)
                ->where('symbol', $request['symbol'])
                ->where('status', 'OPEN')
                ->lockForUpdate()
                ->first();

            if ($existingPosition !== null) {
                throw new FuturesTradingException(
                    'FUTURES_POSITION_EXISTS',
                    "A {$request['symbol']} futures position is already open. Close it before opening another one.",
                    409,
                    [
                        'positionMode' => 'ONE_WAY',
                        'existingPosition' => $existingPosition->id,
                    ],
                );
            }

            $entryPrice = $this->decimal($quote['price'], 8);
            $margin = $this->decimal($request['margin'], 8);
            $leverage = $request['leverage'];
            $stopLoss = $this->decimal($request['stopLoss'], 8);
            $takeProfit = $this->decimal($request['takeProfit'], 8);
            $liquidationPrice = $this->liquidationPrice(
                $request['direction'],
                $entryPrice,
                $leverage,
            );

            $this->assertRiskGuard(
                $request['direction'],
                $entryPrice,
                $liquidationPrice,
                $stopLoss,
                $takeProfit,
            );

            $notional = $this->scale(
                $margin->multipliedBy($leverage),
                8,
            );

            $quantity = $notional->dividedBy(
                $entryPrice,
                12,
                RoundingMode::HalfUp,
            );

            $entryFee = $this->scale(
                $notional->multipliedBy(self::FEE_RATE),
                8,
            );

            $requiredBalance = $this->scale(
                $margin->plus($entryFee),
                8,
            );

            $availableBalance = $this->decimal(
                $balance->available_balance,
                8,
            );

            if ($availableBalance->isLessThan($requiredBalance)) {
                throw new FuturesTradingException(
                    'INSUFFICIENT_FUTURES_MARGIN',
                    'The virtual futures account does not have enough available USDT.',
                    409,
                    [
                        'availableBalance' => $this->number($availableBalance),
                        'requiredBalance' => $this->number($requiredBalance),
                        'margin' => $this->number($margin),
                        'entryFee' => $this->number($entryFee),
                    ],
                );
            }

            $now = now();
            $positionId = (string) Str::uuid();
            $orderId = (string) Str::uuid();
            $executionId = (string) Str::uuid();

            $position = FuturesPosition::query()->create([
                'id' => $positionId,
                'trading_account_id' => $account->id,
                'symbol' => $request['symbol'],
                'direction' => $request['direction'],
                'status' => 'OPEN',
                'open_slot' => 1,
                'position_mode' => 'ONE_WAY',
                'margin_mode' => 'ISOLATED',
                'leverage' => $leverage,
                'margin' => (string) $margin,
                'quantity' => (string) $quantity,
                'entry_price' => (string) $entryPrice,
                'mark_price' => (string) $entryPrice,
                'liquidation_price' => (string) $liquidationPrice,
                'stop_loss' => (string) $stopLoss,
                'take_profit' => (string) $takeProfit,
                'maintenance_margin_rate' => self::MAINTENANCE_MARGIN_RATE,
                'entry_notional' => (string) $notional,
                'current_notional' => (string) $notional,
                'unrealized_pnl' => '0.00000000',
                'realized_pnl' => '0.00000000',
                'entry_fee' => (string) $entryFee,
                'close_fee' => '0.00000000',
                'funding_fee' => '0.00000000',
                'net_pnl' => '0.00000000',
                'mark_provider' => $quote['provider'],
                'close_reason' => null,
                'version' => 1,
                'opened_at' => $now,
                'closed_at' => null,
            ]);

            $order = FuturesOrder::query()->create([
                'id' => $orderId,
                'trading_account_id' => $account->id,
                'client_order_id' => $request['clientOrderId'],
                'symbol' => $request['symbol'],
                'direction' => $request['direction'],
                'action' => 'OPEN',
                'order_type' => 'MARKET',
                'margin_mode' => 'ISOLATED',
                'position_mode' => 'ONE_WAY',
                'leverage' => $leverage,
                'margin' => (string) $margin,
                'quantity' => (string) $quantity,
                'requested_price' => null,
                'executed_price' => (string) $entryPrice,
                'notional' => (string) $notional,
                'fee' => (string) $entryFee,
                'fee_rate' => self::FEE_RATE,
                'stop_loss' => (string) $stopLoss,
                'take_profit' => (string) $takeProfit,
                'reduce_only' => false,
                'quote_provider' => $quote['provider'],
                'status' => 'FILLED',
                'rejection_code' => null,
                'filled_at' => $now,
                'cancelled_at' => null,
            ]);

            $execution = TradingExecution::query()->create([
                'id' => $executionId,
                'trading_account_id' => $account->id,
                'order_id' => $order->id,
                'position_id' => $position->id,
                'market_type' => 'FUTURES',
                'symbol' => $request['symbol'],
                'direction' => $request['direction'],
                'action' => 'OPEN',
                'execution_type' => 'MARKET',
                'quantity' => (string) $quantity,
                'price' => (string) $entryPrice,
                'entry_price' => (string) $entryPrice,
                'notional' => (string) $notional,
                'fee' => (string) $entryFee,
                'realized_pnl' => '0.00000000',
                'close_reason' => 'USER_OPEN',
                'quote_provider' => $quote['provider'],
                'metadata' => [
                    'margin' => (string) $margin,
                    'leverage' => $leverage,
                ],
                'executed_at' => $now,
                'created_at' => $now,
            ]);

            $balance->available_balance = (string) $this->scale(
                $availableBalance->minus($requiredBalance),
                8,
            );
            $balance->locked_balance = (string) $this->scale(
                $this->decimal($balance->locked_balance, 8)->plus($margin),
                8,
            );
            $balance->save();

            $this->syncUserWallet(
                $account,
                $balance,
            );

            $account->touch();

            $result = [
                'order' => $this->orderResource($order),
                'trade' => $this->executionResource($execution, $order),
                'account' => $this->snapshotForAccount($account),
                'idempotentReplay' => false,
                'quoteProvider' => $quote['provider'],
            ];

            $this->storeIdempotentResult(
                $account,
                $route,
                $request['clientOrderId'],
                $requestHash,
                201,
                $result,
            );

            $this->audit(
                $account,
                'paper_futures_position_opened',
                $requestId,
                $request['clientOrderId'],
                $requestHash,
                [
                    'positionId' => $position->id,
                    'orderId' => $order->id,
                    'symbol' => $request['symbol'],
                    'direction' => $request['direction'],
                    'margin' => (string) $margin,
                    'leverage' => $leverage,
                    'quantity' => (string) $quantity,
                    'entryPrice' => (string) $entryPrice,
                    'liquidationPrice' => (string) $liquidationPrice,
                    'quoteProvider' => $quote['provider'],
                ],
                $ipAddress,
                $userAgent,
            );

            return $result;
        }, 5);
    }

    /**
     * @param array<string, mixed> $input
     * @return array<string, mixed>
     */
    public function close(
        string $sessionId,
        string $requestId,
        array $input,
        ?string $ipAddress = null,
        ?string $userAgent = null,
    ): array {
        $this->assertSessionId($sessionId);
        $request = $this->normalizeCloseRequest($input);

        return DB::transaction(function () use (
            $sessionId,
            $requestId,
            $request,
            $ipAddress,
            $userAgent,
        ): array {
            [$account, $balance] = $this->lockedAccountAndBalance($sessionId);

            $route = '/api/trading/futures/close';
            $requestHash = $this->requestHash($request);
            $replay = $this->readIdempotentResult(
                $account,
                $route,
                $request['clientOrderId'],
                $requestHash,
            );

            if ($replay !== null) {
                return $replay;
            }

            $position = FuturesPosition::query()
                ->where('trading_account_id', $account->id)
                ->where('id', $request['positionId'])
                ->where('status', 'OPEN')
                ->lockForUpdate()
                ->first();

            if ($position === null) {
                throw new FuturesTradingException(
                    'FUTURES_POSITION_NOT_FOUND',
                    'The requested futures position is not open.',
                    404,
                    ['positionId' => $request['positionId']],
                );
            }

            $quote = $this->prices->price($position->symbol);

            $result = $this->finalizePosition(
                $account,
                $balance,
                $position,
                $this->decimal($quote['price'], 8),
                $quote['provider'],
                $request['clientOrderId'],
                'CLOSE',
                'USER_CLOSE',
                $requestId,
                $requestHash,
                $ipAddress,
                $userAgent,
            );

            $this->storeIdempotentResult(
                $account,
                $route,
                $request['clientOrderId'],
                $requestHash,
                201,
                $result,
            );

            return $result;
        }, 5);
    }

    private function refreshOpenPosition(
        string $sessionId,
        string $requestId,
    ): void {
        $account = TradingAccount::query()
            ->where('external_session_id', $sessionId)
            ->first();

        if ($account === null) {
            return;
        }

        $openSymbols = FuturesPosition::query()
            ->where('trading_account_id', $account->id)
            ->where('status', 'OPEN')
            ->pluck('symbol')
            ->unique()
            ->values();

        if ($openSymbols->isEmpty()) {
            return;
        }

        foreach ($openSymbols as $symbol) {
            $this->refreshOpenPositionForSymbol(
                $sessionId,
                $requestId,
                $symbol,
            );
        }
    }

    private function refreshOpenPositionForSymbol(
        string $sessionId,
        string $requestId,
        string $symbol,
    ): void {
        try {
            $quote = $this->prices->price($symbol);
        } catch (Throwable) {
            // A stale mark is retained if this symbol's price
            // providers are temporarily unavailable.
            return;
        }

        DB::transaction(function () use (
            $sessionId,
            $requestId,
            $symbol,
            $quote,
        ): void {
            [$account, $balance] = $this->lockedAccountAndBalance($sessionId);

            $position = FuturesPosition::query()
                ->where('trading_account_id', $account->id)
                ->where('symbol', $symbol)
                ->where('status', 'OPEN')
                ->lockForUpdate()
                ->first();

            if ($position === null) {
                return;
            }

            $markPrice = $this->decimal($quote['price'], 8);
            $entryPrice = $this->decimal($position->entry_price, 8);
            $quantity = $this->decimal($position->quantity, 12);
            $currentNotional = $this->scale(
                $quantity->multipliedBy($markPrice),
                8,
            );
            $unrealizedPnl = $this->rawPnl(
                $position->direction,
                $entryPrice,
                $markPrice,
                $quantity,
            );

            $position->mark_price = (string) $markPrice;
            $position->current_notional = (string) $currentNotional;
            $position->unrealized_pnl = (string) $unrealizedPnl;
            $position->mark_provider = $quote['provider'];
            $position->version = ((int) $position->version) + 1;
            $position->save();

            $reason = null;
            $action = 'CLOSE';

            if ($this->crossedLiquidation($position, $markPrice)) {
                $reason = 'LIQUIDATION';
                $action = 'LIQUIDATE';
            } elseif ($this->crossedStopLoss($position, $markPrice)) {
                $reason = 'STOP_LOSS';
            } elseif ($this->crossedTakeProfit($position, $markPrice)) {
                $reason = 'TAKE_PROFIT';
            }

            if ($reason === null) {
                $account->touch();

                return;
            }

            $clientOrderId = strtolower($reason).'-'.Str::uuid();
            $requestHash = hash(
                'sha256',
                json_encode(
                    [
                        'positionId' => $position->id,
                        'reason' => $reason,
                        'markPrice' => (string) $markPrice,
                    ],
                    JSON_THROW_ON_ERROR,
                ),
            );

            $this->finalizePosition(
                $account,
                $balance,
                $position,
                $markPrice,
                $quote['provider'],
                $clientOrderId,
                $action,
                $reason,
                $requestId,
                $requestHash,
                null,
                null,
            );
        }, 5);
    }

    /**
     * @return array<string, mixed>
     */
    private function finalizePosition(
        TradingAccount $account,
        TradingBalance $balance,
        FuturesPosition $position,
        BigDecimal $exitPrice,
        string $quoteProvider,
        string $clientOrderId,
        string $action,
        string $reason,
        string $requestId,
        string $requestHash,
        ?string $ipAddress,
        ?string $userAgent,
    ): array {
        $quantity = $this->decimal($position->quantity, 12);
        $entryPrice = $this->decimal($position->entry_price, 8);
        $margin = $this->decimal($position->margin, 8);
        $entryFee = $this->decimal($position->entry_fee, 8);

        $exitNotional = $this->scale(
            $quantity->multipliedBy($exitPrice),
            8,
        );
        $exitFee = $this->scale(
            $exitNotional->multipliedBy(self::FEE_RATE),
            8,
        );
        $rawPnl = $this->rawPnl(
            $position->direction,
            $entryPrice,
            $exitPrice,
            $quantity,
        );
        $releasedBalance = $this->scale(
            $margin->plus($rawPnl)->minus($exitFee),
            8,
        );

        if ($releasedBalance->isLessThan(BigDecimal::of('0'))) {
            $releasedBalance = $this->decimal('0', 8);
        }

        $realizedPnl = $this->scale(
            $releasedBalance
                ->minus($margin)
                ->minus($entryFee),
            8,
        );

        $now = now();
        $order = FuturesOrder::query()->create([
            'id' => (string) Str::uuid(),
            'trading_account_id' => $account->id,
            'client_order_id' => $clientOrderId,
            'symbol' => $position->symbol,
            'direction' => $position->direction,
            'action' => $action,
            'order_type' => 'MARKET',
            'margin_mode' => 'ISOLATED',
            'position_mode' => 'ONE_WAY',
            'leverage' => (int) $position->leverage,
            'margin' => (string) $margin,
            'quantity' => (string) $quantity,
            'requested_price' => null,
            'executed_price' => (string) $exitPrice,
            'notional' => (string) $exitNotional,
            'fee' => (string) $exitFee,
            'fee_rate' => self::FEE_RATE,
            'stop_loss' => $position->stop_loss,
            'take_profit' => $position->take_profit,
            'reduce_only' => true,
            'quote_provider' => $quoteProvider,
            'status' => 'FILLED',
            'rejection_code' => null,
            'filled_at' => $now,
            'cancelled_at' => null,
        ]);

        $execution = TradingExecution::query()->create([
            'id' => (string) Str::uuid(),
            'trading_account_id' => $account->id,
            'order_id' => $order->id,
            'position_id' => $position->id,
            'market_type' => 'FUTURES',
            'symbol' => $position->symbol,
            'direction' => $position->direction,
            'action' => $action,
            'execution_type' => 'MARKET',
            'quantity' => (string) $quantity,
            'price' => (string) $exitPrice,
            'entry_price' => (string) $entryPrice,
            'notional' => (string) $exitNotional,
            'fee' => (string) $exitFee,
            'realized_pnl' => (string) $realizedPnl,
            'close_reason' => $reason,
            'quote_provider' => $quoteProvider,
            'metadata' => [
                'margin' => (string) $margin,
                'leverage' => (int) $position->leverage,
                'rawPnl' => (string) $rawPnl,
                'releasedBalance' => (string) $releasedBalance,
            ],
            'executed_at' => $now,
            'created_at' => $now,
        ]);

        $position->status = 'CLOSED';
        $position->open_slot = null;
        $position->mark_price = (string) $exitPrice;
        $position->current_notional = (string) $exitNotional;
        $position->unrealized_pnl = '0.00000000';
        $position->realized_pnl = (string) $realizedPnl;
        $position->close_fee = (string) $exitFee;
        $position->funding_fee = '0.00000000';
        $position->net_pnl = (string) $realizedPnl;
        $position->mark_provider = $quoteProvider;
        $position->close_reason = $reason;
        $position->closed_at = $now;
        $position->version = ((int) $position->version) + 1;
        $position->save();

        $availableBalance = $this->decimal(
            $balance->available_balance,
            8,
        );
        $lockedBalance = $this->decimal(
            $balance->locked_balance,
            8,
        );
        $newLockedBalance = $this->scale(
            $lockedBalance->minus($margin),
            8,
        );

        if ($newLockedBalance->isLessThan(BigDecimal::of('0'))) {
            $newLockedBalance = $this->decimal('0', 8);
        }

        $balance->available_balance = (string) $this->scale(
            $availableBalance->plus($releasedBalance),
            8,
        );
        $balance->locked_balance = (string) $newLockedBalance;
        $balance->realized_pnl = (string) $this->scale(
            $this->decimal($balance->realized_pnl, 8)
                ->plus($realizedPnl),
            8,
        );
        $balance->save();

        $this->syncUserWallet(
            $account,
            $balance,
        );

        $account->touch();

        $event = $reason === 'LIQUIDATION'
            ? 'paper_futures_position_liquidated'
            : 'paper_futures_position_closed';

        $this->audit(
            $account,
            $event,
            $requestId,
            $clientOrderId,
            $requestHash,
            [
                'positionId' => $position->id,
                'orderId' => $order->id,
                'symbol' => $position->symbol,
                'direction' => $position->direction,
                'leverage' => (int) $position->leverage,
                'entryPrice' => (string) $entryPrice,
                'exitPrice' => (string) $exitPrice,
                'realizedPnl' => (string) $realizedPnl,
                'reason' => $reason,
                'quoteProvider' => $quoteProvider,
            ],
            $ipAddress,
            $userAgent,
        );

        return [
            'order' => $this->orderResource($order),
            'trade' => $this->executionResource($execution, $order),
            'account' => $this->snapshotForAccount($account),
            'idempotentReplay' => false,
            'quoteProvider' => $quoteProvider,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function snapshot(string $sessionId): array
    {
        $account = TradingAccount::query()
            ->where('external_session_id', $sessionId)
            ->firstOrFail();

        return $this->snapshotForAccount($account);
    }

    /**
     * @return array<string, mixed>
     */
    private function snapshotForAccount(TradingAccount $account): array
    {
        $balance = TradingBalance::query()
            ->where('trading_account_id', $account->id)
            ->where('asset', self::CURRENCY)
            ->firstOrFail();

        /** @var Collection<int, FuturesPosition> $positions */
        $positions = FuturesPosition::query()
            ->where('trading_account_id', $account->id)
            ->where('status', 'OPEN')
            ->orderByDesc('opened_at')
            ->get();

        /** @var Collection<int, FuturesOrder> $orders */
        $orders = FuturesOrder::query()
            ->where('trading_account_id', $account->id)
            ->orderByDesc('created_at')
            ->limit(self::MAX_HISTORY_ITEMS)
            ->get();

        /** @var Collection<int, TradingExecution> $executions */
        $executions = TradingExecution::query()
            ->with('order')
            ->where('trading_account_id', $account->id)
            ->orderByDesc('executed_at')
            ->limit(self::MAX_HISTORY_ITEMS)
            ->get();

        $usedMargin = $this->decimal('0', 8);
        $unrealizedPnl = $this->decimal('0', 8);

        foreach ($positions as $position) {
            $usedMargin = $usedMargin->plus(
                $this->decimal($position->margin, 8),
            );
            $unrealizedPnl = $unrealizedPnl->plus(
                $this->decimal($position->unrealized_pnl, 8),
            );
        }

        $usedMargin = $this->scale($usedMargin, 8);
        $unrealizedPnl = $this->scale($unrealizedPnl, 8);
        $availableBalance = $this->decimal(
            $balance->available_balance,
            8,
        );
        // Funds committed to an active strategy or a pending cashout are
        // moved out of available_balance the moment they're locked (see
        // FuturesStrategyActivationController / CashoutRequestController)
        // but never touch wallet_balance until finalized or reversed.
        // Total equity must add them back, or it silently understates the
        // account's true value by exactly what's locked — the same gap
        // that made "Wallet Balance" and "Total Equity" fail to reconcile
        // on the wallet page whenever a strategy/cashout was active.
        $strategyLocked = $this->decimal(
            $balance->strategy_locked_balance ?? '0',
            8,
        );
        $cashoutLocked = $this->decimal(
            $balance->cashout_locked_balance ?? '0',
            8,
        );
        $totalEquity = $this->scale(
            $availableBalance
                ->plus($usedMargin)
                ->plus($unrealizedPnl)
                ->plus($strategyLocked)
                ->plus($cashoutLocked),
            8,
        );

        return [
            'mode' => 'paper-futures',
            'product' => 'USDT-M-PERPETUAL',
            'storage' => [
                'kind' => 'database',
                'durable' => true,
            ],
            'model' => [
                'marginMode' => 'ISOLATED',
                'positionMode' => 'ONE_WAY',
                'liquidation' => 'SIMPLIFIED_ISOLATED_V1',
                'fundingSettlement' => false,
            ],
            'sessionId' => $account->external_session_id,
                'user' => $account->user === null
                    ? null
                    : [
                        'id' => (int) $account->user->id,
                        'name' => $account->user->name,
                        'email' => $account->user->email,
                        'role' => $account->user->role,
                        // ZAINEX_ROOT_ADMIN_WALLET_TRANSFER_V1
                        'isAdmin' =>
                            (bool) $account->user->is_admin
                            && in_array(
                                $account->user->role,
                                ['ROOT', 'ADMIN'],
                                true,
                            ),
                        'avatarUrl' => $account->user->avatar_url,
                        // ZAINEX_WALLET_AI_CREDITS_ROUTE_V1_3
                        'walletBalance' => $this->number(
                            $this->decimal(
                                $account->user->wallet_balance,
                                8,
                            ),
                        ),
                        'credits' => (int) $account->user->ai_credits,
                        // ZAINEX_WALLET_VIP_STATUS_DISPLAY_V1
                        'vipTier' => $account->user->vip_tier,
                        'vipExpiresAt' => $account->user->vip_expires_at !== null
                            ? (string) $account->user->vip_expires_at
                            : null,
                    ],
            'currency' => self::CURRENCY,
            'initialBalance' => $this->number(
                $this->decimal($account->starting_balance, 8),
            ),
            'availableBalance' => $this->number($availableBalance),
            'usedMargin' => $this->number($usedMargin),
            'strategyLocked' => $this->number($strategyLocked),
            'cashoutLocked' => $this->number($cashoutLocked),
            'totalEquity' => $this->number($totalEquity),
            'realizedPnl' => $this->number(
                $this->decimal($balance->realized_pnl, 8),
            ),
            'unrealizedPnl' => $this->number($unrealizedPnl),
            'positions' => $positions
                ->map(fn (FuturesPosition $position): array => $this->positionResource($position))
                ->values()
                ->all(),
            'orders' => $orders
                ->map(fn (FuturesOrder $order): array => $this->orderResource($order))
                ->values()
                ->all(),
            'trades' => $executions
                ->map(function (TradingExecution $execution): array {
                    /** @var FuturesOrder $order */
                    $order = $execution->order;

                    return $this->executionResource($execution, $order);
                })
                ->values()
                ->all(),
            'supportedLeverage' => self::ALLOWED_LEVERAGE,
            'feeRate' => $this->number($this->decimal(self::FEE_RATE, 8)),
            'maintenanceMarginRate' => $this->number(
                $this->decimal(self::MAINTENANCE_MARGIN_RATE, 8),
            ),
            'createdAt' => $account->created_at->toIso8601String(),
            'updatedAt' => $account->updated_at->toIso8601String(),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function positionResource(FuturesPosition $position): array
    {
        $margin = $this->decimal($position->margin, 8);
        $unrealizedPnl = $this->decimal(
            $position->unrealized_pnl,
            8,
        );
        $roePercent = $margin->isZero()
            ? $this->decimal('0', 4)
            : $unrealizedPnl->dividedBy(
                $margin,
                8,
                RoundingMode::HalfUp,
            )->multipliedBy('100')->toScale(
                4,
                RoundingMode::HalfUp,
            );

        return [
            'id' => $position->id,
            'symbol' => $position->symbol,
            'direction' => $position->direction,
            'marginMode' => 'ISOLATED',
            'leverage' => (int) $position->leverage,
            'margin' => $this->number($margin),
            'quantity' => $this->number(
                $this->decimal($position->quantity, 12),
            ),
            'entryPrice' => $this->number(
                $this->decimal($position->entry_price, 8),
            ),
            'markPrice' => $this->number(
                $this->decimal($position->mark_price, 8),
            ),
            'notional' => $this->number(
                $this->decimal($position->entry_notional, 8),
            ),
            'entryFee' => $this->number(
                $this->decimal($position->entry_fee, 8),
            ),
            'liquidationPrice' => $this->number(
                $this->decimal($position->liquidation_price, 8),
            ),
            'stopLoss' => $this->number(
                $this->decimal($position->stop_loss, 8),
            ),
            'takeProfit' => $this->number(
                $this->decimal($position->take_profit, 8),
            ),
            'maintenanceMarginRate' => $this->number(
                $this->decimal($position->maintenance_margin_rate, 8),
            ),
            'unrealizedPnl' => $this->number($unrealizedPnl),
            'roePercent' => $this->number($roePercent),
            'markProvider' => $position->mark_provider,
            'openedAt' => $position->opened_at->toIso8601String(),
            'updatedAt' => $position->updated_at->toIso8601String(),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function orderResource(FuturesOrder $order): array
    {
        return [
            'id' => $order->id,
            'clientOrderId' => $order->client_order_id,
            'action' => $order->action,
            'direction' => $order->direction,
            'symbol' => $order->symbol,
            'status' => $order->status,
            'marginMode' => 'ISOLATED',
            'leverage' => (int) $order->leverage,
            'margin' => $this->number(
                $this->decimal($order->margin, 8),
            ),
            'quantity' => $this->number(
                $this->decimal($order->quantity, 12),
            ),
            'executedPrice' => $this->number(
                $this->decimal($order->executed_price, 8),
            ),
            'notional' => $this->number(
                $this->decimal($order->notional, 8),
            ),
            'fee' => $this->number(
                $this->decimal($order->fee, 8),
            ),
            'feeRate' => $this->number(
                $this->decimal($order->fee_rate, 8),
            ),
            'reduceOnly' => (bool) $order->reduce_only,
            'quoteProvider' => $order->quote_provider,
            'createdAt' => $order->created_at->toIso8601String(),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function executionResource(
        TradingExecution $execution,
        FuturesOrder $order,
    ): array {
        return [
            'id' => $execution->id,
            'orderId' => $execution->order_id,
            'action' => $execution->action,
            'direction' => $execution->direction,
            'symbol' => $execution->symbol,
            'leverage' => (int) $order->leverage,
            'margin' => $this->number(
                $this->decimal($order->margin, 8),
            ),
            'quantity' => $this->number(
                $this->decimal($execution->quantity, 12),
            ),
            'price' => $this->number(
                $this->decimal($execution->price, 8),
            ),
            'entryPrice' => $this->number(
                $this->decimal($execution->entry_price, 8),
            ),
            'notional' => $this->number(
                $this->decimal($execution->notional, 8),
            ),
            'fee' => $this->number(
                $this->decimal($execution->fee, 8),
            ),
            'realizedPnl' => $this->number(
                $this->decimal($execution->realized_pnl, 8),
            ),
            'reason' => $execution->close_reason,
            'executedAt' => $execution->executed_at->toIso8601String(),
        ];
    }

    /**
     * @return array{0: TradingAccount, 1: TradingBalance}
     */
    private function lockedAccountAndBalance(string $sessionId): array
    {
        $this->ensureAccountExists($sessionId);

        $account = TradingAccount::query()
            ->where('external_session_id', $sessionId)
            ->lockForUpdate()
            ->firstOrFail();

        $balance = TradingBalance::query()
            ->where('trading_account_id', $account->id)
            ->where('asset', self::CURRENCY)
            ->lockForUpdate()
            ->firstOrFail();

        return [$account, $balance];
    }

    private function ensureAccountExists(string $sessionId): void
    {
        DB::transaction(function () use ($sessionId): void {
            $account = TradingAccount::query()->firstOrCreate(
                ['external_session_id' => $sessionId],
                [
                    'user_id' => null,
                    'account_type' => 'PAPER',
                    'mode' => 'UNIFIED_PAPER',
                    'base_asset' => self::CURRENCY,
                    'status' => 'ACTIVE',
                    'starting_balance' => self::INITIAL_BALANCE,
                ],
            );

            TradingBalance::query()->firstOrCreate(
                [
                    'trading_account_id' => $account->id,
                    'asset' => self::CURRENCY,
                ],
                [
                    'available_balance' => self::INITIAL_BALANCE,
                    'locked_balance' => '0.00000000',
                    'realized_pnl' => '0.00000000',
                ],
            );
        }, 5);
    }

    /**
     * @param array<string, mixed> $input
     * @return array{
     *   symbol: string,
     *   direction: string,
     *   margin: string,
     *   leverage: int,
     *   stopLoss: string,
     *   takeProfit: string,
     *   clientOrderId: string
     * }
     */
    private function normalizeOpenRequest(array $input): array
    {
        $symbol = strtoupper(
            preg_replace(
                '/[\s\-_:\/.]+/',
                '',
                trim((string) ($input['symbol'] ?? 'BTCUSDT')),
            ) ?? '',
        );

        if (
            ! in_array(
                $symbol,
                FuturesMarketPriceService::SUPPORTED_SYMBOLS,
                true,
            )
        ) {
            throw new FuturesTradingException(
                'FUTURES_SYMBOL_NOT_AVAILABLE',
                'The requested Futures symbol is not supported.',
                400,
                [
                    'requestedSymbol' => $symbol,
                    'supportedSymbols' => FuturesMarketPriceService::SUPPORTED_SYMBOLS,
                ],
            );
        }

        $direction = strtoupper(trim((string) ($input['direction'] ?? '')));

        if (! in_array($direction, ['LONG', 'SHORT'], true)) {
            throw new FuturesTradingException(
                'INVALID_FUTURES_DIRECTION',
                'direction must be LONG or SHORT.',
                400,
            );
        }

        $margin = $this->inputDecimal($input['margin'] ?? null, 'margin', 8);
        $stopLoss = $this->inputDecimal(
            $input['stopLoss'] ?? null,
            'stopLoss',
            8,
        );
        $takeProfit = $this->inputDecimal(
            $input['takeProfit'] ?? null,
            'takeProfit',
            8,
        );
        $leverage = filter_var(
            $input['leverage'] ?? null,
            FILTER_VALIDATE_INT,
        );

        if (
            $leverage === false ||
            ! in_array($leverage, self::ALLOWED_LEVERAGE, true)
        ) {
            throw new FuturesTradingException(
                'INVALID_FUTURES_LEVERAGE',
                'Supported leverage values are 1x, 2x, 5x, 10x and 20x.',
                400,
                ['supportedLeverage' => self::ALLOWED_LEVERAGE],
            );
        }

        if (
            $margin->isLessThan($this->decimal('1', 8)) ||
            $margin->isGreaterThan($this->decimal('5000', 8))
        ) {
            throw new FuturesTradingException(
                'INVALID_FUTURES_MARGIN',
                'margin must be between 1 and 5000 USDT.',
                400,
                ['minimum' => 1, 'maximum' => 5000],
            );
        }

        return [
            'symbol' => $symbol,
            'direction' => $direction,
            'margin' => (string) $margin,
            'leverage' => $leverage,
            'stopLoss' => (string) $stopLoss,
            'takeProfit' => (string) $takeProfit,
            'clientOrderId' => $this->clientOrderId(
                $input['clientOrderId'] ?? null,
                'futures-open-',
            ),
        ];
    }

    /**
     * @param array<string, mixed> $input
     * @return array{
     *   positionId: string,
     *   clientOrderId: string
     * }
     */
    private function normalizeCloseRequest(array $input): array
    {
        $positionId = trim((string) ($input['positionId'] ?? ''));

        if (! preg_match('/^[A-Za-z0-9-]{8,80}$/', $positionId)) {
            throw new FuturesTradingException(
                'INVALID_FUTURES_POSITION_ID',
                'A valid positionId is required.',
                400,
            );
        }

        return [
            'positionId' => $positionId,
            'clientOrderId' => $this->clientOrderId(
                $input['clientOrderId'] ?? null,
                'futures-close-',
            ),
        ];
    }

    private function clientOrderId(mixed $value, string $prefix): string
    {
        $clientOrderId = trim((string) ($value ?? ''));

        if ($clientOrderId === '') {
            return $prefix.Str::uuid();
        }

        if (! preg_match('/^[A-Za-z0-9._:-]{1,80}$/', $clientOrderId)) {
            throw new FuturesTradingException(
                'INVALID_CLIENT_ORDER_ID',
                'clientOrderId contains unsupported characters.',
                400,
            );
        }

        return $clientOrderId;
    }

    private function assertSessionId(string $sessionId): void
    {
        if (! Str::isUuid($sessionId)) {
            throw new FuturesTradingException(
                'INVALID_DEMO_SESSION',
                'A valid ZAINEX demo session is required.',
                400,
            );
        }
    }

    private function assertRiskGuard(
        string $direction,
        BigDecimal $entryPrice,
        BigDecimal $liquidationPrice,
        BigDecimal $stopLoss,
        BigDecimal $takeProfit,
    ): void {
        $valid = $direction === 'LONG'
            ? (
                $stopLoss->isLessThan($entryPrice) &&
                $stopLoss->isGreaterThan($liquidationPrice) &&
                $takeProfit->isGreaterThan($entryPrice)
            )
            : (
                $stopLoss->isGreaterThan($entryPrice) &&
                $stopLoss->isLessThan($liquidationPrice) &&
                $takeProfit->isLessThan($entryPrice)
            );

        if ($valid) {
            return;
        }

        throw new FuturesTradingException(
            'INVALID_FUTURES_RISK_GUARD',
            $direction === 'LONG'
                ? 'LONG requires Stop Loss below entry but above liquidation, and Take Profit above entry.'
                : 'SHORT requires Stop Loss above entry but below liquidation, and Take Profit below entry.',
            400,
            [
                'direction' => $direction,
                'entryPrice' => $this->number($entryPrice),
                'liquidationPrice' => $this->number($liquidationPrice),
                'stopLoss' => $this->number($stopLoss),
                'takeProfit' => $this->number($takeProfit),
            ],
        );
    }

    private function liquidationPrice(
        string $direction,
        BigDecimal $entryPrice,
        int $leverage,
    ): BigDecimal {
        $one = BigDecimal::of('1');
        $leverageDecimal = BigDecimal::of($leverage);
        $inverseLeverage = $one->dividedBy(
            $leverageDecimal,
            16,
            RoundingMode::HalfUp,
        );
        $maintenance = BigDecimal::of(
            self::MAINTENANCE_MARGIN_RATE,
        );

        $factor = $direction === 'LONG'
            ? $one->minus($inverseLeverage)->plus($maintenance)
            : $one->plus($inverseLeverage)->minus($maintenance);

        $price = $this->scale(
            $entryPrice->multipliedBy($factor),
            8,
        );

        if ($price->isLessThan(BigDecimal::of('0'))) {
            return $this->decimal('0', 8);
        }

        return $price;
    }

    private function rawPnl(
        string $direction,
        BigDecimal $entryPrice,
        BigDecimal $markPrice,
        BigDecimal $quantity,
    ): BigDecimal {
        $difference = $direction === 'LONG'
            ? $markPrice->minus($entryPrice)
            : $entryPrice->minus($markPrice);

        return $this->scale(
            $difference->multipliedBy($quantity),
            8,
        );
    }

    private function crossedLiquidation(
        FuturesPosition $position,
        BigDecimal $markPrice,
    ): bool {
        $liquidation = $this->decimal(
            $position->liquidation_price,
            8,
        );

        return $position->direction === 'LONG'
            ? $markPrice->isLessThanOrEqualTo($liquidation)
            : $markPrice->isGreaterThanOrEqualTo($liquidation);
    }

    private function crossedStopLoss(
        FuturesPosition $position,
        BigDecimal $markPrice,
    ): bool {
        $stopLoss = $this->decimal($position->stop_loss, 8);

        return $position->direction === 'LONG'
            ? $markPrice->isLessThanOrEqualTo($stopLoss)
            : $markPrice->isGreaterThanOrEqualTo($stopLoss);
    }

    private function crossedTakeProfit(
        FuturesPosition $position,
        BigDecimal $markPrice,
    ): bool {
        $takeProfit = $this->decimal($position->take_profit, 8);

        return $position->direction === 'LONG'
            ? $markPrice->isGreaterThanOrEqualTo($takeProfit)
            : $markPrice->isLessThanOrEqualTo($takeProfit);
    }

    /**
     * @param array<string, mixed> $canonicalRequest
     */
    private function requestHash(array $canonicalRequest): string
    {
        return hash(
            'sha256',
            json_encode(
                $canonicalRequest,
                JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES,
            ),
        );
    }

    /**
     * @return array<string, mixed>|null
     */
    private function readIdempotentResult(
        TradingAccount $account,
        string $route,
        string $idempotencyKey,
        string $requestHash,
    ): ?array {
        $record = IdempotencyRecord::query()
            ->where('trading_account_id', $account->id)
            ->where('route', $route)
            ->where('idempotency_key', $idempotencyKey)
            ->lockForUpdate()
            ->first();

        if ($record === null) {
            return null;
        }

        if (! hash_equals($record->request_hash, $requestHash)) {
            throw new FuturesTradingException(
                'IDEMPOTENCY_KEY_REUSED',
                'The clientOrderId was already used with a different futures request.',
                409,
                ['clientOrderId' => $idempotencyKey],
            );
        }

        $response = $record->response_body;

        if (! is_array($response)) {
            throw new FuturesTradingException(
                'FUTURES_IDEMPOTENCY_STATE_INVALID',
                'The saved futures request is missing its response record.',
                500,
            );
        }

        $response['idempotentReplay'] = true;

        return $response;
    }

    /**
     * @param array<string, mixed> $response
     */
    private function storeIdempotentResult(
        TradingAccount $account,
        string $route,
        string $idempotencyKey,
        string $requestHash,
        int $responseStatus,
        array $response,
    ): void {
        IdempotencyRecord::query()->create([
            'trading_account_id' => $account->id,
            'idempotency_key' => $idempotencyKey,
            'route' => $route,
            'request_hash' => $requestHash,
            'response_status' => $responseStatus,
            'response_body' => $response,
            'expires_at' => now()->addDays(self::IDEMPOTENCY_TTL_DAYS),
        ]);
    }

    /**
     * @param array<string, mixed> $metadata
     */
    private function audit(
        TradingAccount $account,
        string $event,
        string $requestId,
        ?string $clientOrderId,
        string $payloadHash,
        array $metadata,
        ?string $ipAddress,
        ?string $userAgent,
    ): void {
        TradingAuditLog::query()->create([
            'trading_account_id' => $account->id,
            'actor_type' => 'DEMO_SESSION',
            'actor_id' => $account->external_session_id,
            'event' => $event,
            'request_id' => $requestId,
            'client_order_id' => $clientOrderId,
            'ip_address' => $ipAddress,
            'user_agent' => $userAgent,
            'payload_hash' => $payloadHash,
            'metadata' => $metadata,
            'created_at' => now(),
        ]);
    }

    private function inputDecimal(
        mixed $value,
        string $field,
        int $scale,
    ): BigDecimal {
        if (is_float($value)) {
            $value = number_format(
                $value,
                $scale,
                '.',
                '',
            );
        }

        if (! is_string($value) && ! is_int($value)) {
            throw new FuturesTradingException(
                'INVALID_FUTURES_NUMBER',
                "{$field} must be a positive finite number.",
                400,
                ['field' => $field],
            );
        }

        $raw = trim((string) $value);

        if (
            $raw === '' ||
            ! preg_match('/^\d+(?:\.\d+)?$/', $raw)
        ) {
            throw new FuturesTradingException(
                'INVALID_FUTURES_NUMBER',
                "{$field} must be a positive finite number.",
                400,
                ['field' => $field],
            );
        }

        try {
            $decimal = $this->decimal($raw, $scale);
        } catch (Throwable) {
            throw new FuturesTradingException(
                'INVALID_FUTURES_NUMBER',
                "{$field} must be a positive finite number.",
                400,
                ['field' => $field],
            );
        }

        if ($decimal->isLessThanOrEqualTo(BigDecimal::of('0'))) {
            throw new FuturesTradingException(
                'INVALID_FUTURES_NUMBER',
                "{$field} must be a positive finite number.",
                400,
                ['field' => $field],
            );
        }

        return $decimal;
    }

    private function decimal(mixed $value, int $scale): BigDecimal
    {
        return BigDecimal::of((string) $value)
            ->toScale($scale, RoundingMode::HalfUp);
    }

    private function scale(BigDecimal $value, int $scale): BigDecimal
    {
        return $value->toScale(
            $scale,
            RoundingMode::HalfUp,
        );
    }

    private function number(BigDecimal $value): float|int
    {
        $string = (string) $value;

        if (! str_contains($string, '.')) {
            return (int) $string;
        }

        return (float) $string;
    }
    private function syncUserWallet(
        TradingAccount $account,
        TradingBalance $balance,
    ): void {
        if ($account->user_id === null) {
            return;
        }

        $walletBalance = $this->scale(
            $this->decimal($balance->available_balance, 8)
                ->plus($this->decimal($balance->locked_balance, 8)),
            8,
        );

        User::query()
            ->whereKey($account->user_id)
            ->update([
                'wallet_balance' => (string) $walletBalance,
            ]);
    }
}
