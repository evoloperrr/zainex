<?php

declare(strict_types=1);

namespace Tests\Feature;

use Database\Seeders\RootUserSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

// ZAINEX_WALLET_TO_CREDITS_CONVERTER_TEST_V1

final class WalletToCreditsConversionApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Config::set(
            'intelibrain.internal_token',
            'wallet-conversion-test-token',
        );

        $this->seed(
            RootUserSeeder::class,
        );

        DB::table('users')
            ->where(
                'email',
                RootUserSeeder::EMAIL,
            )
            ->update([
                'ai_credits' => 100,
            ]);
    }

    public function test_conversion_is_atomic_and_logged(): void
    {
        $response = $this
            ->withHeaders(
                $this->headers(),
            )
            ->postJson(
                '/api/trading/futures/wallet/convert',
                [
                    'amount' => 25,
                    'clientRequestId' =>
                        (string) Str::uuid(),
                ],
            );

        $response
            ->assertCreated()
            ->assertJsonPath(
                'ok',
                true,
            )
            ->assertJsonPath(
                'idempotentReplay',
                false,
            )
            ->assertJsonPath(
                'conversion.amountUsd',
                25,
            )
            ->assertJsonPath(
                'conversion.creditsAdded',
                25,
            )
            ->assertJsonPath(
                'state.credits',
                125,
            )
            ->assertJsonCount(
                1,
                'logs',
            );

        self::assertSame(
            99975.0,
            (float) DB::table('users')
                ->where(
                    'email',
                    RootUserSeeder::EMAIL,
                )
                ->value(
                    'wallet_balance',
                ),
        );

        self::assertSame(
            125,
            (int) DB::table('users')
                ->where(
                    'email',
                    RootUserSeeder::EMAIL,
                )
                ->value('ai_credits'),
        );

        self::assertSame(
            99975.0,
            (float) DB::table(
                'trading_balances',
            )
                ->where(
                    'asset',
                    'USDT',
                )
                ->value(
                    'available_balance',
                ),
        );

        self::assertSame(
            1,
            DB::table(
                'wallet_transactions',
            )
                ->where(
                    'event_type',
                    'WALLET_TO_CREDITS',
                )
                ->count(),
        );
    }

    public function test_repeated_request_does_not_charge_twice(): void
    {
        $clientRequestId =
            (string) Str::uuid();

        $payload = [
            'amount' => 10,
            'clientRequestId' =>
                $clientRequestId,
        ];

        $this
            ->withHeaders(
                $this->headers(),
            )
            ->postJson(
                '/api/trading/futures/wallet/convert',
                $payload,
            )
            ->assertCreated();

        $this
            ->withHeaders(
                $this->headers(),
            )
            ->postJson(
                '/api/trading/futures/wallet/convert',
                $payload,
            )
            ->assertOk()
            ->assertJsonPath(
                'idempotentReplay',
                true,
            );

        self::assertSame(
            99990.0,
            (float) DB::table('users')
                ->where(
                    'email',
                    RootUserSeeder::EMAIL,
                )
                ->value(
                    'wallet_balance',
                ),
        );

        self::assertSame(
            110,
            (int) DB::table('users')
                ->where(
                    'email',
                    RootUserSeeder::EMAIL,
                )
                ->value('ai_credits'),
        );

        self::assertSame(
            1,
            DB::table(
                'wallet_transactions',
            )
                ->where(
                    'event_type',
                    'WALLET_TO_CREDITS',
                )
                ->count(),
        );
    }

    public function test_insufficient_available_balance_changes_nothing(): void
    {
        DB::table('users')
            ->where(
                'email',
                RootUserSeeder::EMAIL,
            )
            ->update([
                'wallet_balance' =>
                    '4.00000000',
            ]);

        DB::table(
            'trading_balances',
        )
            ->where(
                'asset',
                'USDT',
            )
            ->update([
                'available_balance' =>
                    '4.00000000',
            ]);

        $this
            ->withHeaders(
                $this->headers(),
            )
            ->postJson(
                '/api/trading/futures/wallet/convert',
                [
                    'amount' => 5,
                    'clientRequestId' =>
                        (string) Str::uuid(),
                ],
            )
            ->assertStatus(422)
            ->assertJsonPath(
                'error.code',
                'INSUFFICIENT_AVAILABLE_BALANCE',
            );

        self::assertSame(
            4.0,
            (float) DB::table('users')
                ->where(
                    'email',
                    RootUserSeeder::EMAIL,
                )
                ->value(
                    'wallet_balance',
                ),
        );

        self::assertSame(
            100,
            (int) DB::table('users')
                ->where(
                    'email',
                    RootUserSeeder::EMAIL,
                )
                ->value('ai_credits'),
        );

        self::assertSame(
            0,
            DB::table(
                'wallet_transactions',
            )
                ->where(
                    'event_type',
                    'WALLET_TO_CREDITS',
                )
                ->count(),
        );
    }

    public function test_only_ten_newest_conversion_logs_are_returned(): void
    {
        for ($index = 1; $index <= 12; $index++) {
            $this
                ->withHeaders(
                    $this->headers(),
                )
                ->postJson(
                    '/api/trading/futures/wallet/convert',
                    [
                        'amount' => 1,
                        'clientRequestId' =>
                            (string) Str::uuid(),
                    ],
                )
                ->assertCreated();
        }

        $response = $this
            ->withHeaders(
                $this->headers(),
            )
            ->getJson(
                '/api/trading/futures/wallet/convert',
            );

        $response
            ->assertOk()
            ->assertJsonCount(
                10,
                'logs',
            )
            ->assertJsonPath(
                'state.credits',
                112,
            );

        $logs = $response->json(
            'logs',
        );

        self::assertGreaterThan(
            $logs[9]['id'],
            $logs[0]['id'],
        );
    }

    /**
     * @return array<string, string>
     */
    private function headers(): array
    {
        return [
            'X-Zainex-Internal-Token' =>
                'wallet-conversion-test-token',
            'X-Zainex-Session-Id' =>
                RootUserSeeder::TRADING_SESSION_ID,
            'X-Zainex-Request-Id' =>
                (string) Str::uuid(),
        ];
    }
}