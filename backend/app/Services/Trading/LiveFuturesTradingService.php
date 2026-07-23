<?php

// ZAINEX_LIVE_OKX_TRADING_V1
// Live counterpart to FuturesPaperTradingService — same public method
// shape (account/orders/positions/open/close), same response envelope
// ({order, trade, account, idempotentReplay, quoteProvider}), and the
// same resource key names, so a future frontend integration can reuse
// the paper-trading UI against this service almost unchanged. OKX
// itself is the source of truth for fills, fees, and liquidation price
// though — this service never invents a price or a fee locally the way
// the paper engine's quote-oracle math does.
//
// Deliberately NOT reused from the paper engine: ALLOWED_LEVERAGE/margin
// bounds (real per-instrument limits come from OkxInstrumentCatalog),
// fill price/fee (OKX's response, not a formula), liquidation price
// (OKX's own `liqPx`, not the paper engine's simplified isolated-margin
// formula). Also: never touches `users.wallet_balance` — that column is
// the *internal* USDT wallet/credits economy and must stay independent
// of a user's real OKX balance.

namespace App\Services\Trading;

use App\Exceptions\FuturesTradingException;
use App\Exceptions\OkxApiException;
use App\Models\ExchangeConnection;
use App\Models\FuturesOrder;
use App\Models\FuturesPosition;
use App\Models\IdempotencyRecord;
use App\Models\TradingAccount;
use App\Models\TradingAuditLog;
use App\Models\TradingBalance;
use App\Models\TradingExecution;
use App\Services\Trading\Okx\OkxApiClient;
use App\Services\Trading\Okx\OkxInstrumentCatalog;
use Brick\Math\BigDecimal;
use Brick\Math\RoundingMode;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Throwable;

final class LiveFuturesTradingService
{
    private const CURRENCY = 'USDT';
    private const MAX_HISTORY_ITEMS = 500;
    private const IDEMPOTENCY_TTL_DAYS = 7;

    public function __construct(
        private readonly FuturesMarketPriceService $prices,
        private readonly OkxInstrumentCatalog $instruments,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function account(
        TradingAccount $account,
        ExchangeConnection $connection,
        string $requestId,
    ): array {
        $this->syncFromExchange($account, $connection, $requestId);

        return $this->snapshotForAccount($account->fresh());
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function orders(
        TradingAccount $account,
        ExchangeConnection $connection,
        string $requestId,
    ): array {
        return $this->account($account, $connection, $requestId)['orders'];
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function positions(
        TradingAccount $account,
        ExchangeConnection $connection,
        string $requestId,
    ): array {
        return $this->account($account, $connection, $requestId)['positions'];
    }

    /**
     * @param array<string, mixed> $input
     * @return array<string, mixed>
     */
    public function open(
        TradingAccount $account,
        ExchangeConnection $connection,
        string $requestId,
        array $input,
        ?string $ipAddress = null,
        ?string $userAgent = null,
    ): array {
        $request = $this->normalizeOpenRequest($input);
        $instId = $this->instruments->toInstrumentId($request['symbol']);
        $meta = $this->instruments->instrument($instId);
        $maxLeverage = (int) BigDecimal::of($meta['lever'])->toScale(0, RoundingMode::Down);

        if ($request['leverage'] > $maxLeverage || $request['leverage'] < 1) {
            throw new FuturesTradingException(
                'INVALID_FUTURES_LEVERAGE',
                "Leverage for {$request['symbol']} must be between 1x and {$maxLeverage}x on your OKX account.",
                400,
                ['maxLeverage' => $maxLeverage],
            );
        }

        // A live reference price is only used to size the order (how
        // many contracts an approx market order needs) — the real fill
        // price always comes back from OKX's own order lookup below.
        $quote = $this->prices->price($request['symbol']);
        $entryPriceEstimate = $this->decimal($quote['price'], 8);

        $route = '/api/trading/futures/live/orders';
        $requestHash = $this->requestHash($request);

        // Phase 1: pre-flight checks + create the SUBMITTING order row,
        // committed on its own. This row must survive independently of
        // whatever happens next — if this process dies between placing
        // the real OKX order (phase 2) and finishing this method (phase
        // 3), ReconcileOkxOrders needs a durable breadcrumb to find, not
        // a row that would vanish if it were rolled back together with a
        // later failure the way one single wrapping transaction would.
        [$order, $replay, $exchangeClientOrderId, $contracts] = DB::transaction(function () use (
            $account,
            $request,
            $instId,
            $entryPriceEstimate,
            $route,
            $requestHash,
        ): array {
            $account = TradingAccount::query()
                ->whereKey($account->id)
                ->lockForUpdate()
                ->firstOrFail();

            $replay = $this->readIdempotentResult(
                $account,
                $route,
                $request['clientOrderId'],
                $requestHash,
            );

            if ($replay !== null) {
                return [null, $replay, null, null];
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
                    "A {$request['symbol']} live position is already open. Close it before opening another one.",
                    409,
                    ['positionMode' => 'ONE_WAY', 'existingPosition' => $existingPosition->id],
                );
            }

            $inFlight = FuturesOrder::query()
                ->where('trading_account_id', $account->id)
                ->where('symbol', $request['symbol'])
                ->where('action', 'OPEN')
                ->where('status', 'SUBMITTING')
                ->lockForUpdate()
                ->first();

            if ($inFlight !== null) {
                throw new FuturesTradingException(
                    'FUTURES_ORDER_IN_FLIGHT',
                    "A {$request['symbol']} order is already being submitted to OKX. Wait a moment and check your positions before retrying.",
                    409,
                    ['orderId' => $inFlight->id],
                );
            }

            $margin = $this->decimal($request['margin'], 8);
            $leverage = $request['leverage'];
            $notional = $this->scale($margin->multipliedBy($leverage), 8);
            $baseQty = $notional->dividedBy($entryPriceEstimate, 12, RoundingMode::Down);
            $contracts = $this->instruments->contractsForQuantity($instId, $baseQty);

            $exchangeClientOrderId = $this->exchangeClientOrderId();

            $order = FuturesOrder::query()->create([
                'id' => (string) Str::uuid(),
                'trading_account_id' => $account->id,
                'client_order_id' => $request['clientOrderId'],
                'exchange_order_id' => null,
                'exchange_client_order_id' => $exchangeClientOrderId,
                'symbol' => $request['symbol'],
                'direction' => $request['direction'],
                'action' => 'OPEN',
                'order_type' => 'MARKET',
                'margin_mode' => 'ISOLATED',
                'position_mode' => 'ONE_WAY',
                'leverage' => $leverage,
                'margin' => (string) $margin,
                'quantity' => (string) $baseQty,
                'requested_price' => (string) $entryPriceEstimate,
                'executed_price' => '0.00000000',
                'notional' => (string) $notional,
                'fee' => '0.00000000',
                'fee_rate' => '0.00000000',
                'stop_loss' => $request['stopLoss'],
                'take_profit' => $request['takeProfit'],
                'reduce_only' => false,
                'quote_provider' => 'okx-live',
                'status' => 'SUBMITTING',
                'rejection_code' => null,
                'filled_at' => null,
                'cancelled_at' => null,
            ]);

            return [$order, null, $exchangeClientOrderId, $contracts];
        }, 5);

        if ($replay !== null) {
            return $replay;
        }

        // Phase 2: call OKX outside of any open transaction. An
        // ambiguous network failure here must never roll back the
        // SUBMITTING row committed above.
        $client = $this->clientFor($connection);
        $leverage = (int) $order->leverage;

        try {
            $client->post('/api/v5/account/set-leverage', [
                'instId' => $instId,
                'lever' => (string) $leverage,
                'mgnMode' => 'isolated',
            ]);

            $orderResponse = $client->post('/api/v5/trade/order', [
                'instId' => $instId,
                'tdMode' => 'isolated',
                'side' => $request['direction'] === 'LONG' ? 'buy' : 'sell',
                'ordType' => 'market',
                'sz' => (string) $contracts,
                'clOrdId' => $exchangeClientOrderId,
                'attachAlgoOrds' => [[
                    'tpTriggerPx' => $request['takeProfit'],
                    'tpOrdPx' => '-1',
                    'slTriggerPx' => $request['stopLoss'],
                    'slOrdPx' => '-1',
                ]],
            ]);
        } catch (OkxApiException $exception) {
            $order->update([
                'status' => 'REJECTED',
                'rejection_code' => $exception->sCode ?? 'OKX_ERROR',
            ]);

            $this->audit(
                $account,
                'live_futures_order_rejected',
                $requestId,
                $request['clientOrderId'],
                $requestHash,
                ['sCode' => $exception->sCode, 'sMsg' => $exception->sMsg],
                $ipAddress,
                $userAgent,
            );

            throw new FuturesTradingException(
                'OKX_ORDER_REJECTED',
                $exception->sMsg ?? $exception->getMessage(),
                422,
                ['sCode' => $exception->sCode],
            );
        }

        $exchangeOrderId = (string) ($orderResponse['data'][0]['ordId'] ?? '');

        // Market orders fill near-instantly, but OKX's order-ack
        // response doesn't always include the fill price yet — fetch
        // the authoritative order state before trusting a price for the
        // local mirror.
        $filled = $this->fetchFilledOrder($client, $instId, $exchangeOrderId);
        $executedPrice = isset($filled['avgPx']) && $filled['avgPx'] !== ''
            ? $this->decimal($filled['avgPx'], 8)
            : $entryPriceEstimate;
        $fee = isset($filled['fee']) ? $this->decimal($filled['fee'], 8)->abs() : $this->decimal('0', 8);
        $feeCurrency = (string) ($filled['feeCcy'] ?? self::CURRENCY);
        $filledSz = isset($filled['accFillSz']) && $filled['accFillSz'] !== ''
            ? BigDecimal::of((string) $filled['accFillSz'])
            : $contracts;
        $filledBaseQty = $this->scale($filledSz->multipliedBy($meta['ctVal']), 12);
        $filledNotional = $this->scale($filledBaseQty->multipliedBy($executedPrice), 8);
        $feeRate = $filledNotional->isZero()
            ? $this->decimal('0', 8)
            : $this->scale($fee->dividedBy($filledNotional, 8, RoundingMode::HalfUp), 8);

        $margin = $this->decimal($order->margin, 8);

        // Phase 3: finalize in its own committed transaction. If
        // anything here throws, the order stays durably SUBMITTING
        // (already committed in phase 1) for ReconcileOkxOrders to pick
        // up and finish, instead of vanishing with a rolled-back
        // transaction that also wrapped the OKX calls.
        return DB::transaction(function () use (
            $account,
            $requestId,
            $request,
            $instId,
            $route,
            $requestHash,
            $order,
            $margin,
            $leverage,
            $executedPrice,
            $exchangeOrderId,
            $filled,
            $fee,
            $feeRate,
            $feeCurrency,
            $filledBaseQty,
            $filledNotional,
            $ipAddress,
            $userAgent,
        ): array {
            $account = TradingAccount::query()
                ->whereKey($account->id)
                ->lockForUpdate()
                ->firstOrFail();

            $now = now();
            $positionId = (string) Str::uuid();

            $order->update([
                'exchange_order_id' => $exchangeOrderId,
                'executed_price' => (string) $executedPrice,
                'quantity' => (string) $filledBaseQty,
                'notional' => (string) $filledNotional,
                'fee' => (string) $fee,
                'fee_rate' => (string) $feeRate,
                'status' => 'FILLED',
                'filled_at' => $now,
            ]);

            $position = FuturesPosition::query()->create([
                'id' => $positionId,
                'trading_account_id' => $account->id,
                'symbol' => $request['symbol'],
                'exchange_instrument_id' => $instId,
                'direction' => $request['direction'],
                'status' => 'OPEN',
                'open_slot' => 1,
                'position_mode' => 'ONE_WAY',
                'margin_mode' => 'ISOLATED',
                'leverage' => $leverage,
                'margin' => (string) $margin,
                'quantity' => (string) $filledBaseQty,
                'entry_price' => (string) $executedPrice,
                'mark_price' => (string) $executedPrice,
                'liquidation_price' => '0.00000000',
                'stop_loss' => $request['stopLoss'],
                'take_profit' => $request['takeProfit'],
                'maintenance_margin_rate' => '0.00000000',
                'entry_notional' => (string) $filledNotional,
                'current_notional' => (string) $filledNotional,
                'unrealized_pnl' => '0.00000000',
                'realized_pnl' => '0.00000000',
                'entry_fee' => (string) $fee,
                'close_fee' => '0.00000000',
                'funding_fee' => '0.00000000',
                'net_pnl' => '0.00000000',
                'mark_provider' => 'okx-live',
                'close_reason' => null,
                'version' => 1,
                'opened_at' => $now,
                'closed_at' => null,
            ]);

            $execution = TradingExecution::query()->create([
                'id' => (string) Str::uuid(),
                'trading_account_id' => $account->id,
                'order_id' => $order->id,
                'exchange_fill_id' => isset($filled['tradeId']) ? (string) $filled['tradeId'] : null,
                'position_id' => $position->id,
                'market_type' => 'FUTURES',
                'symbol' => $request['symbol'],
                'direction' => $request['direction'],
                'action' => 'OPEN',
                'execution_type' => 'MARKET',
                'quantity' => (string) $filledBaseQty,
                'price' => (string) $executedPrice,
                'entry_price' => (string) $executedPrice,
                'notional' => (string) $filledNotional,
                'fee' => (string) $fee,
                'fee_currency' => $feeCurrency,
                'realized_pnl' => '0.00000000',
                'close_reason' => 'USER_OPEN',
                'quote_provider' => 'okx-live',
                'metadata' => [
                    'margin' => (string) $margin,
                    'leverage' => $leverage,
                    'exchangeOrderId' => $exchangeOrderId,
                    'exchangeInstrumentId' => $instId,
                ],
                'executed_at' => $now,
                'created_at' => $now,
            ]);

            $this->audit(
                $account,
                'live_futures_position_opened',
                $requestId,
                $request['clientOrderId'],
                $requestHash,
                [
                    'positionId' => $position->id,
                    'orderId' => $order->id,
                    'instId' => $instId,
                    'exchangeOrderId' => $exchangeOrderId,
                    'symbol' => $request['symbol'],
                    'direction' => $request['direction'],
                    'margin' => (string) $margin,
                    'leverage' => $leverage,
                    'quantity' => (string) $filledBaseQty,
                    'entryPrice' => (string) $executedPrice,
                ],
                $ipAddress,
                $userAgent,
            );

            $result = [
                'order' => $this->orderResource($order),
                'trade' => $this->executionResource($execution, $order),
                'account' => $this->snapshotForAccount($account),
                'idempotentReplay' => false,
                'quoteProvider' => 'okx-live',
            ];

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

    /**
     * @param array<string, mixed> $input
     * @return array<string, mixed>
     */
    public function close(
        TradingAccount $account,
        ExchangeConnection $connection,
        string $requestId,
        array $input,
        ?string $ipAddress = null,
        ?string $userAgent = null,
    ): array {
        $request = $this->normalizeCloseRequest($input);

        $route = '/api/trading/futures/live/close';
        $requestHash = $this->requestHash($request);

        // Phase 1: pre-flight checks + create a SUBMITTING close order,
        // committed on its own — see the equivalent comment in open()
        // for why this can't live inside the same transaction that also
        // makes the OKX network calls.
        [$position, $closeOrder, $replay] = DB::transaction(function () use (
            $account,
            $request,
            $route,
            $requestHash,
        ): array {
            $account = TradingAccount::query()
                ->whereKey($account->id)
                ->lockForUpdate()
                ->firstOrFail();

            $replay = $this->readIdempotentResult(
                $account,
                $route,
                $request['clientOrderId'],
                $requestHash,
            );

            if ($replay !== null) {
                return [null, null, $replay];
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
                    'The requested live position is not open.',
                    404,
                    ['positionId' => $request['positionId']],
                );
            }

            $closeOrder = FuturesOrder::query()->create([
                'id' => (string) Str::uuid(),
                'trading_account_id' => $account->id,
                'client_order_id' => $request['clientOrderId'],
                'exchange_order_id' => null,
                'exchange_client_order_id' => $this->exchangeClientOrderId(),
                'symbol' => $position->symbol,
                'direction' => $position->direction,
                'action' => 'CLOSE',
                'order_type' => 'MARKET',
                'margin_mode' => 'ISOLATED',
                'position_mode' => 'ONE_WAY',
                'leverage' => (int) $position->leverage,
                'margin' => (string) $position->margin,
                'quantity' => (string) $position->quantity,
                'requested_price' => null,
                'executed_price' => '0.00000000',
                'notional' => '0.00000000',
                'fee' => '0.00000000',
                'fee_rate' => '0.00000000',
                'stop_loss' => $position->stop_loss,
                'take_profit' => $position->take_profit,
                'reduce_only' => true,
                'quote_provider' => 'okx-live',
                'status' => 'SUBMITTING',
                'rejection_code' => null,
                'filled_at' => null,
                'cancelled_at' => null,
            ]);

            return [$position, $closeOrder, null];
        }, 5);

        if ($replay !== null) {
            return $replay;
        }

        // Phase 2: call OKX outside of any open transaction.
        $client = $this->clientFor($connection);

        try {
            $client->post('/api/v5/trade/close-position', [
                'instId' => $position->exchange_instrument_id,
                'mgnMode' => 'isolated',
                'autoCxl' => true,
            ]);
        } catch (OkxApiException $exception) {
            $closeOrder->update([
                'status' => 'REJECTED',
                'rejection_code' => $exception->sCode ?? 'OKX_ERROR',
            ]);

            $this->audit(
                $account,
                'live_futures_close_failed',
                $requestId,
                $request['clientOrderId'],
                $requestHash,
                ['sCode' => $exception->sCode, 'sMsg' => $exception->sMsg],
                $ipAddress,
                $userAgent,
            );

            throw new FuturesTradingException(
                'OKX_CLOSE_REJECTED',
                $exception->sMsg ?? $exception->getMessage(),
                422,
                ['sCode' => $exception->sCode],
            );
        }

        // OKX's fills endpoint has the real exit price/fee/realized PnL
        // for this instrument's most recent close.
        $fill = $this->fetchLatestFill($client, $position->exchange_instrument_id);
        $exitPrice = isset($fill['fillPx']) && $fill['fillPx'] !== ''
            ? $this->decimal($fill['fillPx'], 8)
            : $this->decimal($position->mark_price, 8);
        $exitFee = isset($fill['fee']) ? $this->decimal($fill['fee'], 8)->abs() : $this->decimal('0', 8);
        $feeCurrency = (string) ($fill['feeCcy'] ?? self::CURRENCY);
        $realizedPnl = isset($fill['pnl']) && $fill['pnl'] !== ''
            ? $this->decimal($fill['pnl'], 8)
            : $this->decimal('0', 8);

        $quantity = $this->decimal($position->quantity, 12);
        $exitNotional = $this->scale($quantity->multipliedBy($exitPrice), 8);
        $feeRate = $exitNotional->isZero()
            ? $this->decimal('0', 8)
            : $this->scale($exitFee->dividedBy($exitNotional, 8, RoundingMode::HalfUp), 8);

        // Phase 3: finalize in its own committed transaction. If
        // anything here throws, the close order stays durably
        // SUBMITTING (already committed in phase 1) for
        // ReconcileOkxOrders to pick up and finish.
        return DB::transaction(function () use (
            $account,
            $requestId,
            $request,
            $route,
            $requestHash,
            $position,
            $closeOrder,
            $quantity,
            $exitPrice,
            $exitFee,
            $feeRate,
            $feeCurrency,
            $exitNotional,
            $realizedPnl,
            $fill,
            $ipAddress,
            $userAgent,
        ): array {
            $account = TradingAccount::query()
                ->whereKey($account->id)
                ->lockForUpdate()
                ->firstOrFail();

            $now = now();

            $closeOrder->update([
                'executed_price' => (string) $exitPrice,
                'notional' => (string) $exitNotional,
                'fee' => (string) $exitFee,
                'fee_rate' => (string) $feeRate,
                'status' => 'FILLED',
                'filled_at' => $now,
            ]);

            $execution = TradingExecution::query()->create([
                'id' => (string) Str::uuid(),
                'trading_account_id' => $account->id,
                'order_id' => $closeOrder->id,
                'exchange_fill_id' => isset($fill['tradeId']) ? (string) $fill['tradeId'] : null,
                'position_id' => $position->id,
                'market_type' => 'FUTURES',
                'symbol' => $position->symbol,
                'direction' => $position->direction,
                'action' => 'CLOSE',
                'execution_type' => 'MARKET',
                'quantity' => (string) $quantity,
                'price' => (string) $exitPrice,
                'entry_price' => (string) $position->entry_price,
                'notional' => (string) $exitNotional,
                'fee' => (string) $exitFee,
                'fee_currency' => $feeCurrency,
                'realized_pnl' => (string) $realizedPnl,
                'close_reason' => 'USER_CLOSE',
                'quote_provider' => 'okx-live',
                'metadata' => [
                    'margin' => (string) $position->margin,
                    'leverage' => (int) $position->leverage,
                ],
                'executed_at' => $now,
                'created_at' => $now,
            ]);

            $position->update([
                'status' => 'CLOSED',
                'open_slot' => null,
                'mark_price' => (string) $exitPrice,
                'current_notional' => (string) $exitNotional,
                'unrealized_pnl' => '0.00000000',
                'realized_pnl' => (string) $realizedPnl,
                'close_fee' => (string) $exitFee,
                'net_pnl' => (string) $realizedPnl,
                'mark_provider' => 'okx-live',
                'close_reason' => 'USER_CLOSE',
                'version' => ((int) $position->version) + 1,
                'closed_at' => $now,
            ]);

            $this->audit(
                $account,
                'live_futures_position_closed',
                $requestId,
                $request['clientOrderId'],
                $requestHash,
                [
                    'positionId' => $position->id,
                    'orderId' => $closeOrder->id,
                    'exitPrice' => (string) $exitPrice,
                    'realizedPnl' => (string) $realizedPnl,
                ],
                $ipAddress,
                $userAgent,
            );

            $result = [
                'order' => $this->orderResource($closeOrder),
                'trade' => $this->executionResource($execution, $closeOrder),
                'account' => $this->snapshotForAccount($account),
                'idempotentReplay' => false,
                'quoteProvider' => 'okx-live',
            ];

            $this->storeIdempotentResult(
                $account,
                $route,
                $request['clientOrderId'],
                $requestHash,
                200,
                $result,
            );

            return $result;
        }, 5);
    }

    /**
     * Resolves a `futures_orders` row stuck in SUBMITTING (a crash
     * between the OKX order call and our own commit) by looking up the
     * real order state on OKX via its clOrdId. Called by the
     * ReconcileOkxOrders scheduled job — never by the request path
     * itself, since `open()` already reads OKX's own order response
     * synchronously in the happy path.
     */
    public function reconcileSubmittingOrder(FuturesOrder $order): void
    {
        DB::transaction(function () use ($order): void {
            $order = FuturesOrder::query()
                ->whereKey($order->id)
                ->where('status', 'SUBMITTING')
                ->lockForUpdate()
                ->first();

            if ($order === null) {
                return;
            }

            $account = TradingAccount::query()
                ->whereKey($order->trading_account_id)
                ->lockForUpdate()
                ->first();

            if ($account === null || $account->exchange_connection_id === null) {
                $order->update([
                    'status' => 'REJECTED',
                    'rejection_code' => 'RECONCILE_NO_ACCOUNT',
                ]);

                return;
            }

            $connection = ExchangeConnection::query()->find($account->exchange_connection_id);

            if ($connection === null || ! $connection->isActive()) {
                $order->update([
                    'status' => 'REJECTED',
                    'rejection_code' => 'RECONCILE_NO_CONNECTION',
                ]);

                return;
            }

            if ($order->action === 'CLOSE') {
                $this->reconcileSubmittingCloseOrder($order, $account, $connection);

                return;
            }

            $instId = $this->instruments->toInstrumentId($order->symbol);
            $client = $this->clientFor($connection);

            try {
                $response = $client->get('/api/v5/trade/order', [
                    'instId' => $instId,
                    'clOrdId' => $order->exchange_client_order_id,
                ]);
                $data = $response['data'][0] ?? null;
            } catch (OkxApiException) {
                $data = null;
            }

            if (! is_array($data)) {
                $order->update([
                    'status' => 'REJECTED',
                    'rejection_code' => 'RECONCILE_NOT_FOUND',
                ]);

                $this->audit(
                    $account,
                    'live_futures_order_reconciled_not_found',
                    (string) Str::uuid(),
                    $order->client_order_id,
                    hash('sha256', $order->id),
                    ['orderId' => $order->id],
                    null,
                    null,
                );

                return;
            }

            $state = (string) ($data['state'] ?? '');

            if (in_array($state, ['canceled', 'mmp_canceled'], true)) {
                $order->update([
                    'status' => 'REJECTED',
                    'rejection_code' => 'RECONCILE_CANCELED',
                ]);

                $this->audit(
                    $account,
                    'live_futures_order_reconciled_canceled',
                    (string) Str::uuid(),
                    $order->client_order_id,
                    hash('sha256', $order->id),
                    ['orderId' => $order->id],
                    null,
                    null,
                );

                return;
            }

            if ($state !== 'filled') {
                // Still live/partially_filled — leave SUBMITTING for
                // the next scheduled run rather than guessing.
                return;
            }

            $existingPosition = FuturesPosition::query()
                ->where('trading_account_id', $account->id)
                ->where('symbol', $order->symbol)
                ->where('status', 'OPEN')
                ->lockForUpdate()
                ->first();

            if ($existingPosition !== null) {
                // A previous reconciliation run (or the request thread
                // itself, racing this job) already finished the job.
                $order->update(['status' => 'FILLED']);

                return;
            }

            $meta = $this->instruments->instrument($instId);
            $executedPrice = isset($data['avgPx']) && $data['avgPx'] !== ''
                ? $this->decimal($data['avgPx'], 8)
                : $this->decimal($order->requested_price, 8);
            $fee = isset($data['fee']) ? $this->decimal($data['fee'], 8)->abs() : $this->decimal('0', 8);
            $feeCurrency = (string) ($data['feeCcy'] ?? self::CURRENCY);
            $filledSz = isset($data['accFillSz']) && $data['accFillSz'] !== ''
                ? BigDecimal::of((string) $data['accFillSz'])
                : $this->decimal($order->quantity, 12);
            $filledBaseQty = $this->scale($filledSz->multipliedBy($meta['ctVal']), 12);
            $filledNotional = $this->scale($filledBaseQty->multipliedBy($executedPrice), 8);

            $now = now();

            $order->update([
                'exchange_order_id' => (string) ($data['ordId'] ?? $order->exchange_order_id),
                'executed_price' => (string) $executedPrice,
                'quantity' => (string) $filledBaseQty,
                'notional' => (string) $filledNotional,
                'fee' => (string) $fee,
                'status' => 'FILLED',
                'filled_at' => $now,
            ]);

            $position = FuturesPosition::query()->create([
                'id' => (string) Str::uuid(),
                'trading_account_id' => $account->id,
                'symbol' => $order->symbol,
                'exchange_instrument_id' => $instId,
                'direction' => $order->direction,
                'status' => 'OPEN',
                'open_slot' => 1,
                'position_mode' => 'ONE_WAY',
                'margin_mode' => 'ISOLATED',
                'leverage' => (int) $order->leverage,
                'margin' => (string) $order->margin,
                'quantity' => (string) $filledBaseQty,
                'entry_price' => (string) $executedPrice,
                'mark_price' => (string) $executedPrice,
                'liquidation_price' => '0.00000000',
                'stop_loss' => $order->stop_loss,
                'take_profit' => $order->take_profit,
                'maintenance_margin_rate' => '0.00000000',
                'entry_notional' => (string) $filledNotional,
                'current_notional' => (string) $filledNotional,
                'unrealized_pnl' => '0.00000000',
                'realized_pnl' => '0.00000000',
                'entry_fee' => (string) $fee,
                'close_fee' => '0.00000000',
                'funding_fee' => '0.00000000',
                'net_pnl' => '0.00000000',
                'mark_provider' => 'okx-live',
                'close_reason' => null,
                'version' => 1,
                'opened_at' => $now,
                'closed_at' => null,
            ]);

            TradingExecution::query()->create([
                'id' => (string) Str::uuid(),
                'trading_account_id' => $account->id,
                'order_id' => $order->id,
                'exchange_fill_id' => isset($data['tradeId']) ? (string) $data['tradeId'] : null,
                'position_id' => $position->id,
                'market_type' => 'FUTURES',
                'symbol' => $order->symbol,
                'direction' => $order->direction,
                'action' => 'OPEN',
                'execution_type' => 'MARKET',
                'quantity' => (string) $filledBaseQty,
                'price' => (string) $executedPrice,
                'entry_price' => (string) $executedPrice,
                'notional' => (string) $filledNotional,
                'fee' => (string) $fee,
                'fee_currency' => $feeCurrency,
                'realized_pnl' => '0.00000000',
                'close_reason' => 'USER_OPEN',
                'quote_provider' => 'okx-live',
                'metadata' => [
                    'reconciled' => true,
                    'exchangeOrderId' => (string) ($data['ordId'] ?? ''),
                ],
                'executed_at' => $now,
                'created_at' => $now,
            ]);

            $this->audit(
                $account,
                'live_futures_order_reconciled_filled',
                (string) Str::uuid(),
                $order->client_order_id,
                hash('sha256', $order->id),
                ['orderId' => $order->id, 'positionId' => $position->id],
                null,
                null,
            );
        }, 5);
    }

    /**
     * Resolves a stuck SUBMITTING close order. `POST
     * /trade/close-position` doesn't accept or echo back a `clOrdId`,
     * so unlike the OPEN path this can't look up "did my specific
     * request go through" — instead it asks OKX whether a position
     * still exists for the instrument. Gone means the close succeeded
     * (finalize using the latest fill); still there means it hasn't
     * cleared yet (leave SUBMITTING for the next scheduled run).
     */
    private function reconcileSubmittingCloseOrder(
        FuturesOrder $order,
        TradingAccount $account,
        ExchangeConnection $connection,
    ): void {
        $position = FuturesPosition::query()
            ->where('trading_account_id', $account->id)
            ->where('symbol', $order->symbol)
            ->where('status', 'OPEN')
            ->lockForUpdate()
            ->first();

        if ($position === null) {
            // Nothing locally open for this symbol anymore — a previous
            // reconciliation run (or the request thread itself, racing
            // this job) already finished the job.
            $order->update(['status' => 'FILLED']);

            return;
        }

        $instId = $position->exchange_instrument_id !== null && $position->exchange_instrument_id !== ''
            ? $position->exchange_instrument_id
            : $this->instruments->toInstrumentId($order->symbol);

        $client = $this->clientFor($connection);

        try {
            $positionsResponse = $client->get('/api/v5/account/positions', [
                'instType' => 'SWAP',
                'instId' => $instId,
            ]);
        } catch (OkxApiException) {
            // Transient — leave SUBMITTING for the next scheduled run.
            return;
        }

        foreach (($positionsResponse['data'] ?? []) as $okxPosition) {
            if (is_array($okxPosition) && (float) ($okxPosition['pos'] ?? 0) !== 0.0) {
                // Still open on OKX — the close hasn't cleared yet (or
                // genuinely failed without the exception bubbling up
                // here). Leave SUBMITTING for the next scheduled run
                // rather than guessing.
                return;
            }
        }

        $fill = $this->fetchLatestFill($client, $instId);
        $exitPrice = isset($fill['fillPx']) && $fill['fillPx'] !== ''
            ? $this->decimal($fill['fillPx'], 8)
            : $this->decimal($position->mark_price, 8);
        $exitFee = isset($fill['fee']) ? $this->decimal($fill['fee'], 8)->abs() : $this->decimal('0', 8);
        $feeCurrency = (string) ($fill['feeCcy'] ?? self::CURRENCY);
        $realizedPnl = isset($fill['pnl']) && $fill['pnl'] !== ''
            ? $this->decimal($fill['pnl'], 8)
            : $this->decimal('0', 8);

        $quantity = $this->decimal($position->quantity, 12);
        $exitNotional = $this->scale($quantity->multipliedBy($exitPrice), 8);
        $feeRate = $exitNotional->isZero()
            ? $this->decimal('0', 8)
            : $this->scale($exitFee->dividedBy($exitNotional, 8, RoundingMode::HalfUp), 8);

        $now = now();

        $order->update([
            'executed_price' => (string) $exitPrice,
            'notional' => (string) $exitNotional,
            'fee' => (string) $exitFee,
            'fee_rate' => (string) $feeRate,
            'status' => 'FILLED',
            'filled_at' => $now,
        ]);

        TradingExecution::query()->create([
            'id' => (string) Str::uuid(),
            'trading_account_id' => $account->id,
            'order_id' => $order->id,
            'exchange_fill_id' => isset($fill['tradeId']) ? (string) $fill['tradeId'] : null,
            'position_id' => $position->id,
            'market_type' => 'FUTURES',
            'symbol' => $position->symbol,
            'direction' => $position->direction,
            'action' => 'CLOSE',
            'execution_type' => 'MARKET',
            'quantity' => (string) $quantity,
            'price' => (string) $exitPrice,
            'entry_price' => (string) $position->entry_price,
            'notional' => (string) $exitNotional,
            'fee' => (string) $exitFee,
            'fee_currency' => $feeCurrency,
            'realized_pnl' => (string) $realizedPnl,
            'close_reason' => 'USER_CLOSE',
            'quote_provider' => 'okx-live',
            'metadata' => [
                'margin' => (string) $position->margin,
                'leverage' => (int) $position->leverage,
                'reconciled' => true,
            ],
            'executed_at' => $now,
            'created_at' => $now,
        ]);

        $position->update([
            'status' => 'CLOSED',
            'open_slot' => null,
            'mark_price' => (string) $exitPrice,
            'current_notional' => (string) $exitNotional,
            'unrealized_pnl' => '0.00000000',
            'realized_pnl' => (string) $realizedPnl,
            'close_fee' => (string) $exitFee,
            'net_pnl' => (string) $realizedPnl,
            'mark_provider' => 'okx-live',
            'close_reason' => 'USER_CLOSE',
            'version' => ((int) $position->version) + 1,
            'closed_at' => $now,
        ]);

        $this->audit(
            $account,
            'live_futures_close_reconciled_filled',
            (string) Str::uuid(),
            $order->client_order_id,
            hash('sha256', $order->id),
            ['orderId' => $order->id, 'positionId' => $position->id],
            null,
            null,
        );
    }

    /**
     * Pulls real balance + positions from OKX and reconciles the local
     * mirror rows against them — OKX is the source of truth here, this
     * never invents mark price/PnL locally the way the paper engine
     * does with a price oracle.
     */
    private function syncFromExchange(
        TradingAccount $account,
        ExchangeConnection $connection,
        string $requestId,
    ): void {
        $client = $this->clientFor($connection);

        try {
            $balanceResponse = $client->get('/api/v5/account/balance', [
                'ccy' => self::CURRENCY,
            ]);
            $positionsResponse = $client->get('/api/v5/account/positions', [
                'instType' => 'SWAP',
            ]);
        } catch (OkxApiException $exception) {
            // Live reads degrade to whatever the local mirror already
            // has rather than throwing — a transient OKX hiccup
            // shouldn't make the account page unusable.
            report($exception);

            return;
        }

        $details = $balanceResponse['data'][0]['details'][0] ?? null;

        TradingBalance::query()->updateOrCreate(
            [
                'trading_account_id' => $account->id,
                'asset' => self::CURRENCY,
            ],
            [
                'available_balance' => (string) ($details['availBal'] ?? '0'),
                'locked_balance' => '0.00000000',
            ],
        );

        $openInstIds = [];

        foreach (($positionsResponse['data'] ?? []) as $okxPosition) {
            if (! is_array($okxPosition) || (float) ($okxPosition['pos'] ?? 0) === 0.0) {
                continue;
            }

            $instId = (string) ($okxPosition['instId'] ?? '');
            $openInstIds[] = $instId;

            FuturesPosition::query()
                ->where('trading_account_id', $account->id)
                ->where('exchange_instrument_id', $instId)
                ->where('status', 'OPEN')
                ->update([
                    'mark_price' => (string) ($okxPosition['markPx'] ?? '0'),
                    'liquidation_price' => (string) ($okxPosition['liqPx'] ?? '0'),
                    'unrealized_pnl' => (string) ($okxPosition['upl'] ?? '0'),
                    'current_notional' => (string) ($okxPosition['notionalUsd'] ?? '0'),
                ]);
        }

        // A position OKX no longer reports as open (closed manually on
        // OKX's own site/app, liquidated, etc.) should not stay stuck
        // OPEN in our mirror.
        FuturesPosition::query()
            ->where('trading_account_id', $account->id)
            ->where('status', 'OPEN')
            ->whereNotIn('exchange_instrument_id', $openInstIds === [] ? [''] : $openInstIds)
            ->update([
                'status' => 'CLOSED',
                'close_reason' => 'EXCHANGE_RECONCILED',
                'closed_at' => now(),
            ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function fetchFilledOrder(
        OkxApiClient $client,
        string $instId,
        string $exchangeOrderId,
    ): array {
        if ($exchangeOrderId === '') {
            return [];
        }

        try {
            $response = $client->get('/api/v5/trade/order', [
                'instId' => $instId,
                'ordId' => $exchangeOrderId,
            ]);
        } catch (OkxApiException) {
            return [];
        }

        return $response['data'][0] ?? [];
    }

    /**
     * @return array<string, mixed>
     */
    private function fetchLatestFill(
        OkxApiClient $client,
        ?string $instId,
    ): array {
        if ($instId === null || $instId === '') {
            return [];
        }

        try {
            $response = $client->get('/api/v5/trade/fills', [
                'instType' => 'SWAP',
                'instId' => $instId,
            ]);
        } catch (OkxApiException) {
            return [];
        }

        return $response['data'][0] ?? [];
    }

    private function clientFor(ExchangeConnection $connection): OkxApiClient
    {
        return new OkxApiClient(
            apiKey: (string) $connection->api_key,
            apiSecret: (string) $connection->api_secret,
            passphrase: (string) $connection->passphrase,
            isDemo: (bool) $connection->is_demo,
            rateLimitKey: 'connection:'.$connection->id,
        );
    }

    /**
     * @return array<string, mixed>
     */
    private function snapshotForAccount(TradingAccount $account): array
    {
        $balance = TradingBalance::query()
            ->where('trading_account_id', $account->id)
            ->where('asset', self::CURRENCY)
            ->first();

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
            $usedMargin = $usedMargin->plus($this->decimal($position->margin, 8));
            $unrealizedPnl = $unrealizedPnl->plus($this->decimal($position->unrealized_pnl, 8));
        }

        $usedMargin = $this->scale($usedMargin, 8);
        $unrealizedPnl = $this->scale($unrealizedPnl, 8);

        $availableBalance = $balance === null
            ? $this->decimal('0', 8)
            : $this->decimal($balance->available_balance, 8);

        $totalEquity = $this->scale(
            $availableBalance->plus($usedMargin)->plus($unrealizedPnl),
            8,
        );

        return [
            'mode' => 'live-okx-futures',
            'product' => 'USDT-M-PERPETUAL',
            'storage' => [
                'kind' => 'okx',
                'durable' => true,
            ],
            'model' => [
                'marginMode' => 'ISOLATED',
                'positionMode' => 'ONE_WAY',
                'liquidation' => 'EXCHANGE_REPORTED',
                'fundingSettlement' => true,
            ],
            'sessionId' => $account->external_session_id,
            'user' => $account->user === null
                ? null
                : [
                    'id' => (int) $account->user->id,
                    'name' => $account->user->name,
                    'email' => $account->user->email,
                    'role' => $account->user->role,
                    'isAdmin' => (bool) $account->user->is_admin
                        && in_array($account->user->role, ['ROOT', 'ADMIN'], true),
                    'avatarUrl' => $account->user->avatar_url,
                ],
            'currency' => self::CURRENCY,
            'initialBalance' => null,
            'availableBalance' => $this->number($availableBalance),
            'usedMargin' => $this->number($usedMargin),
            'totalEquity' => $this->number($totalEquity),
            'realizedPnl' => $this->number(
                $balance === null ? $this->decimal('0', 8) : $this->decimal($balance->realized_pnl, 8),
            ),
            'unrealizedPnl' => $this->number($unrealizedPnl),
            'positions' => $positions->map(fn (FuturesPosition $position): array => $this->positionResource($position))->values()->all(),
            'orders' => $orders->map(fn (FuturesOrder $order): array => $this->orderResource($order))->values()->all(),
            'trades' => $executions->map(function (TradingExecution $execution): array {
                /** @var FuturesOrder $order */
                $order = $execution->order;

                return $this->executionResource($execution, $order);
            })->values()->all(),
            'supportedLeverage' => null,
            'feeRate' => null,
            'maintenanceMarginRate' => null,
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
        $unrealizedPnl = $this->decimal($position->unrealized_pnl, 8);
        $roePercent = $margin->isZero()
            ? $this->decimal('0', 4)
            : $unrealizedPnl->dividedBy($margin, 8, RoundingMode::HalfUp)
                ->multipliedBy('100')
                ->toScale(4, RoundingMode::HalfUp);

        return [
            'id' => $position->id,
            'symbol' => $position->symbol,
            'exchangeInstrumentId' => $position->exchange_instrument_id,
            'direction' => $position->direction,
            'marginMode' => 'ISOLATED',
            'leverage' => (int) $position->leverage,
            'margin' => $this->number($margin),
            'quantity' => $this->number($this->decimal($position->quantity, 12)),
            'entryPrice' => $this->number($this->decimal($position->entry_price, 8)),
            'markPrice' => $this->number($this->decimal($position->mark_price, 8)),
            'notional' => $this->number($this->decimal($position->entry_notional, 8)),
            'entryFee' => $this->number($this->decimal($position->entry_fee, 8)),
            'liquidationPrice' => $this->number($this->decimal($position->liquidation_price, 8)),
            'stopLoss' => $this->number($this->decimal($position->stop_loss, 8)),
            'takeProfit' => $this->number($this->decimal($position->take_profit, 8)),
            'maintenanceMarginRate' => $this->number($this->decimal($position->maintenance_margin_rate, 8)),
            'unrealizedPnl' => $this->number($unrealizedPnl),
            'roePercent' => $this->number($roePercent),
            'markProvider' => $position->mark_provider,
            'openedAt' => $position->opened_at?->toIso8601String(),
            'updatedAt' => $position->updated_at?->toIso8601String(),
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
            'exchangeOrderId' => $order->exchange_order_id,
            'exchangeClientOrderId' => $order->exchange_client_order_id,
            'action' => $order->action,
            'direction' => $order->direction,
            'symbol' => $order->symbol,
            'status' => $order->status,
            'marginMode' => 'ISOLATED',
            'leverage' => (int) $order->leverage,
            'margin' => $this->number($this->decimal($order->margin, 8)),
            'quantity' => $this->number($this->decimal($order->quantity, 12)),
            'executedPrice' => $this->number($this->decimal($order->executed_price, 8)),
            'notional' => $this->number($this->decimal($order->notional, 8)),
            'fee' => $this->number($this->decimal($order->fee, 8)),
            'feeRate' => $this->number($this->decimal($order->fee_rate, 8)),
            'reduceOnly' => (bool) $order->reduce_only,
            'quoteProvider' => $order->quote_provider,
            'rejectionCode' => $order->rejection_code,
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
            'exchangeFillId' => $execution->exchange_fill_id,
            'action' => $execution->action,
            'direction' => $execution->direction,
            'symbol' => $execution->symbol,
            'leverage' => (int) $order->leverage,
            'margin' => $this->number($this->decimal($order->margin, 8)),
            'quantity' => $this->number($this->decimal($execution->quantity, 12)),
            'price' => $this->number($this->decimal($execution->price, 8)),
            'entryPrice' => $this->number($this->decimal($execution->entry_price, 8)),
            'notional' => $this->number($this->decimal($execution->notional, 8)),
            'fee' => $this->number($this->decimal($execution->fee, 8)),
            'feeCurrency' => $execution->fee_currency,
            'realizedPnl' => $this->number($this->decimal($execution->realized_pnl, 8)),
            'reason' => $execution->close_reason,
            'executedAt' => $execution->executed_at->toIso8601String(),
        ];
    }

    /**
     * @param array<string, mixed> $input
     * @return array{symbol: string, direction: string, margin: string, leverage: int, stopLoss: string, takeProfit: string, clientOrderId: string}
     */
    private function normalizeOpenRequest(array $input): array
    {
        $symbol = strtoupper(
            preg_replace('/[\s\-_:\/.]+/', '', trim((string) ($input['symbol'] ?? 'BTCUSDT'))) ?? '',
        );

        if (! in_array($symbol, FuturesMarketPriceService::SUPPORTED_SYMBOLS, true)) {
            throw new FuturesTradingException(
                'FUTURES_SYMBOL_NOT_AVAILABLE',
                'The requested Futures symbol is not supported for live trading.',
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
        $stopLoss = $this->inputDecimal($input['stopLoss'] ?? null, 'stopLoss', 8);
        $takeProfit = $this->inputDecimal($input['takeProfit'] ?? null, 'takeProfit', 8);

        $leverage = filter_var($input['leverage'] ?? null, FILTER_VALIDATE_INT);

        if ($leverage === false || $leverage < 1) {
            throw new FuturesTradingException(
                'INVALID_FUTURES_LEVERAGE',
                'leverage must be a positive whole number.',
                400,
            );
        }

        return [
            'symbol' => $symbol,
            'direction' => $direction,
            'margin' => (string) $margin,
            'leverage' => $leverage,
            'stopLoss' => (string) $stopLoss,
            'takeProfit' => (string) $takeProfit,
            'clientOrderId' => $this->clientOrderId($input['clientOrderId'] ?? null, 'live-open-'),
        ];
    }

    /**
     * @param array<string, mixed> $input
     * @return array{positionId: string, clientOrderId: string}
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
            'clientOrderId' => $this->clientOrderId($input['clientOrderId'] ?? null, 'live-close-'),
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

    /**
     * OKX's clOrdId must be alphanumeric only, <=32 chars — the paper
     * engine's "futures-open-<uuid>" format is hyphenated and too long,
     * so this needs its own generator.
     */
    private function exchangeClientOrderId(): string
    {
        return strtoupper(bin2hex(random_bytes(12)));
    }

    private function inputDecimal(mixed $value, string $field, int $scale): BigDecimal
    {
        if (is_float($value)) {
            $value = number_format($value, $scale, '.', '');
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

        if ($raw === '' || ! preg_match('/^\d+(?:\.\d+)?$/', $raw)) {
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
        return BigDecimal::of((string) $value)->toScale($scale, RoundingMode::HalfUp);
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

    /**
     * @param array<string, mixed> $canonicalRequest
     */
    private function requestHash(array $canonicalRequest): string
    {
        return hash(
            'sha256',
            json_encode($canonicalRequest, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES),
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
                'The clientOrderId was already used with a different live trading request.',
                409,
                ['clientOrderId' => $idempotencyKey],
            );
        }

        $response = $record->response_body;

        if (! is_array($response)) {
            throw new FuturesTradingException(
                'FUTURES_IDEMPOTENCY_STATE_INVALID',
                'The saved live trading request is missing its response record.',
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
            'actor_type' => 'LIVE_USER',
            'actor_id' => (string) $account->user_id,
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
}
