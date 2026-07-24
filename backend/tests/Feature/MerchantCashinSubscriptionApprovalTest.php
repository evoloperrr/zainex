<?php

declare(strict_types=1);

namespace Tests\Feature;

use Brick\Math\BigDecimal;
use Brick\Math\RoundingMode;
use Database\Seeders\RootUserSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\TestCase;

// ZAINEX_UNIFIED_BILLING_V1

final class MerchantCashinSubscriptionApprovalTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Config::set(
            'intelibrain.internal_token',
            'unified-billing-test-token',
        );

        $this->seed(RootUserSeeder::class);
    }

    public function test_approving_a_bundled_subscription_grants_vip_credits_only_the_top_up_and_pays_both_referral_rewards(): void
    {
        $level3 = $this->createUser('Referral Level 3');
        $level2 = $this->createUser('Referral Level 2', $level3);
        $level1 = $this->createUser('Referral Level 1', $level2);
        $target = $this->createUser('Subscriber', $level1);
        $accountId = $this->createTradingAccount($target);

        $cashinId = DB::table('merchant_cashins')->insertGetId([
            'user_id' => $target,
            'trading_account_id' => $accountId,
            'purpose' => 'subscription',
            'plan_name' => 'VIP 2',
            'billing_cycle' => 'monthly',
            'amount' => '515.00',
            'wallet_top_up_amount' => '500.00',
            'proof_image' => null,
            'status' => 'pending',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $response = $this
            ->withHeaders($this->rootHeaders())
            ->postJson("/api/admin/merchant-cashins/{$cashinId}/approve");

        $response
            ->assertOk()
            ->assertJsonPath('ok', true)
            ->assertJsonPath('vip.user.vipTier', 'VIP 2');

        $targetRow = DB::table('users')->where('id', $target)->first();

        self::assertSame('VIP 2', $targetRow->vip_tier);
        self::assertNotNull($targetRow->vip_expires_at);

        // Wallet gets ONLY the $500 top-up, never the $15 subscription fee.
        self::assertSame('500.00000000', $this->wallet($target));

        // Level 1 gets 10% of the $500 top-up = $50.
        self::assertSame('50.00000000', $this->wallet($level1));

        // 25/15/5 three-level unilevel on the $15 subscription portion.
        self::assertSame('3.75000000', $this->referralCredit($level1));
        self::assertSame('2.25000000', $this->referralCredit($level2));
        self::assertSame('0.75000000', $this->referralCredit($level3));

        self::assertSame(
            'approved',
            DB::table('merchant_cashins')->where('id', $cashinId)->value('status'),
        );

        // Re-approving is blocked at the endpoint level — no double payout.
        $this
            ->withHeaders($this->rootHeaders())
            ->postJson("/api/admin/merchant-cashins/{$cashinId}/approve")
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'MERCHANT_CASHIN_ALREADY_REVIEWED');

        self::assertSame('500.00000000', $this->wallet($target));
        self::assertSame('50.00000000', $this->wallet($level1));
    }

    public function test_subscription_only_cashin_with_no_wallet_top_up_grants_vip_and_pays_only_the_unilevel_reward(): void
    {
        $level1 = $this->createUser('Solo Referral Level 1');
        $target = $this->createUser('Solo Subscriber', $level1);
        $accountId = $this->createTradingAccount($target);

        $cashinId = DB::table('merchant_cashins')->insertGetId([
            'user_id' => $target,
            'trading_account_id' => $accountId,
            'purpose' => 'subscription',
            'plan_name' => 'VIP 1',
            'billing_cycle' => 'monthly',
            'amount' => '5.00',
            'wallet_top_up_amount' => '0.00',
            'proof_image' => null,
            'status' => 'pending',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this
            ->withHeaders($this->rootHeaders())
            ->postJson("/api/admin/merchant-cashins/{$cashinId}/approve")
            ->assertOk()
            ->assertJsonPath('vip.user.vipTier', 'VIP 1');

        self::assertSame('0.00000000', $this->wallet($target));
        self::assertSame('0.00000000', $this->wallet($level1));

        // 25% of $5 subscription = $1.25.
        self::assertSame('1.25000000', $this->referralCredit($level1));
    }

    private function createUser(string $name, ?int $inviterId = null): int
    {
        $now = now();

        return (int) DB::table('users')->insertGetId([
            'name' => $name,
            'email' => Str::lower((string) Str::uuid()).'@example.test',
            'email_verified_at' => $now,
            'password' => Hash::make('password'),
            'remember_token' => null,
            'wallet_balance' => '0.00000000',
            'inviter_id' => $inviterId,
            'role' => 'USER',
            'is_admin' => false,
            'avatar_url' => null,
            'ai_credits' => 0,
            'referral_code' => 'T'.strtoupper(substr(str_replace('-', '', (string) Str::uuid()), 0, 11)),
            'referred_at' => $inviterId !== null ? $now : null,
            'referral_credit_balance' => '0.00000000',
            'created_at' => $now,
            'updated_at' => $now,
        ]);
    }

    private function createTradingAccount(int $userId): int
    {
        $now = now();

        $accountId = DB::table('trading_accounts')->insertGetId([
            'user_id' => $userId,
            'external_session_id' => (string) Str::uuid(),
            'account_type' => 'PAPER',
            'mode' => 'UNIFIED_PAPER',
            'base_asset' => 'USDT',
            'status' => 'ACTIVE',
            'starting_balance' => '0.00000000',
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        DB::table('trading_balances')->insert([
            'trading_account_id' => $accountId,
            'asset' => 'USDT',
            'available_balance' => '0.00000000',
            'locked_balance' => '0.00000000',
            'realized_pnl' => '0.00000000',
            'strategy_locked_balance' => '0.00000000',
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        return $accountId;
    }

    /**
     * @return array<string, string>
     */
    private function rootHeaders(): array
    {
        return [
            'X-Zainex-Internal-Token' => 'unified-billing-test-token',
            'X-Zainex-Session-Id' => RootUserSeeder::TRADING_SESSION_ID,
            'X-Zainex-Request-Id' => (string) Str::uuid(),
        ];
    }

    private function wallet(int $userId): string
    {
        return (string) BigDecimal::of(
            (string) DB::table('users')->where('id', $userId)->value('wallet_balance'),
        )->toScale(8, RoundingMode::Down);
    }

    private function referralCredit(int $userId): string
    {
        return (string) BigDecimal::of(
            (string) DB::table('users')->where('id', $userId)->value('referral_credit_balance'),
        )->toScale(8, RoundingMode::Down);
    }
}
