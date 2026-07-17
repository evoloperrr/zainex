<?php

declare(strict_types=1);

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\TestCase;

// ZAINEX_THREE_LEVEL_REFERRALS_V1

final class ThreeLevelReferralApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Config::set(
            'intelibrain.internal_token',
            'referral-test-token',
        );
    }

    public function test_new_google_user_gets_permanent_inviter(): void
    {
        $firstInviter = $this->user(
            'First Inviter',
            'first@example.com',
            'ZXFIRST001',
        );

        $secondInviter = $this->user(
            'Second Inviter',
            'second@example.com',
            'ZXSECOND01',
        );

        $response = $this
            ->withHeader(
                'X-Zainex-Internal-Token',
                'referral-test-token',
            )
            ->postJson(
                '/api/auth/google-link',
                [
                    'email' =>
                        'new@example.com',
                    'name' =>
                        'New Member',
                    'referralCode' =>
                        'ZXFIRST001',
                ],
            );

        $response
            ->assertCreated()
            ->assertJsonPath(
                'referral.attributed',
                true,
            )
            ->assertJsonPath(
                'referral.inviterId',
                $firstInviter,
            );

        $newUser = DB::table('users')
            ->where(
                'email',
                'new@example.com',
            )
            ->first();

        self::assertNotNull($newUser);
        self::assertSame(
            $firstInviter,
            (int) $newUser->inviter_id,
        );

        $this
            ->withHeader(
                'X-Zainex-Internal-Token',
                'referral-test-token',
            )
            ->postJson(
                '/api/auth/google-link',
                [
                    'email' =>
                        'new@example.com',
                    'name' =>
                        'New Member',
                    'referralCode' =>
                        'ZXSECOND01',
                ],
            )
            ->assertOk();

        $newUserAfter = DB::table('users')
            ->where(
                'email',
                'new@example.com',
            )
            ->first();

        self::assertSame(
            $firstInviter,
            (int)
                $newUserAfter
                    ->inviter_id,
        );

        self::assertNotSame(
            $secondInviter,
            (int)
                $newUserAfter
                    ->inviter_id,
        );
    }

    public function test_invalid_code_does_not_block_creation(): void
    {
        $this
            ->withHeader(
                'X-Zainex-Internal-Token',
                'referral-test-token',
            )
            ->postJson(
                '/api/auth/google-link',
                [
                    'email' =>
                        'independent@example.com',
                    'name' =>
                        'Independent Member',
                    'referralCode' =>
                        'ZXNOTFOUND',
                ],
            )
            ->assertCreated()
            ->assertJsonPath(
                'referral.attributed',
                false,
            );

        $user = DB::table('users')
            ->where(
                'email',
                'independent@example.com',
            )
            ->first();

        self::assertNotNull($user);
        self::assertNull(
            $user->inviter_id,
        );
    }

    public function test_network_stops_after_third_level(): void
    {
        $root = $this->user(
            'Root',
            'root-network@example.com',
            'ZXROOT001',
        );

        $levelOne = $this->user(
            'Level One',
            'l1@example.com',
            'ZXLVL1001',
            $root,
        );

        $levelTwo = $this->user(
            'Level Two',
            'l2@example.com',
            'ZXLVL2001',
            $levelOne,
        );

        $levelThree = $this->user(
            'Level Three',
            'l3@example.com',
            'ZXLVL3001',
            $levelTwo,
        );

        $levelFour = $this->user(
            'Level Four',
            'l4@example.com',
            'ZXLVL4001',
            $levelThree,
        );

        $sessionId =
            (string) Str::uuid();

        $this->account(
            $root,
            $sessionId,
        );

        $response = $this
            ->withHeaders([
                'X-Zainex-Internal-Token' =>
                    'referral-test-token',
                'X-Zainex-Session-Id' =>
                    $sessionId,
            ])
            ->getJson(
                '/api/referrals/network',
            );

        $response
            ->assertOk()
            ->assertJsonPath(
                'maxDepth',
                3,
            )
            ->assertJsonPath(
                'levelFourIncluded',
                false,
            )
            ->assertJsonPath(
                'totalMembers',
                3,
            )
            ->assertJsonPath(
                'levels.0.members.0.id',
                $levelOne,
            )
            ->assertJsonPath(
                'levels.1.members.0.id',
                $levelTwo,
            )
            ->assertJsonPath(
                'levels.2.members.0.id',
                $levelThree,
            )
            ->assertJsonMissing([
                'id' => $levelFour,
            ]);
    }

    private function user(
        string $name,
        string $email,
        string $referralCode,
        ?int $inviterId = null,
    ): int {
        $now = now();

        return DB::table('users')
            ->insertGetId([
                'name' => $name,
                'email' => $email,
                'email_verified_at' =>
                    $now,
                'password' =>
                    Hash::make(
                        Str::random(40),
                    ),
                'remember_token' => null,
                'wallet_balance' =>
                    '0.00000000',
                'inviter_id' =>
                    $inviterId,
                'referral_code' =>
                    $referralCode,
                'referred_at' =>
                    $inviterId === null
                        ? null
                        : $now,
                'role' => 'USER',
                'avatar_url' => null,
                'ai_credits' => 0,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
    }

    private function account(
        int $userId,
        string $sessionId,
    ): void {
        $now = now();

        $accountId = DB::table(
            'trading_accounts',
        )->insertGetId([
            'user_id' => $userId,
            'external_session_id' =>
                $sessionId,
            'account_type' => 'PAPER',
            'mode' => 'UNIFIED_PAPER',
            'base_asset' => 'USDT',
            'status' => 'ACTIVE',
            'starting_balance' =>
                '0.00000000',
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        DB::table(
            'trading_balances',
        )->insert([
            'trading_account_id' =>
                $accountId,
            'asset' => 'USDT',
            'available_balance' =>
                '0.00000000',
            'locked_balance' =>
                '0.00000000',
            'realized_pnl' =>
                '0.00000000',
            'strategy_locked_balance' =>
                '0.00000000',
            'created_at' => $now,
            'updated_at' => $now,
        ]);
    }
}