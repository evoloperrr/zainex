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

// ZAINEX_ROOT_ADMIN_WALLET_TRANSFER_V1

final class AdminWalletTransferApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Config::set(
            'intelibrain.internal_token',
            'admin-transfer-test-token',
        );

        $this->seed(
            RootUserSeeder::class,
        );
    }

    public function test_root_admin_can_transfer_wallet_funds_once(): void
    {
        [
            $recipientUserId,
            $recipientSessionId,
        ] = $this->createUserWallet(
            'recipient@example.test',
            '0.00000000',
            false,
        );

        self::assertNotSame(
            '',
            $recipientSessionId,
        );

        $clientRequestId =
            (string) Str::uuid();

        $payload = [
            'recipientEmail' =>
                'recipient@example.test',
            'amount' =>
                '1250.50000000',
            'clientRequestId' =>
                $clientRequestId,
        ];

        $first = $this
            ->withHeaders(
                $this->rootHeaders(),
            )
            ->postJson(
                '/api/trading/futures/wallet/admin-transfers',
                $payload,
            );

        $first
            ->assertCreated()
            ->assertJsonPath(
                'ok',
                true,
            )
            ->assertJsonPath(
                'liveFunds',
                false,
            )
            ->assertJsonPath(
                'idempotentReplay',
                false,
            )
            ->assertJsonPath(
                'transfer.amount',
                '1250.50000000',
            );

        $rootId =
            (int)
                DB::table('users')
                    ->where(
                        'email',
                        RootUserSeeder::EMAIL,
                    )
                    ->value('id');

        self::assertSame(
            '98749.50000000',
            $this->userWallet(
                $rootId,
            ),
        );

        self::assertSame(
            '98749.50000000',
            $this->available(
                $rootId,
            ),
        );

        self::assertSame(
            '1250.50000000',
            $this->userWallet(
                $recipientUserId,
            ),
        );

        self::assertSame(
            '1250.50000000',
            $this->available(
                $recipientUserId,
            ),
        );

        self::assertSame(
            1,
            DB::table(
                'admin_wallet_transfers',
            )->count(),
        );

        $replay = $this
            ->withHeaders(
                $this->rootHeaders(),
            )
            ->postJson(
                '/api/trading/futures/wallet/admin-transfers',
                $payload,
            );

        $replay
            ->assertOk()
            ->assertJsonPath(
                'idempotentReplay',
                true,
            );

        self::assertSame(
            1,
            DB::table(
                'admin_wallet_transfers',
            )->count(),
        );

        self::assertSame(
            '98749.50000000',
            $this->userWallet(
                $rootId,
            ),
        );

        self::assertSame(
            '1250.50000000',
            $this->userWallet(
                $recipientUserId,
            ),
        );
    }

    public function test_regular_user_cannot_use_admin_transfer(): void
    {
        [
            ,
            $regularSession,
        ] = $this->createUserWallet(
            'regular@example.test',
            '500.00000000',
            false,
        );

        $this
            ->withHeaders(
                $this->headers(
                    $regularSession,
                ),
            )
            ->postJson(
                '/api/trading/futures/wallet/admin-transfers',
                [
                    'recipientEmail' =>
                        RootUserSeeder::EMAIL,
                    'amount' =>
                        '10.00000000',
                    'clientRequestId' =>
                        (string)
                            Str::uuid(),
                ],
            )
            ->assertForbidden()
            ->assertJsonPath(
                'error.code',
                'ADMIN_PERMISSION_REQUIRED',
            );

        self::assertSame(
            0,
            DB::table(
                'admin_wallet_transfers',
            )->count(),
        );
    }

    public function test_admin_cannot_overdraw_or_self_transfer(): void
    {
        $this
            ->withHeaders(
                $this->rootHeaders(),
            )
            ->postJson(
                '/api/trading/futures/wallet/admin-transfers',
                [
                    'recipientEmail' =>
                        RootUserSeeder::EMAIL,
                    'amount' =>
                        '1.00000000',
                    'clientRequestId' =>
                        (string)
                            Str::uuid(),
                ],
            )
            ->assertUnprocessable()
            ->assertJsonPath(
                'error.code',
                'ADMIN_SELF_TRANSFER_BLOCKED',
            );

        $this->createUserWallet(
            'large@example.test',
            '0.00000000',
            false,
        );

        $this
            ->withHeaders(
                $this->rootHeaders(),
            )
            ->postJson(
                '/api/trading/futures/wallet/admin-transfers',
                [
                    'recipientEmail' =>
                        'large@example.test',
                    'amount' =>
                        '100000000.00000000',
                    'clientRequestId' =>
                        (string)
                            Str::uuid(),
                ],
            )
            ->assertUnprocessable()
            ->assertJsonPath(
                'error.code',
                'ADMIN_WALLET_INSUFFICIENT',
            );

        self::assertSame(
            0,
            DB::table(
                'admin_wallet_transfers',
            )->count(),
        );
    }

    /**
     * @return array{int, string}
     */
    private function createUserWallet(
        string $email,
        string $balance,
        bool $isAdmin,
    ): array {
        $now =
            now();

        $userId =
            DB::table('users')
                ->insertGetId([
                    'name' =>
                        'Transfer User',
                    'email' =>
                        $email,
                    'email_verified_at' =>
                        $now,
                    'password' =>
                        Hash::make(
                            'password',
                        ),
                    'remember_token' =>
                        null,
                    'wallet_balance' =>
                        $balance,
                    'inviter_id' =>
                        null,
                    'role' =>
                        $isAdmin
                            ? 'ADMIN'
                            : 'USER',
                    'is_admin' =>
                        $isAdmin,
                    'avatar_url' =>
                        null,
                    'ai_credits' =>
                        0,
                    'referral_code' =>
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
                        ),
                    'referred_at' =>
                        null,
                    'referral_credit_balance' =>
                        '0.00000000',
                    'created_at' =>
                        $now,
                    'updated_at' =>
                        $now,
                ]);

        $sessionId =
            (string) Str::uuid();

        $accountId =
            DB::table(
                'trading_accounts',
            )->insertGetId([
                'user_id' =>
                    $userId,
                'external_session_id' =>
                    $sessionId,
                'account_type' =>
                    'PAPER',
                'mode' =>
                    'UNIFIED_PAPER',
                'base_asset' =>
                    'USDT',
                'status' =>
                    'ACTIVE',
                'starting_balance' =>
                    $balance,
                'created_at' =>
                    $now,
                'updated_at' =>
                    $now,
            ]);

        DB::table(
            'trading_balances',
        )->insert([
            'trading_account_id' =>
                $accountId,
            'asset' =>
                'USDT',
            'available_balance' =>
                $balance,
            'locked_balance' =>
                '0.00000000',
            'realized_pnl' =>
                '0.00000000',
            'strategy_locked_balance' =>
                '0.00000000',
            'created_at' =>
                $now,
            'updated_at' =>
                $now,
        ]);

        return [
            $userId,
            $sessionId,
        ];
    }

    /**
     * @return array<string, string>
     */
    private function rootHeaders(): array
    {
        return $this->headers(
            RootUserSeeder::TRADING_SESSION_ID,
        );
    }

    /**
     * @return array<string, string>
     */
    private function headers(
        string $sessionId,
    ): array {
        return [
            'X-Zainex-Internal-Token' =>
                'admin-transfer-test-token',
            'X-Zainex-Session-Id' =>
                $sessionId,
            'X-Zainex-Request-Id' =>
                (string) Str::uuid(),
        ];
    }

    private function userWallet(
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
                            'wallet_balance',
                        ),
            )->toScale(
                8,
                RoundingMode::Down,
            );
    }

    private function available(
        int $userId,
    ): string {
        $value =
            DB::table(
                'trading_balances as balance',
            )
                ->join(
                    'trading_accounts as account',
                    'account.id',
                    '=',
                    'balance.trading_account_id',
                )
                ->where(
                    'account.user_id',
                    $userId,
                )
                ->where(
                    'account.status',
                    'ACTIVE',
                )
                ->where(
                    'balance.asset',
                    'USDT',
                )
                ->value(
                    'balance.available_balance',
                );

        return (string)
            BigDecimal::of(
                (string) $value,
            )->toScale(
                8,
                RoundingMode::Down,
            );
    }
}