<?php

declare(strict_types=1);

namespace Tests\Feature;

use Database\Seeders\RootUserSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\TestCase;

// ZAINEX_STRATEGY_DIRECT_INVITER_INCOME_V1

final class StrategyReferralIncomeTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Config::set(
            'intelibrain.internal_token',
            'strategy-referral-test-token',
        );
        Config::set(
            'referral_rewards.strategy_trading_amount_rate_bps',
            1000,
        );

        $this->seed(RootUserSeeder::class);

        DB::table('users')
            ->where('email', RootUserSeeder::EMAIL)
            ->update(['ai_credits' => 1000]);
    }

    public function test_direct_inviter_receives_ten_percent_of_trading_amount_once(): void
    {
        $inviterId = $this->createInviter();
        $sourceUserId = (int) DB::table('users')
            ->where('email', RootUserSeeder::EMAIL)
            ->value('id');

        DB::table('users')
            ->where('id', $sourceUserId)
            ->update([
                'inviter_id' => $inviterId,
                'referred_at' => now(),
            ]);

        $clientRequestId = (string) Str::uuid();
        $payload = [
            'tier' => 'VIP 1',
            'amount' => 500,
            'clientRequestId' => $clientRequestId,
        ];

        $this
            ->withHeaders($this->headers())
            ->postJson(
                '/api/trading/futures/strategies/activate',
                $payload,
            )
            ->assertCreated();

        self::assertSame(
            150.0,
            (float) DB::table('users')
                ->where('id', $inviterId)
                ->value('wallet_balance'),
        );
        self::assertSame(
            150.0,
            (float) DB::table('trading_balances as balance')
                ->join(
                    'trading_accounts as account',
                    'account.id',
                    '=',
                    'balance.trading_account_id',
                )
                ->where('account.user_id', $inviterId)
                ->value('balance.available_balance'),
        );

        $income = DB::table('wallet_transactions')
            ->where('user_id', $inviterId)
            ->where('event_type', 'STRATEGY_REFERRAL_INCOME')
            ->firstOrFail();

        self::assertSame(50.0, (float) $income->amount);
        self::assertSame(100.0, (float) $income->wallet_balance_before);
        self::assertSame(150.0, (float) $income->wallet_balance_after);
        self::assertSame(100.0, (float) $income->available_balance_before);
        self::assertSame(150.0, (float) $income->available_balance_after);

        $metadata = json_decode(
            (string) $income->metadata,
            true,
            flags: JSON_THROW_ON_ERROR,
        );

        self::assertSame(10, $metadata['percentage']);
        self::assertSame('500.00000000', $metadata['tradingAmount']);

        $inviterSession = (string) DB::table('trading_accounts')
            ->where('user_id', $inviterId)
            ->value('external_session_id');

        $this
            ->withHeaders([
                'X-Zainex-Internal-Token' => 'strategy-referral-test-token',
                'X-Zainex-Session-Id' => $inviterSession,
                'X-Zainex-Request-Id' => (string) Str::uuid(),
            ])
            ->getJson('/api/trading/futures/strategies/current')
            ->assertOk()
            ->assertJsonPath('logs.0.eventType', 'STRATEGY_REFERRAL_INCOME')
            ->assertJsonPath('logs.0.amount', 50)
            ->assertJsonPath('logs.0.referralPercentage', 10)
            ->assertJsonPath('logs.0.referralSourceAmount', 500);

        $this
            ->withHeaders([
                'X-Zainex-Internal-Token' => 'strategy-referral-test-token',
                'X-Zainex-Session-Id' => $inviterSession,
                'X-Zainex-Request-Id' => (string) Str::uuid(),
            ])
            ->getJson('/api/referrals/network')
            ->assertOk()
            ->assertJsonPath('strategyIncomeReport.ratePercentage', 10)
            ->assertJsonPath('strategyIncomeReport.totalIncome', 50)
            ->assertJsonPath(
                'strategyIncomeReport.creditedActivations',
                1,
            )
            ->assertJsonPath(
                'strategyIncomeReport.recent.0.sourceUser.id',
                $sourceUserId,
            )
            ->assertJsonPath(
                'strategyIncomeReport.recent.0.tier',
                'VIP 1',
            )
            ->assertJsonPath(
                'strategyIncomeReport.recent.0.tradingAmount',
                500,
            )
            ->assertJsonPath(
                'strategyIncomeReport.recent.0.percentage',
                10,
            )
            ->assertJsonPath(
                'strategyIncomeReport.recent.0.incomeAmount',
                50,
            )
            ->assertJsonPath(
                'strategyIncomeReport.recent.0.walletBalanceAfter',
                150,
            );

        $this
            ->withHeaders($this->headers())
            ->postJson(
                '/api/trading/futures/strategies/activate',
                $payload,
            )
            ->assertOk()
            ->assertJsonPath('result.idempotentReplay', true);

        self::assertSame(
            1,
            DB::table('wallet_transactions')
                ->where('user_id', $inviterId)
                ->where('event_type', 'STRATEGY_REFERRAL_INCOME')
                ->count(),
        );
        self::assertSame(
            150.0,
            (float) DB::table('users')
                ->where('id', $inviterId)
                ->value('wallet_balance'),
        );
    }

    public function test_activation_without_inviter_creates_no_referral_income(): void
    {
        $this
            ->withHeaders($this->headers())
            ->postJson(
                '/api/trading/futures/strategies/activate',
                [
                    'tier' => 'FREE TIER',
                    'amount' => 100,
                    'clientRequestId' => (string) Str::uuid(),
                ],
            )
            ->assertCreated();

        self::assertSame(
            0,
            DB::table('wallet_transactions')
                ->where('event_type', 'STRATEGY_REFERRAL_INCOME')
                ->count(),
        );
    }

    public function test_backfill_credits_previous_qualifying_activation_once(): void
    {
        $inviterId = $this->createInviter();
        $sourceUserId = (int) DB::table('users')
            ->where('email', RootUserSeeder::EMAIL)
            ->value('id');

        DB::table('users')
            ->where('id', $sourceUserId)
            ->update([
                'inviter_id' => $inviterId,
                'referred_at' => now(),
            ]);

        Config::set(
            'referral_rewards.strategy_trading_amount_rate_bps',
            0,
        );

        $this
            ->withHeaders($this->headers())
            ->postJson(
                '/api/trading/futures/strategies/activate',
                [
                    'tier' => 'VIP 2',
                    'amount' => 100,
                    'clientRequestId' => (string) Str::uuid(),
                ],
            )
            ->assertCreated();

        self::assertSame(
            0,
            DB::table('wallet_transactions')
                ->where('event_type', 'STRATEGY_REFERRAL_INCOME')
                ->count(),
        );

        Config::set(
            'referral_rewards.strategy_trading_amount_rate_bps',
            1000,
        );

        $this
            ->artisan('strategy:backfill-referral-income')
            ->assertExitCode(0);

        self::assertSame(
            110.0,
            (float) DB::table('users')
                ->where('id', $inviterId)
                ->value('wallet_balance'),
        );
        self::assertSame(
            110.0,
            (float) DB::table('trading_balances as balance')
                ->join(
                    'trading_accounts as account',
                    'account.id',
                    '=',
                    'balance.trading_account_id',
                )
                ->where('account.user_id', $inviterId)
                ->value('balance.available_balance'),
        );
        self::assertSame(
            10.0,
            (float) DB::table('wallet_transactions')
                ->where('event_type', 'STRATEGY_REFERRAL_INCOME')
                ->value('amount'),
        );

        $this
            ->artisan('strategy:backfill-referral-income')
            ->assertExitCode(0);

        self::assertSame(
            1,
            DB::table('wallet_transactions')
                ->where('event_type', 'STRATEGY_REFERRAL_INCOME')
                ->count(),
        );
        self::assertSame(
            110.0,
            (float) DB::table('users')
                ->where('id', $inviterId)
                ->value('wallet_balance'),
        );
    }

    private function createInviter(): int
    {
        $now = now();
        $inviterId = (int) DB::table('users')->insertGetId([
            'name' => 'Direct Inviter',
            'email' => 'direct-inviter@example.test',
            'email_verified_at' => $now,
            'password' => Hash::make('password'),
            'wallet_balance' => '100.00000000',
            'ai_credits' => 0,
            'role' => 'USER',
            'is_admin' => false,
            'referral_code' => 'DIRECTINVITER',
            'referral_credit_balance' => '0.00000000',
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        $accountId = DB::table('trading_accounts')->insertGetId([
            'user_id' => $inviterId,
            'external_session_id' => (string) Str::uuid(),
            'account_type' => 'PAPER',
            'mode' => 'UNIFIED_PAPER',
            'base_asset' => 'USDT',
            'status' => 'ACTIVE',
            'starting_balance' => '100.00000000',
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        DB::table('trading_balances')->insert([
            'trading_account_id' => $accountId,
            'asset' => 'USDT',
            'available_balance' => '100.00000000',
            'locked_balance' => '0.00000000',
            'realized_pnl' => '0.00000000',
            'strategy_locked_balance' => '0.00000000',
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        return $inviterId;
    }

    /**
     * @return array<string, string>
     */
    private function headers(): array
    {
        return [
            'X-Zainex-Internal-Token' => 'strategy-referral-test-token',
            'X-Zainex-Session-Id' => RootUserSeeder::TRADING_SESSION_ID,
            'X-Zainex-Request-Id' => (string) Str::uuid(),
        ];
    }
}
