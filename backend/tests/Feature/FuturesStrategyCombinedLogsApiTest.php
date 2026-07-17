<?php

declare(strict_types=1);

namespace Tests\Feature;

use Database\Seeders\RootUserSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

// ZAINEX_STRATEGY_COMBINED_LATEST_10_LOGS_TEST_C2_V1

final class FuturesStrategyCombinedLogsApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Config::set(
            'intelibrain.internal_token',
            'strategy-combined-logs-token',
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

    protected function tearDown(): void
    {
        Carbon::setTestNow();

        parent::tearDown();
    }

    public function test_daily_profit_and_activation_are_combined_newest_first(): void
    {
        $start = Carbon::parse(
            '2026-07-01 00:00:00',
        );

        Carbon::setTestNow($start);

        $this
            ->activate('VIP 2', '100')
            ->assertCreated();

        Carbon::setTestNow(
            $start
                ->copy()
                ->addDay()
                ->addSecond(),
        );

        $this
            ->artisan(
                'strategy:accrue-due',
            )
            ->assertExitCode(0);

        $this
            ->withHeaders($this->headers())
            ->getJson(
                '/api/trading/futures/strategies/current',
            )
            ->assertOk()
            ->assertJsonCount(2, 'logs')
            ->assertJsonPath(
                'logs.0.eventType',
                'STRATEGY_DAILY_PROFIT',
            )
            ->assertJsonPath(
                'logs.0.tier',
                'VIP 2',
            )
            ->assertJsonPath(
                'logs.0.amount',
                2,
            )
            ->assertJsonPath(
                'logs.0.dayNumber',
                1,
            )
            ->assertJsonPath(
                'logs.1.eventType',
                'STRATEGY_ACTIVATED',
            )
            ->assertJsonPath(
                'logs.1.amount',
                100,
            )
            ->assertJsonPath(
                'logs.1.creditCost',
                15,
            );
    }

    public function test_completion_release_profit_and_activation_are_all_visible(): void
    {
        $start = Carbon::parse(
            '2026-07-01 00:00:00',
        );

        Carbon::setTestNow($start);

        $this
            ->activate('VIP 1', '100')
            ->assertCreated();

        DB::table('strategy_activations')
            ->update([
                'term_days' => 1,
                'matures_at' =>
                    $start
                        ->copy()
                        ->addDay(),
            ]);

        Carbon::setTestNow(
            $start
                ->copy()
                ->addDay()
                ->addSecond(),
        );

        $this
            ->artisan(
                'strategy:accrue-due',
            )
            ->assertExitCode(0);

        $this
            ->withHeaders($this->headers())
            ->getJson(
                '/api/trading/futures/strategies/current',
            )
            ->assertOk()
            ->assertJsonPath(
                'currentStrategy.tier',
                'FREE TIER',
            )
            ->assertJsonCount(4, 'logs')
            ->assertJsonPath(
                'logs.0.eventType',
                'STRATEGY_COMPLETED',
            )
            ->assertJsonPath(
                'logs.1.eventType',
                'STRATEGY_PRINCIPAL_RELEASED',
            )
            ->assertJsonPath(
                'logs.2.eventType',
                'STRATEGY_DAILY_PROFIT',
            )
            ->assertJsonPath(
                'logs.3.eventType',
                'STRATEGY_ACTIVATED',
            );
    }

    public function test_only_ten_newest_records_are_returned(): void
    {
        $start = Carbon::parse(
            '2026-07-01 00:00:00',
        );

        Carbon::setTestNow($start);

        for ($index = 1; $index <= 12; $index++) {
            $this
                ->activate(
                    'FREE TIER',
                    '100',
                )
                ->assertCreated();
        }

        $latestActivationId =
            (int) DB::table(
                'strategy_activations',
            )->max('id');

        $this
            ->withHeaders($this->headers())
            ->getJson(
                '/api/trading/futures/strategies/current',
            )
            ->assertOk()
            ->assertJsonCount(10, 'logs')
            ->assertJsonPath(
                'logs.0.activationId',
                $latestActivationId,
            )
            ->assertJsonPath(
                'logs.0.eventType',
                'STRATEGY_ACTIVATED',
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
                'strategy-combined-logs-token',
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