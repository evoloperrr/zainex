<?php

declare(strict_types=1);

namespace Tests\Feature;

use Database\Seeders\RootUserSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Tests\TestCase;

// ZAINEX_STRATEGY_LOGS_BELOW_CARDS_V1_1

final class FuturesStrategyLogsApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Config::set(
            'intelibrain.internal_token',
            'strategy-log-test-token',
        );

        $this->seed(
            RootUserSeeder::class,
        );
    }

    public function test_current_strategy_endpoint_returns_newest_activation_logs(): void
    {
        $user = DB::table('users')
            ->whereNotNull('email')
            ->firstOrFail();

        $account = DB::table(
            'trading_accounts',
        )
            ->where(
                'user_id',
                $user->id,
            )
            ->where(
                'status',
                'ACTIVE',
            )
            ->firstOrFail();

        $first = [
            'trading_account_id' =>
                $account->id,
            'user_id' =>
                $user->id,
            'client_request_id' =>
                (string) Str::uuid(),
            'request_id' =>
                (string) Str::uuid(),
            'request_hash' =>
                hash(
                    'sha256',
                    (string) Str::uuid(),
                ),
            'tier' =>
                'VIP 1',
            'strategy_name' =>
                'Guarantrade Fix Rate Strategy',
            'rate_type' =>
                'FIX RATE',
            'display_rate' =>
                '1%',
            'allocated_amount' =>
                '500.00000000',
            'credit_cost' =>
                5,
            'status' =>
                'COMPLETED',
            'created_at' =>
                now()->subMinute(),
            'updated_at' =>
                now()->subMinute(),
        ];

        $second = [
            'trading_account_id' =>
                $account->id,
            'user_id' =>
                $user->id,
            'client_request_id' =>
                (string) Str::uuid(),
            'request_id' =>
                (string) Str::uuid(),
            'request_hash' =>
                hash(
                    'sha256',
                    (string) Str::uuid(),
                ),
            'tier' =>
                'VIP 2',
            'strategy_name' =>
                'Guarantrade Fix Rate Strategy',
            'rate_type' =>
                'FIX RATE',
            'display_rate' =>
                '2%',
            'allocated_amount' =>
                '600.00000000',
            'credit_cost' =>
                15,
            'status' =>
                'ACTIVE',
            'created_at' =>
                now(),
            'updated_at' =>
                now(),
        ];

        if (
            Schema::hasColumn(
                'strategy_activations',
                'active_slot',
            )
        ) {
            $first['active_slot'] = null;
            $second['active_slot'] = 1;
        }

        DB::table(
            'strategy_activations',
        )->insert($first);

        DB::table(
            'strategy_activations',
        )->insert($second);

        $this
            ->withHeaders([
                'X-Zainex-Internal-Token' =>
                    'strategy-log-test-token',
                'X-Zainex-Session-Id' =>
                    $account->external_session_id,
                'X-Zainex-Request-Id' =>
                    (string) Str::uuid(),
            ])
            ->getJson(
                '/api/trading/futures/strategies/current',
            )
            ->assertOk()
            ->assertJsonPath(
                'currentStrategy.tier',
                'VIP 2',
            )
            ->assertJsonCount(
                2,
                'logs',
            )
            ->assertJsonPath(
                'logs.0.tier',
                'VIP 2',
            )
            ->assertJsonPath(
                'logs.0.amount',
                600,
            )
            ->assertJsonPath(
                'logs.0.creditCost',
                15,
            )
            ->assertJsonPath(
                'logs.1.tier',
                'VIP 1',
            )
            ->assertJsonPath(
                'logs.1.status',
                'COMPLETED',
            );
    }
}