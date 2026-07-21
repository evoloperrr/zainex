<?php

// ZAINEX_SPOT_DB_PERSISTENCE_V1

namespace App\Services\Trading;

use App\Exceptions\SpotTradingException;
use App\Models\IdempotencyRecord;
use App\Models\SpotExecution;
use App\Models\SpotOrder;
use App\Models\SpotPosition;
use App\Models\TradingAccount;
use App\Models\TradingAuditLog;
use App\Models\TradingBalance;
use Brick\Math\BigDecimal;
use Brick\Math\RoundingMode;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Throwable;

final class SpotPaperTradingService
{
    private const ASSET_CLASS = 'crypto';
    private const CASH_ASSET = 'USD';
    private const INITIAL_CASH = '10000.00000000';
    private const FEE_RATE = '0.00100000';
    private const MAX_HISTORY_ITEMS = 500;
    private const IDEMPOTENCY_TTL_DAYS = 7;

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
    public function buy(
        string $sessionId,
        string $requestId,
        array $input,
        ?string $ipAddress = null,
        ?string $userAgent = null,
    ): array {
        $this->assertSessionId($sessionId);
        $request = $this->normalizeBuyRequest($input);
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

            $route = '/api/trading/spot/orders';
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

            $existingPosition = SpotPosition::query()
                ->where('trading_account_id', $account->id)
                ->where('symbol', $request['symbol'])
                ->where('status', 'OPEN')
                ->lockForUpdate()
                ->first();

            $executionPrice = $this->decimal($quote['price'], 8);
            $quantity = $this->decimal($request['quantity'], 12);

            if (
                $request['stopLoss'] !== null &&
                $request['stopLoss']->isGreaterThanOrEqualTo($executionPrice)
            ) {
                throw new SpotTradingException(
                    'INVALID_STOP_LOSS',
                    'Stop loss must be below the execution price for a BUY order.',
                    400,
                );
            }

            if (
                $request['takeProfit'] !== null &&
                $request['takeProfit']->isLessThanOrEqualTo($executionPrice)
            ) {
                throw new SpotTradingException(
                    'INVALID_TAKE_PROFIT',
                    'Take profit must be above the execution price for a BUY order.',
                    400,
                );
            }

            $notional = $this->scale(
                $quantity->multipliedBy($executionPrice),
                8,
            );
            $fee = $this->scale(
                $notional->multipliedBy(self::FEE_RATE),
                8,
            );
            $totalDebit = $this->scale(
                $notional->plus($fee),
                8,
            );

            $availableBalance = $this->decimal(
                $balance->available_balance,
                8,
            );

            if ($availableBalance->isLessThan($totalDebit)) {
                throw new SpotTradingException(
                    'INSUFFICIENT_PAPER_BALANCE',
                    'The virtual Spot account does not have enough cash for this order.',
                    409,
                    [
                        'availableBalance' => $this->number($availableBalance),
                        'requiredBalance' => $this->number($totalDebit),
                    ],
                );
            }

            $existingQuantity = $existingPosition === null
                ? $this->decimal('0', 12)
                : $this->decimal($existingPosition->quantity, 12);

            $existingCost = $existingPosition === null
                ? $this->decimal('0', 8)
                : $this->decimal($existingPosition->quantity, 12)
                    ->multipliedBy(
                        $this->decimal($existingPosition->average_entry_price, 8),
                    );

            $newQuantity = $this->scale(
                $existingQuantity->plus($quantity),
                12,
            );
            $newCost = $this->scale(
                $existingCost->plus($notional)->plus($fee),
                8,
            );
            $averageEntryPrice = $this->scale(
                $newCost->dividedBy($newQuantity, 8, RoundingMode::HalfUp),
                8,
            );

            $stopLoss = $request['stopLoss'] ?? (
                $existingPosition?->stop_loss === null
                    ? null
                    : $this->decimal($existingPosition->stop_loss, 8)
            );

            $takeProfit = $request['takeProfit'] ?? (
                $existingPosition?->take_profit === null
                    ? null
                    : $this->decimal($existingPosition->take_profit, 8)
            );

            $now = now();

            if ($existingPosition === null) {
                $position = SpotPosition::query()->create([
                    'id' => (string) Str::uuid(),
                    'trading_account_id' => $account->id,
                    'asset_class' => self::ASSET_CLASS,
                    'symbol' => $request['symbol'],
                    'status' => 'OPEN',
                    'open_slot' => 1,
                    'quantity' => (string) $newQuantity,
                    'average_entry_price' => (string) $averageEntryPrice,
                    'mark_price' => (string) $executionPrice,
                    'stop_loss' => $stopLoss === null ? null : (string) $stopLoss,
                    'take_profit' => $takeProfit === null ? null : (string) $takeProfit,
                    'unrealized_pnl' => '0.00000000',
                    'realized_pnl' => '0.00000000',
                    'mark_provider' => $quote['provider'],
                    'close_reason' => null,
                    'version' => 1,
                    'opened_at' => $now,
                    'closed_at' => null,
                ]);
            } else {
                $existingPosition->quantity = (string) $newQuantity;
                $existingPosition->average_entry_price = (string) $averageEntryPrice;
                $existingPosition->mark_price = (string) $executionPrice;
                $existingPosition->stop_loss = $stopLoss === null ? null : (string) $stopLoss;
                $existingPosition->take_profit = $takeProfit === null ? null : (string) $takeProfit;
                $existingPosition->unrealized_pnl = (string) $this->scale(
                    $executionPrice->minus($averageEntryPrice)->multipliedBy($newQuantity),
                    8,
                );
                $existingPosition->mark_provider = $quote['provider'];
                $existingPosition->version = ((int) $existingPosition->version) + 1;
                $existingPosition->save();
                $position = $existingPosition;
            }

            $order = SpotOrder::query()->create([
                'id' => (string) Str::uuid(),
                'trading_account_id' => $account->id,
                'client_order_id' => $request['clientOrderId'],
                'asset_class' => self::ASSET_CLASS,
                'symbol' => $request['symbol'],
                'side' => 'BUY',
                'order_type' => 'MARKET',
                'quantity' => (string) $quantity,
                'executed_price' => (string) $executionPrice,
                'notional' => (string) $notional,
                'fee' => (string) $fee,
                'fee_rate' => self::FEE_RATE,
                'stop_loss' => $stopLoss === null ? null : (string) $stopLoss,
                'take_profit' => $takeProfit === null ? null : (string) $takeProfit,
                'quote_provider' => $quote['provider'],
                'status' => 'FILLED',
                'filled_at' => $now,
            ]);

            $execution = SpotExecution::query()->create([
                'id' => (string) Str::uuid(),
                'trading_account_id' => $account->id,
                'order_id' => $order->id,
                'position_id' => $position->id,
                'asset_class' => self::ASSET_CLASS,
                'symbol' => $request['symbol'],
                'side' => 'BUY',
                'quantity' => (string) $quantity,
                'price' => (string) $executionPrice,
                'notional' => (string) $notional,
                'fee' => (string) $fee,
                'realized_pnl' => '0.00000000',
                'reason' => 'USER_BUY',
                'quote_provider' => $quote['provider'],
                'metadata' => [],
                'executed_at' => $now,
                'created_at' => $now,
            ]);

            $balance->available_balance = (string) $this->scale(
                $availableBalance->minus($totalDebit),
                8,
            );
            $balance->save();

            $account->touch();

            $result = [
                'order' => $this->orderResource($order),
                'trade' => $this->executionResource($execution),
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
                'paper_spot_buy',
                $requestId,
                $request['clientOrderId'],
                $requestHash,
                [
                    'positionId' => $position->id,
                    'orderId' => $order->id,
                    'symbol' => $request['symbol'],
                    'quantity' => (string) $quantity,
                    'executedPrice' => (string) $executionPrice,
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
    public function sell(
        string $sessionId,
        string $requestId,
        array $input,
        ?string $ipAddress = null,
        ?string $userAgent = null,
    ): array {
        $this->assertSessionId($sessionId);
        $request = $this->normalizeSellRequest($input);

        return DB::transaction(function () use (
            $sessionId,
            $requestId,
            $request,
            $ipAddress,
            $userAgent,
        ): array {
            [$account, $balance] = $this->lockedAccountAndBalance($sessionId);

            $route = '/api/trading/spot/sell';
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

            $position = SpotPosition::query()
                ->where('trading_account_id', $account->id)
                ->where('symbol', $request['symbol'])
                ->where('status', 'OPEN')
                ->lockForUpdate()
                ->first();

            if ($position === null) {
                throw new SpotTradingException(
                    'SPOT_POSITION_NOT_FOUND',
                    'No open Spot position was found to sell.',
                    404,
                );
            }

            $quantity = $this->decimal($request['quantity'], 12);
            $positionQuantity = $this->decimal($position->quantity, 12);

            if ($quantity->isGreaterThan($positionQuantity)) {
                throw new SpotTradingException(
                    'INSUFFICIENT_PAPER_POSITION',
                    'The virtual account does not hold enough quantity to sell.',
                    409,
                    [
                        'requestedQuantity' => $this->number($quantity),
                        'availableQuantity' => $this->number($positionQuantity),
                    ],
                );
            }

            $quote = $this->prices->price($position->symbol);
            $executionPrice = $this->decimal($quote['price'], 8);

            $result = $this->executeSell(
                $account,
                $balance,
                $position,
                $quantity,
                $executionPrice,
                $quote['provider'],
                $request['clientOrderId'],
                'USER_SELL',
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

        $openSymbols = SpotPosition::query()
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

            $position = SpotPosition::query()
                ->where('trading_account_id', $account->id)
                ->where('symbol', $symbol)
                ->where('status', 'OPEN')
                ->lockForUpdate()
                ->first();

            if ($position === null) {
                return;
            }

            $markPrice = $this->decimal($quote['price'], 8);
            $entryPrice = $this->decimal($position->average_entry_price, 8);
            $quantity = $this->decimal($position->quantity, 12);

            $reason = null;

            if (
                $position->stop_loss !== null &&
                $markPrice->isLessThanOrEqualTo(
                    $this->decimal($position->stop_loss, 8),
                )
            ) {
                $reason = 'STOP_LOSS';
            } elseif (
                $position->take_profit !== null &&
                $markPrice->isGreaterThanOrEqualTo(
                    $this->decimal($position->take_profit, 8),
                )
            ) {
                $reason = 'TAKE_PROFIT';
            }

            if ($reason === null) {
                $position->mark_price = (string) $markPrice;
                $position->unrealized_pnl = (string) $this->scale(
                    $markPrice->minus($entryPrice)->multipliedBy($quantity),
                    8,
                );
                $position->mark_provider = $quote['provider'];
                $position->version = ((int) $position->version) + 1;
                $position->save();

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

            $this->executeSell(
                $account,
                $balance,
                $position,
                $quantity,
                $markPrice,
                $quote['provider'],
                $clientOrderId,
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
    private function executeSell(
        TradingAccount $account,
        TradingBalance $balance,
        SpotPosition $position,
        BigDecimal $quantity,
        BigDecimal $exitPrice,
        string $quoteProvider,
        string $clientOrderId,
        string $reason,
        string $requestId,
        string $requestHash,
        ?string $ipAddress,
        ?string $userAgent,
    ): array {
        $entryPrice = $this->decimal($position->average_entry_price, 8);
        $notional = $this->scale(
            $quantity->multipliedBy($exitPrice),
            8,
        );
        $fee = $this->scale(
            $notional->multipliedBy(self::FEE_RATE),
            8,
        );
        $netProceeds = $this->scale(
            $notional->minus($fee),
            8,
        );
        $realizedPnl = $this->scale(
            $exitPrice->minus($entryPrice)
                ->multipliedBy($quantity)
                ->minus($fee),
            8,
        );

        $now = now();
        $order = SpotOrder::query()->create([
            'id' => (string) Str::uuid(),
            'trading_account_id' => $account->id,
            'client_order_id' => $clientOrderId,
            'asset_class' => self::ASSET_CLASS,
            'symbol' => $position->symbol,
            'side' => 'SELL',
            'order_type' => 'MARKET',
            'quantity' => (string) $quantity,
            'executed_price' => (string) $exitPrice,
            'notional' => (string) $notional,
            'fee' => (string) $fee,
            'fee_rate' => self::FEE_RATE,
            'stop_loss' => $position->stop_loss,
            'take_profit' => $position->take_profit,
            'quote_provider' => $quoteProvider,
            'status' => 'FILLED',
            'filled_at' => $now,
        ]);

        $execution = SpotExecution::query()->create([
            'id' => (string) Str::uuid(),
            'trading_account_id' => $account->id,
            'order_id' => $order->id,
            'position_id' => $position->id,
            'asset_class' => self::ASSET_CLASS,
            'symbol' => $position->symbol,
            'side' => 'SELL',
            'quantity' => (string) $quantity,
            'price' => (string) $exitPrice,
            'notional' => (string) $notional,
            'fee' => (string) $fee,
            'realized_pnl' => (string) $realizedPnl,
            'reason' => $reason,
            'quote_provider' => $quoteProvider,
            'metadata' => [
                'entryPrice' => (string) $entryPrice,
            ],
            'executed_at' => $now,
            'created_at' => $now,
        ]);

        $remainingQuantity = $this->scale(
            $this->decimal($position->quantity, 12)->minus($quantity),
            12,
        );

        if ($remainingQuantity->isLessThanOrEqualTo(BigDecimal::of('0'))) {
            $position->status = 'CLOSED';
            $position->open_slot = null;
            $position->quantity = '0.000000000000';
            $position->unrealized_pnl = '0.00000000';
            $position->close_reason = $reason;
            $position->closed_at = $now;
        } else {
            $position->quantity = (string) $remainingQuantity;
            $position->unrealized_pnl = (string) $this->scale(
                $exitPrice->minus($entryPrice)->multipliedBy($remainingQuantity),
                8,
            );
        }

        $position->mark_price = (string) $exitPrice;
        $position->realized_pnl = (string) $this->scale(
            $this->decimal($position->realized_pnl, 8)->plus($realizedPnl),
            8,
        );
        $position->mark_provider = $quoteProvider;
        $position->version = ((int) $position->version) + 1;
        $position->save();

        $balance->available_balance = (string) $this->scale(
            $this->decimal($balance->available_balance, 8)->plus($netProceeds),
            8,
        );
        $balance->realized_pnl = (string) $this->scale(
            $this->decimal($balance->realized_pnl, 8)->plus($realizedPnl),
            8,
        );
        $balance->save();

        $account->touch();

        $this->audit(
            $account,
            $reason === 'USER_SELL'
                ? 'paper_spot_sell'
                : 'paper_spot_auto_close',
            $requestId,
            $clientOrderId,
            $requestHash,
            [
                'positionId' => $position->id,
                'orderId' => $order->id,
                'symbol' => $position->symbol,
                'quantity' => (string) $quantity,
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
            'trade' => $this->executionResource($execution),
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
            ->where('asset', self::CASH_ASSET)
            ->firstOrFail();

        /** @var Collection<int, SpotPosition> $positions */
        $positions = SpotPosition::query()
            ->where('trading_account_id', $account->id)
            ->where('status', 'OPEN')
            ->orderByDesc('opened_at')
            ->get();

        /** @var Collection<int, SpotOrder> $orders */
        $orders = SpotOrder::query()
            ->where('trading_account_id', $account->id)
            ->orderByDesc('created_at')
            ->limit(self::MAX_HISTORY_ITEMS)
            ->get();

        /** @var Collection<int, SpotExecution> $executions */
        $executions = SpotExecution::query()
            ->where('trading_account_id', $account->id)
            ->orderByDesc('executed_at')
            ->limit(self::MAX_HISTORY_ITEMS)
            ->get();

        $positionsMarketValue = $this->decimal('0', 8);
        $unrealizedPnl = $this->decimal('0', 8);

        foreach ($positions as $position) {
            $marketValue = $this->decimal($position->quantity, 12)
                ->multipliedBy($this->decimal($position->mark_price, 8));

            $positionsMarketValue = $positionsMarketValue->plus($marketValue);
            $unrealizedPnl = $unrealizedPnl->plus(
                $this->decimal($position->unrealized_pnl, 8),
            );
        }

        $positionsMarketValue = $this->scale($positionsMarketValue, 8);
        $unrealizedPnl = $this->scale($unrealizedPnl, 8);
        $cashBalance = $this->decimal($balance->available_balance, 8);
        $totalEquity = $this->scale(
            $cashBalance->plus($positionsMarketValue),
            8,
        );

        return [
            'mode' => 'paper',
            'storage' => [
                'kind' => 'database',
                'durable' => true,
            ],
            'sessionId' => $account->external_session_id,
            'currency' => self::CASH_ASSET,
            'initialBalance' => $this->number(
                $this->decimal(self::INITIAL_CASH, 8),
            ),
            'cashBalance' => $this->number($cashBalance),
            'positionsMarketValue' => $this->number($positionsMarketValue),
            'totalEquity' => $this->number($totalEquity),
            'realizedPnl' => $this->number(
                $this->decimal($balance->realized_pnl, 8),
            ),
            'unrealizedPnl' => $this->number($unrealizedPnl),
            'positions' => $positions
                ->map(fn (SpotPosition $position): array => $this->positionResource($position))
                ->values()
                ->all(),
            'orders' => $orders
                ->map(fn (SpotOrder $order): array => $this->orderResource($order))
                ->values()
                ->all(),
            'trades' => $executions
                ->map(fn (SpotExecution $execution): array => $this->executionResource($execution))
                ->values()
                ->all(),
            'createdAt' => $account->created_at->toIso8601String(),
            'updatedAt' => $account->updated_at->toIso8601String(),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function positionResource(SpotPosition $position): array
    {
        return [
            'id' => $position->id,
            'assetClass' => $position->asset_class,
            'symbol' => $position->symbol,
            'quantity' => $this->number(
                $this->decimal($position->quantity, 12),
            ),
            'averageEntryPrice' => $this->number(
                $this->decimal($position->average_entry_price, 8),
            ),
            'lastPrice' => $this->number(
                $this->decimal($position->mark_price, 8),
            ),
            'marketValue' => $this->number(
                $this->scale(
                    $this->decimal($position->quantity, 12)
                        ->multipliedBy($this->decimal($position->mark_price, 8)),
                    8,
                ),
            ),
            'unrealizedPnl' => $this->number(
                $this->decimal($position->unrealized_pnl, 8),
            ),
            'stopLoss' => $position->stop_loss === null
                ? null
                : $this->number($this->decimal($position->stop_loss, 8)),
            'takeProfit' => $position->take_profit === null
                ? null
                : $this->number($this->decimal($position->take_profit, 8)),
            'openedAt' => $position->opened_at->toIso8601String(),
            'updatedAt' => $position->updated_at->toIso8601String(),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function orderResource(SpotOrder $order): array
    {
        return [
            'id' => $order->id,
            'clientOrderId' => $order->client_order_id,
            'assetClass' => $order->asset_class,
            'symbol' => $order->symbol,
            'side' => $order->side,
            'type' => $order->order_type,
            'status' => $order->status,
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
            'quoteProvider' => $order->quote_provider,
            'createdAt' => $order->created_at->toIso8601String(),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function executionResource(SpotExecution $execution): array
    {
        return [
            'id' => $execution->id,
            'orderId' => $execution->order_id,
            'assetClass' => $execution->asset_class,
            'symbol' => $execution->symbol,
            'side' => $execution->side,
            'quantity' => $this->number(
                $this->decimal($execution->quantity, 12),
            ),
            'price' => $this->number(
                $this->decimal($execution->price, 8),
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
            'reason' => $execution->reason,
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
            ->where('asset', self::CASH_ASSET)
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
                    'base_asset' => 'USDT',
                    'status' => 'ACTIVE',
                    'starting_balance' => '10000.00000000',
                ],
            );

            TradingBalance::query()->firstOrCreate(
                [
                    'trading_account_id' => $account->id,
                    'asset' => self::CASH_ASSET,
                ],
                [
                    'available_balance' => self::INITIAL_CASH,
                    'locked_balance' => '0.00000000',
                    'realized_pnl' => '0.00000000',
                ],
            );
        }, 5);
    }

    /**
     * @param array<string, mixed> $input
     * @return array{quantity: string, stopLoss: BigDecimal|null, takeProfit: BigDecimal|null, clientOrderId: string}
     */
    private function normalizeBuyRequest(array $input): array
    {
        $symbol = $this->resolveSymbol($input['symbol'] ?? null);
        $quantity = $this->inputDecimal($input['quantity'] ?? null, 'quantity', 12);

        $stopLoss = $input['stopLoss'] ?? null;
        $takeProfit = $input['takeProfit'] ?? null;

        return [
            'symbol' => $symbol,
            'quantity' => (string) $quantity,
            'stopLoss' => $stopLoss === null || $stopLoss === ''
                ? null
                : $this->inputDecimal($stopLoss, 'stopLoss', 8),
            'takeProfit' => $takeProfit === null || $takeProfit === ''
                ? null
                : $this->inputDecimal($takeProfit, 'takeProfit', 8),
            'clientOrderId' => $this->clientOrderId(
                $input['clientOrderId'] ?? null,
                'spot-buy-',
            ),
        ];
    }

    /**
     * @param array<string, mixed> $input
     * @return array{symbol: string, quantity: string, clientOrderId: string}
     */
    private function normalizeSellRequest(array $input): array
    {
        $symbol = $this->resolveSymbol($input['symbol'] ?? null);
        $quantity = $this->inputDecimal($input['quantity'] ?? null, 'quantity', 12);

        return [
            'symbol' => $symbol,
            'quantity' => (string) $quantity,
            'clientOrderId' => $this->clientOrderId(
                $input['clientOrderId'] ?? null,
                'spot-sell-',
            ),
        ];
    }

    private function resolveSymbol(mixed $value): string
    {
        $symbol = strtoupper(
            preg_replace(
                '/[\s\-_:\/.]+/',
                '',
                trim((string) ($value ?? 'BTCUSDT')),
            ) ?? '',
        );

        if (
            ! in_array(
                $symbol,
                FuturesMarketPriceService::SUPPORTED_SYMBOLS,
                true,
            )
        ) {
            throw new SpotTradingException(
                'SYMBOL_NOT_SUPPORTED',
                "{$symbol} is not a supported trading symbol.",
                400,
                ['supportedSymbols' => FuturesMarketPriceService::SUPPORTED_SYMBOLS],
            );
        }

        return $symbol;
    }

    private function clientOrderId(mixed $value, string $prefix): string
    {
        $clientOrderId = trim((string) ($value ?? ''));

        if ($clientOrderId === '') {
            return $prefix.Str::uuid();
        }

        if (! preg_match('/^[A-Za-z0-9._:-]{1,80}$/', $clientOrderId)) {
            throw new SpotTradingException(
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
            throw new SpotTradingException(
                'INVALID_DEMO_SESSION',
                'A valid ZAINEX demo session is required.',
                400,
            );
        }
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
            throw new SpotTradingException(
                'IDEMPOTENCY_KEY_REUSED',
                'The clientOrderId was already used with a different Spot request.',
                409,
                ['clientOrderId' => $idempotencyKey],
            );
        }

        $response = $record->response_body;

        if (! is_array($response)) {
            throw new SpotTradingException(
                'SPOT_IDEMPOTENCY_STATE_INVALID',
                'The saved Spot request is missing its response record.',
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
            $value = number_format($value, $scale, '.', '');
        }

        if (! is_string($value) && ! is_int($value)) {
            throw new SpotTradingException(
                'INVALID_SPOT_NUMBER',
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
            throw new SpotTradingException(
                'INVALID_SPOT_NUMBER',
                "{$field} must be a positive finite number.",
                400,
                ['field' => $field],
            );
        }

        try {
            $decimal = $this->decimal($raw, $scale);
        } catch (Throwable) {
            throw new SpotTradingException(
                'INVALID_SPOT_NUMBER',
                "{$field} must be a positive finite number.",
                400,
                ['field' => $field],
            );
        }

        if ($decimal->isLessThanOrEqualTo(BigDecimal::of('0'))) {
            throw new SpotTradingException(
                'INVALID_SPOT_NUMBER',
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
        return $value->toScale($scale, RoundingMode::HalfUp);
    }

    private function number(BigDecimal $value): float|int
    {
        $string = (string) $value;

        if (! str_contains($string, '.')) {
            return (int) $string;
        }

        return (float) $string;
    }
}
