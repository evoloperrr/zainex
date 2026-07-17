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

// ZAINEX_STRATEGY_DAILY_ACCRUAL_ENGINE_TEST_C1_V1

final class StrategyDailyAccrualEngineTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Config::set(
            'intelibrain.internal_token',
            'strategy-accrual-test-token',
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

    public function test_two_due_days_are_caught_up_once(): void
    {
        $start = Carbon::parse(
            '2026-07-01 00:00:00',
        );

        Carbon::setTestNow($start);

        $this
            ->activate('VIP 1', '500')
            ->assertCreated();

        Carbon::setTestNow(
            $start
                ->copy()
                ->addDays(2)
                ->addSecond(),
        );

        $this
            ->artisan(
                'strategy:accrue-due',
            )
            ->assertExitCode(0);

        self::assertSame(
            2,
            DB::table(
                'strategy_daily_accruals',
            )->count(),
        );

        self::assertSame(
            2,
            DB::table('wallet_transactions')
                ->where(
                    'event_type',
                    'STRATEGY_DAILY_PROFIT',
                )
                ->count(),
        );

        $activation = DB::table(
            'strategy_activations',
        )->firstOrFail();

        self::assertSame(
            2,
            (int) $activation->paid_days,
        );

        self::assertSame(
            10.0,
            (float)
                $activation->accrued_profit,
        );

        self::assertSame(
            10010.0,
            (float) DB::table('users')
                ->where(
                    'email',
                    'evoloperr@gmail.com',
                )
                ->value('wallet_balance'),
        );

        self::assertSame(
            9510.0,
            (float) DB::table(
                'trading_balances',
            )->value('available_balance'),
        );

        self::assertSame(
            500.0,
            (float) DB::table(
                'trading_balances',
            )->value(
                'strategy_locked_balance',
            ),
        );

        $this
            ->artisan(
                'strategy:accrue-due',
            )
            ->assertExitCode(0);

        self::assertSame(
            2,
            DB::table(
                'strategy_daily_accruals',
            )->count(),
        );

        self::assertSame(
            10010.0,
            (float) DB::table('users')
                ->where(
                    'email',
                    'evoloperr@gmail.com',
                )
                ->value('wallet_balance'),
        );
    }

    public function test_day_thirty_credits_profit_then_releases_principal(): void
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
                ->addDays(30)
                ->addSecond(),
        );

        $this
            ->artisan(
                'strategy:accrue-due',
            )
            ->assertExitCode(0);

        $activation = DB::table(
            'strategy_activations',
        )->firstOrFail();

        self::assertSame(
            'COMPLETED',
            $activation->status,
        );

        self::assertSame(
            30,
            (int) $activation->paid_days,
        );

        self::assertSame(
            60.0,
            (float)
                $activation->accrued_profit,
        );

        self::assertNull(
            $activation->next_accrual_at,
        );

        self::assertNotNull(
            $activation->completed_at,
        );

        self::assertSame(
            30,
            DB::table(
                'strategy_daily_accruals',
            )->count(),
        );

        self::assertSame(
            1,
            DB::table('wallet_transactions')
                ->where(
                    'event_type',
                    'STRATEGY_PRINCIPAL_RELEASED',
                )
                ->count(),
        );

        self::assertSame(
            10060.0,
            (float) DB::table('users')
                ->where(
                    'email',
                    'evoloperr@gmail.com',
                )
                ->value('wallet_balance'),
        );

        self::assertSame(
            10060.0,
            (float) DB::table(
                'trading_balances',
            )->value('available_balance'),
        );

        self::assertSame(
            0.0,
            (float) DB::table(
                'trading_balances',
            )->value(
                'strategy_locked_balance',
            ),
        );
    }

    public function test_completed_highest_tier_falls_back_to_next_active_tier(): void
    {
        $start = Carbon::parse(
            '2026-07-01 00:00:00',
        );

        Carbon::setTestNow($start);

        $this
            ->activate('VIP 1', '100')
            ->assertCreated();

        $this
            ->activate('VIP 3', '100')
            ->assertCreated();

        $vipThreeId = DB::table(
            'strategy_activations',
        )
            ->where('tier', 'VIP 3')
            ->value('id');

        DB::table('strategy_activations')
            ->where('id', $vipThreeId)
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
                'VIP 1',
            );

        self::assertSame(
            'COMPLETED',
            DB::table('strategy_activations')
                ->where('id', $vipThreeId)
                ->value('status'),
        );

        self::assertSame(
            'ACTIVE',
            DB::table('strategy_activations')
                ->where('tier', 'VIP 1')
                ->value('status'),
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
                    'tier' => $tier,
                    'amount' => $amount,
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
                'strategy-accrual-test-token',
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