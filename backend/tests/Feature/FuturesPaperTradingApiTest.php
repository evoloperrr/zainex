<?php

// ZAINEX_DB_PHASE2B1_LARAVEL_FUTURES_ENGINE_V1_1

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

final class FuturesPaperTradingApiTest extends TestCase
{
    use RefreshDatabase;

    private const TOKEN = 'phase2b-test-token';
    private const SESSION = '11111111-1111-4111-8111-111111111111';
    private const REQUEST = '22222222-2222-4222-8222-222222222222';

    protected function setUp(): void
    {
        parent::setUp();

        config()->set(
            'intelibrain.internal_token',
            self::TOKEN,
        );
    }

    public function test_account_is_created_in_database_and_is_durable(): void
    {
        $response = $this
            ->withHeaders($this->headers())
            ->getJson('/api/trading/futures/account');

        $response
            ->assertOk()
            ->assertJsonPath('ok', true)
            ->assertJsonPath('mode', 'paper-futures')
            ->assertJsonPath('liveTrading', false)
            ->assertJsonPath('account.storage.kind', 'database')
            ->assertJsonPath('account.storage.durable', true)
            ->assertJsonPath('account.availableBalance', 10000)
            ->assertJsonPath('account.usedMargin', 0)
            ->assertJsonPath('account.realizedPnl', 0);

        $this->assertDatabaseHas('trading_accounts', [
            'external_session_id' => self::SESSION,
            'account_type' => 'PAPER',
            'mode' => 'UNIFIED_PAPER',
            'base_asset' => 'USDT',
            'status' => 'ACTIVE',
        ]);

        $this->assertDatabaseHas('trading_balances', [
            'asset' => 'USDT',
            'available_balance' => 10000,
            'locked_balance' => 0,
            'realized_pnl' => 0,
        ]);
    }

    public function test_open_replay_and_manual_close_are_atomic_and_persistent(): void
    {
        $this->fakePrice('100000.00000000');

        $openPayload = [
            'symbol' => 'BTCUSDT',
            'direction' => 'LONG',
            'margin' => '100.00000000',
            'leverage' => 10,
            'stopLoss' => '95000.00000000',
            'takeProfit' => '110000.00000000',
            'clientOrderId' => 'phase2b-open-0001',
        ];

        $open = $this
            ->withHeaders($this->headers())
            ->postJson(
                '/api/trading/futures/orders',
                $openPayload,
            );

        $open
            ->assertCreated()
            ->assertJsonPath('ok', true)
            ->assertJsonPath('result.idempotentReplay', false)
            ->assertJsonPath('result.account.storage.kind', 'database')
            ->assertJsonPath('result.account.storage.durable', true)
            ->assertJsonPath('result.order.action', 'OPEN')
            ->assertJsonPath('result.order.reduceOnly', false)
            ->assertJsonPath('result.trade.reason', 'USER_OPEN');

        $positionId = (string) $open->json(
            'result.account.positions.0.id',
        );

        self::assertNotSame('', $positionId);

        $this->assertDatabaseCount('futures_positions', 1);
        $this->assertDatabaseCount('futures_orders', 1);
        $this->assertDatabaseCount('trading_executions', 1);
        $this->assertDatabaseCount('idempotency_records', 1);
        $this->assertDatabaseCount('trading_audit_logs', 1);

        $replay = $this
            ->withHeaders($this->headers())
            ->postJson(
                '/api/trading/futures/orders',
                $openPayload,
            );

        $replay
            ->assertOk()
            ->assertJsonPath('result.idempotentReplay', true)
            ->assertJsonPath(
                'result.order.id',
                $open->json('result.order.id'),
            );

        $this->assertDatabaseCount('futures_positions', 1);
        $this->assertDatabaseCount('futures_orders', 1);
        $this->assertDatabaseCount('trading_executions', 1);

        $this->fakePrice('101000.00000000');

        $close = $this
            ->withHeaders($this->headers())
            ->postJson(
                '/api/trading/futures/close',
                [
                    'positionId' => $positionId,
                    'clientOrderId' => 'phase2b-close-0001',
                ],
            );

        $close
            ->assertCreated()
            ->assertJsonPath('ok', true)
            ->assertJsonPath('result.idempotentReplay', false)
            ->assertJsonPath('result.order.action', 'CLOSE')
            ->assertJsonPath('result.order.reduceOnly', true)
            ->assertJsonPath('result.trade.reason', 'USER_CLOSE')
            ->assertJsonCount(0, 'result.account.positions');

        $this->assertDatabaseCount('futures_orders', 2);
        $this->assertDatabaseCount('trading_executions', 2);
        $this->assertDatabaseCount('idempotency_records', 2);
        $this->assertDatabaseCount('trading_audit_logs', 2);

        $this->assertDatabaseHas('futures_positions', [
            'id' => $positionId,
            'status' => 'CLOSED',
            'open_slot' => null,
            'close_reason' => 'USER_CLOSE',
        ]);

        $account = $this
            ->withHeaders($this->headers())
            ->getJson('/api/trading/futures/account');

        $account
            ->assertOk()
            ->assertJsonPath('account.storage.kind', 'database')
            ->assertJsonCount(0, 'account.positions')
            ->assertJsonCount(2, 'account.orders')
            ->assertJsonCount(2, 'account.trades');
    }

    public function test_invalid_risk_guard_is_rejected_without_trading_rows(): void
    {
        $this->fakePrice('100000.00000000');

        $response = $this
            ->withHeaders($this->headers())
            ->postJson(
                '/api/trading/futures/orders',
                [
                    'symbol' => 'BTCUSDT',
                    'direction' => 'LONG',
                    'margin' => '100',
                    'leverage' => 10,
                    'stopLoss' => '80000',
                    'takeProfit' => '110000',
                    'clientOrderId' => 'phase2b-invalid-risk',
                ],
            );

        $response
            ->assertStatus(400)
            ->assertJsonPath('ok', false)
            ->assertJsonPath(
                'error.code',
                'INVALID_FUTURES_RISK_GUARD',
            );

        $this->assertDatabaseCount('futures_orders', 0);
        $this->assertDatabaseCount('futures_positions', 0);
        $this->assertDatabaseCount('trading_executions', 0);
    }

    public function test_account_refresh_closes_stop_loss_before_take_profit(): void
    {
        Http::fakeSequence()
            ->push(
                [
                    'symbol' => 'BTCUSDT',
                    'price' => '100000.00000000',
                ],
                200,
            )
            ->push(
                [
                    'symbol' => 'BTCUSDT',
                    'price' => '94000.00000000',
                ],
                200,
            );

        $open = $this
            ->withHeaders($this->headers())
            ->postJson(
                '/api/trading/futures/orders',
                [
                    'symbol' => 'BTCUSDT',
                    'direction' => 'LONG',
                    'margin' => '100',
                    'leverage' => 10,
                    'stopLoss' => '95000',
                    'takeProfit' => '110000',
                    'clientOrderId' => 'phase2b-auto-stop-open',
                ],
            )
            ->assertCreated()
            ->assertJsonPath('ok', true);

        $positionId = (string) $open->json(
            'result.account.positions.0.id',
        );

        self::assertNotSame('', $positionId);

        $refresh = $this
            ->withHeaders($this->headers())
            ->getJson('/api/trading/futures/account');

        $refresh
            ->assertOk()
            ->assertJsonPath('ok', true)
            ->assertJsonCount(0, 'account.positions')
            ->assertJsonPath(
                'account.trades.0.reason',
                'STOP_LOSS',
            );

        $this->assertDatabaseHas('futures_positions', [
            'id' => $positionId,
            'status' => 'CLOSED',
            'close_reason' => 'STOP_LOSS',
            'open_slot' => null,
        ]);
    }

    public function test_internal_token_is_required(): void
    {
        $response = $this
            ->withHeaders([
                'X-Zainex-Session-Id' => self::SESSION,
                'X-Zainex-Request-Id' => self::REQUEST,
            ])
            ->getJson('/api/trading/futures/account');

        $response
            ->assertUnauthorized()
            ->assertJsonPath(
                'error.code',
                'FUTURES_BACKEND_UNAUTHORIZED',
            );
    }

    /**
     * @return array<string, string>
     */
    private function headers(): array
    {
        return [
            'Accept' => 'application/json',
            'Content-Type' => 'application/json',
            'X-Zainex-Internal-Token' => self::TOKEN,
            'X-Zainex-Session-Id' => self::SESSION,
            'X-Zainex-Request-Id' => self::REQUEST,
        ];
    }

    private function fakePrice(string $price): void
    {
        Http::fake([
            'data-api.binance.vision/*' => Http::response(
                [
                    'symbol' => 'BTCUSDT',
                    'price' => $price,
                ],
                200,
            ),
            '*' => Http::response([], 503),
        ]);
    }
}
