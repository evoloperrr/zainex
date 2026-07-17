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
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Tests\TestCase;

// ZAINEX_REFERRAL_REWARD_PERCENTAGES_V1

final class ReferralRewardDistributionTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Config::set(
            'intelibrain.internal_token',
            'referral-reward-test-token',
        );

        $this->seed(
            RootUserSeeder::class,
        );
    }

    public function test_credit_purchase_pays_exact_three_levels_once(): void
    {
        [
            $source,
            $level1,
            $level2,
            $level3,
            $level4,
        ] = $this->createReferralChain();

        $clientRequestId =
            (string) Str::uuid();

        $payload = [
            'amount' => 100,
            'clientRequestId' =>
                $clientRequestId,
        ];

        $first = $this
            ->withHeaders(
                $this->headers(),
            )
            ->postJson(
                '/api/trading/futures/wallet/convert',
                $payload,
            );

        $first
            ->assertCreated()
            ->assertJsonPath(
                'ok',
                true,
            );

        self::assertSame(
            '25.00000000',
            $this->balance($level1),
        );

        self::assertSame(
            '15.00000000',
            $this->balance($level2),
        );

        self::assertSame(
            '5.00000000',
            $this->balance($level3),
        );

        self::assertSame(
            '0.00000000',
            $this->balance($level4),
        );

        self::assertSame(
            '45.00000000',
            $this->totalRewards($source),
        );

        self::assertSame(
            3,
            DB::table(
                'referral_rewards',
            )->count(),
        );

        self::assertSame(
            [
                2500,
                1500,
                500,
            ],
            DB::table(
                'referral_rewards',
            )
                ->orderBy('level')
                ->pluck('rate_bps')
                ->map(
                    static fn (
                        mixed $value,
                    ): int =>
                        (int) $value,
                )
                ->all(),
        );

        $replay = $this
            ->withHeaders(
                $this->headers(),
            )
            ->postJson(
                '/api/trading/futures/wallet/convert',
                $payload,
            );

        $replay
            ->assertOk()
            ->assertJsonPath(
                'ok',
                true,
            );

        self::assertSame(
            3,
            DB::table(
                'referral_rewards',
            )->count(),
        );

        self::assertSame(
            '45.00000000',
            $this->totalRewards($source),
        );
    }

    public function test_fractional_rewards_are_not_rounded_away(): void
    {
        [
            ,
            $level1,
            $level2,
            $level3,
            $level4,
        ] = $this->createReferralChain();

        $response = $this
            ->withHeaders(
                $this->headers(),
            )
            ->postJson(
                '/api/trading/futures/wallet/convert',
                [
                    'amount' => 5,

                    'clientRequestId' =>
                        (string)
                            Str::uuid(),
                ],
            );

        $response
            ->assertCreated()
            ->assertJsonPath(
                'ok',
                true,
            );

        self::assertSame(
            '1.25000000',
            $this->balance($level1),
        );

        self::assertSame(
            '0.75000000',
            $this->balance($level2),
        );

        self::assertSame(
            '0.25000000',
            $this->balance($level3),
        );

        self::assertSame(
            '0.00000000',
            $this->balance($level4),
        );
    }

    /**
     * @return array{int, int, int, int, int}
     */
    private function createReferralChain(): array
    {
        $source =
            (int)
                DB::table('users')
                    ->where(
                        'email',
                        RootUserSeeder::EMAIL,
                    )
                    ->value('id');

        $level1 =
            $this->createUser(
                'Referral Level 1',
            );

        $level2 =
            $this->createUser(
                'Referral Level 2',
            );

        $level3 =
            $this->createUser(
                'Referral Level 3',
            );

        $level4 =
            $this->createUser(
                'Referral Level 4',
            );

        DB::table('users')
            ->where('id', $source)
            ->update([
                'inviter_id' =>
                    $level1,
            ]);

        DB::table('users')
            ->where('id', $level1)
            ->update([
                'inviter_id' =>
                    $level2,
            ]);

        DB::table('users')
            ->where('id', $level2)
            ->update([
                'inviter_id' =>
                    $level3,
            ]);

        DB::table('users')
            ->where('id', $level3)
            ->update([
                'inviter_id' =>
                    $level4,
            ]);

        return [
            $source,
            $level1,
            $level2,
            $level3,
            $level4,
        ];
    }

    private function createUser(
        string $name,
    ): int {
        $now = now();

        $row = [
            'name' =>
                $name,

            'email' =>
                Str::lower(
                    (string)
                        Str::uuid(),
                ) .
                '@example.test',

            'email_verified_at' =>
                $now,

            'password' =>
                Hash::make(
                    'password',
                ),

            'remember_token' =>
                null,

            'created_at' =>
                $now,

            'updated_at' =>
                $now,
        ];

        if (
            Schema::hasColumn(
                'users',
                'wallet_balance',
            )
        ) {
            $row['wallet_balance'] =
                '0.00000000';
        }

        if (
            Schema::hasColumn(
                'users',
                'ai_credits',
            )
        ) {
            $row['ai_credits'] = 0;
        }

        if (
            Schema::hasColumn(
                'users',
                'role',
            )
        ) {
            $row['role'] = 'USER';
        }

        if (
            Schema::hasColumn(
                'users',
                'avatar_url',
            )
        ) {
            $row['avatar_url'] =
                null;
        }

        if (
            Schema::hasColumn(
                'users',
                'referral_code',
            )
        ) {
            $row['referral_code'] =
                'T' .
                strtoupper(
                    substr(
                        str_replace(
                            '-',
                            '',
                            (string)
                                Str::uuid(),
                        ),
                        0,
                        11,
                    ),
                );
        }

        if (
            Schema::hasColumn(
                'users',
                'referral_credit_balance',
            )
        ) {
            $row[
                'referral_credit_balance'
            ] = '0.00000000';
        }

        return (int)
            DB::table('users')
                ->insertGetId($row);
    }

    private function balance(
        int $userId,
    ): string {
        return (string)
            BigDecimal::of(
                (string)
                    DB::table('users')
                        ->where(
                            'id',
                            $userId,
                        )
                        ->value(
                            'referral_credit_balance',
                        ),
            )->toScale(
                8,
                RoundingMode::Down,
            );
    }

    private function totalRewards(
        int $sourceUserId,
    ): string {
        $total =
            BigDecimal::zero();

        foreach (
            DB::table(
                'referral_rewards',
            )
                ->where(
                    'source_user_id',
                    $sourceUserId,
                )
                ->pluck(
                    'reward_credits',
                ) as $value
        ) {
            $total =
                $total->plus(
                    (string) $value,
                );
        }

        return (string)
            $total->toScale(
                8,
                RoundingMode::Down,
            );
    }

    /**
     * @return array<string, string>
     */
    private function headers(): array
    {
        return [
            'X-Zainex-Internal-Token' =>
                'referral-reward-test-token',

            'X-Zainex-Session-Id' =>
                RootUserSeeder::TRADING_SESSION_ID,

            'X-Zainex-Request-Id' =>
                (string) Str::uuid(),
        ];
    }
}