<?php

declare(strict_types=1);

namespace Tests\Feature;

use Database\Seeders\RootUserSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

// ZAINEX_CURRENT_ACTIVE_STRATEGY_BORDER_V1

final class FuturesStrategyStatusApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Config::set(
            'intelibrain.internal_token',
            'current-strategy-test-token',
        );

        $this->seed(
            RootUserSeeder::class,
        );
    }

    public function test_free_tier_is_default_when_no_strategy_has_been_activated(): void
    {
        $this
            ->withHeaders($this->headers())
            ->getJson(
                '/api/trading/futures/strategies/current',
            )
            ->assertOk()
            ->assertJsonPath('ok', true)
            ->assertJsonPath(
                'currentStrategy.tier',
                'FREE TIER',
            )
            ->assertJsonPath(
                'currentStrategy.defaulted',
                true,
            )
            ->assertJsonPath(
                'currentStrategy.activationId',
                null,
            )
            ->assertJsonPath(
                'autoTradingEnabled',
                false,
            )
            ->assertJsonPath(
                'automaticOrderCreated',
                false,
            );
    }

    public function test_latest_active_strategy_is_returned(): void
    {
        $account = DB::table(
            'trading_accounts',
        )
            ->whereNotNull('user_id')
            ->where('status', 'ACTIVE')
            ->firstOrFail();

        $now = now();

        DB::table(
            'strategy_activations',
        )->insert([
            [
                'trading_account_id' =>
                    $account->id,
                'user_id' =>
                    $account->user_id,
                'client_request_id' =>
                    (string) Str::uuid(),
                'request_id' =>
                    (string) Str::uuid(),
                'request_hash' =>
                    hash('sha256', 'vip-1'),
                'tier' =>
                    'VIP 1',
                'strategy_name' =>
                    'Guarantrade Fix Rate Strategy',
                'rate_type' =>
                    'FIX RATE',
                'display_rate' =>
                    '1%',
                'allocated_amount' =>
                    '100.00000000',
                'credit_cost' =>
                    5,
                'status' =>
                    'ACTIVE',
                'created_at' =>
                    $now->copy()->subMinute(),
                'updated_at' =>
                    $now->copy()->subMinute(),
            ],
            [
                'trading_account_id' =>
                    $account->id,
                'user_id' =>
                    $account->user_id,
                'client_request_id' =>
                    (string) Str::uuid(),
                'request_id' =>
                    (string) Str::uuid(),
                'request_hash' =>
                    hash('sha256', 'vip-2'),
                'tier' =>
                    'VIP 2',
                'strategy_name' =>
                    'Guarantrade Fix Rate Strategy',
                'rate_type' =>
                    'FIX RATE',
                'display_rate' =>
                    '2%',
                'allocated_amount' =>
                    '200.00000000',
                'credit_cost' =>
                    15,
                'status' =>
                    'ACTIVE',
                'created_at' =>
                    $now,
                'updated_at' =>
                    $now,
            ],
        ]);

        $latestId = DB::table(
            'strategy_activations',
        )
            ->max('id');

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
                'currentStrategy.defaulted',
                false,
            )
            ->assertJsonPath(
                'currentStrategy.activationId',
                $latestId,
            );
    }

    /**
     * @return array<string, string>
     */
    private function headers(): array
    {
        return [
            'X-Zainex-Internal-Token' =>
                'current-strategy-test-token',
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
}