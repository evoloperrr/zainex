<?php

declare(strict_types=1);

namespace Tests\Feature;

use Database\Seeders\RootUserSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

// ZAINEX_STRATEGY_FINAL_RULES_API_TEST_V1_2

final class FuturesStrategyFinalRulesApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Config::set(
            'intelibrain.internal_token',
            'strategy-final-rules-token',
        );

        $this->seed(
            RootUserSeeder::class,
        );

        DB::table('users')
            ->where(
                'email',
                'evoloperr@gmail.com',
            )
            ->update([
                'ai_credits' => 1000,
            ]);
    }

    public function test_strategy_accounting_multiple_activation_and_highest_tier(): void
    {
        $this
            ->activate('VIP 2', '500')
            ->assertCreated();

        $this
            ->activate('VIP 1', '300')
            ->assertCreated()
            ->assertJsonPath(
                'result.account.walletBalance',
                10000,
            )
            ->assertJsonPath(
                'result.account.availableBalance',
                9200,
            )
            ->assertJsonPath(
                'result.account.strategyLockedBalance',
                800,
            )
            ->assertJsonPath(
                'result.account.credits',
                980,
            );

        $this
            ->withHeaders($this->headers())
            ->getJson(
                '/api/trading/futures/strategies/current',
            )
            ->assertOk()
            ->assertJsonPath(
                'currentStrategy.tier',
                'VIP 2',
            )
            ->assertJsonPath(
                'tradingExposure.activationAllowed',
                true,
            );

        self::assertSame(
            2,
            DB::table('strategy_activations')
                ->where('status', 'ACTIVE')
                ->count(),
        );

        self::assertSame(
            10000.0,
            (float) DB::table('users')
                ->where(
                    'email',
                    'evoloperr@gmail.com',
                )
                ->value('wallet_balance'),
        );

        self::assertSame(
            2,
            DB::table('wallet_transactions')
                ->where(
                    'event_type',
                    'STRATEGY_ACTIVATED',
                )
                ->count(),
        );
    }

    public function test_open_position_blocks_activation(): void
    {
        $now = now();

        DB::table('futures_positions')->insert([
            'id' =>
                (string) Str::uuid(),
            'trading_account_id' =>
                $this->accountId(),
            'symbol' =>
                'BTCUSDT',
            'direction' =>
                'LONG',
            'status' =>
                'OPEN',
            'open_slot' =>
                1,
            'position_mode' =>
                'ONE_WAY',
            'margin_mode' =>
                'ISOLATED',
            'leverage' =>
                5,
            'margin' =>
                '100.00000000',
            'quantity' =>
                '0.010000000000',
            'entry_price' =>
                '60000.00000000',
            'mark_price' =>
                '60000.00000000',
            'liquidation_price' =>
                '50000.00000000',
            'stop_loss' =>
                '59000.00000000',
            'take_profit' =>
                '62000.00000000',
            'maintenance_margin_rate' =>
                '0.00500000',
            'entry_notional' =>
                '600.00000000',
            'current_notional' =>
                '600.00000000',
            'unrealized_pnl' =>
                '0.00000000',
            'realized_pnl' =>
                '0.00000000',
            'entry_fee' =>
                '0.30000000',
            'close_fee' =>
                '0.00000000',
            'funding_fee' =>
                '0.00000000',
            'net_pnl' =>
                '0.00000000',
            'mark_provider' =>
                'test',
            'close_reason' =>
                null,
            'version' =>
                1,
            'opened_at' =>
                $now,
            'closed_at' =>
                null,
            'created_at' =>
                $now,
            'updated_at' =>
                $now,
        ]);

        $this
            ->activate('VIP 1', '500')
            ->assertStatus(409)
            ->assertJsonPath(
                'error.code',
                'ACTIVE_TRADING_EXPOSURE',
            )
            ->assertJsonPath(
                'error.details.openPositions',
                1,
            )
            ->assertJsonPath(
                'error.details.activationAllowed',
                false,
            );

        self::assertSame(
            0,
            DB::table(
                'strategy_activations',
            )->count(),
        );
    }

    public function test_pending_order_blocks_activation(): void
    {
        $now = now();

        DB::table('futures_orders')->insert([
            'id' =>
                (string) Str::uuid(),
            'trading_account_id' =>
                $this->accountId(),
            'client_order_id' =>
                'pending-strategy-final-v1-2',
            'symbol' =>
                'BTCUSDT',
            'direction' =>
                'LONG',
            'action' =>
                'OPEN',
            'order_type' =>
                'LIMIT',
            'margin_mode' =>
                'ISOLATED',
            'position_mode' =>
                'ONE_WAY',
            'leverage' =>
                5,
            'margin' =>
                '100.00000000',
            'quantity' =>
                '0.010000000000',
            'requested_price' =>
                '60000.00000000',
            'executed_price' =>
                '0.00000000',
            'notional' =>
                '600.00000000',
            'fee' =>
                '0.00000000',
            'fee_rate' =>
                '0.00050000',
            'stop_loss' =>
                '59000.00000000',
            'take_profit' =>
                '62000.00000000',
            'reduce_only' =>
                false,
            'quote_provider' =>
                'test',
            'status' =>
                'PENDING',
            'rejection_code' =>
                null,
            'filled_at' =>
                null,
            'cancelled_at' =>
                null,
            'created_at' =>
                $now,
            'updated_at' =>
                $now,
        ]);

        $this
            ->activate('VIP 2', '500')
            ->assertStatus(409)
            ->assertJsonPath(
                'error.code',
                'ACTIVE_TRADING_EXPOSURE',
            )
            ->assertJsonPath(
                'error.details.pendingOrders',
                1,
            )
            ->assertJsonPath(
                'error.details.activationAllowed',
                false,
            );

        self::assertSame(
            0,
            DB::table(
                'strategy_activations',
            )->count(),
        );
    }

    private function activate(
        string $tier,
        string $amount,
    ) {
        return $this
            ->withHeaders($this->headers())
            ->postJson(
                '/api/trading/futures/strategies/activate',
                [
                    'tier' =>
                        $tier,
                    'amount' =>
                        $amount,
                    'clientRequestId' =>
                        (string) Str::uuid(),
                ],
            );
    }

    /**
     * @return array<string, string>
     */
    private function headers(): array
    {
        return [
            'X-Zainex-Internal-Token' =>
                'strategy-final-rules-token',
            'X-Zainex-Session-Id' =>
                (string) DB::table(
                    'trading_accounts',
                )
                    ->whereNotNull('user_id')
                    ->where('status', 'ACTIVE')
                    ->value(
                        'external_session_id',
                    ),
            'X-Zainex-Request-Id' =>
                (string) Str::uuid(),
        ];
    }

    private function accountId(): int
    {
        return (int) DB::table(
            'trading_accounts',
        )
            ->whereNotNull('user_id')
            ->where('status', 'ACTIVE')
            ->value('id');
    }
}