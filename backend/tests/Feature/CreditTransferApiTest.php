<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\User;
use Database\Seeders\RootUserSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

// ZAINEX_USER_CREDIT_TRANSFER_TEST_V1

final class CreditTransferApiTest extends TestCase
{
    use RefreshDatabase;

    private User $recipient;

    protected function setUp(): void
    {
        parent::setUp();

        Config::set(
            'intelibrain.internal_token',
            'credit-transfer-test-token',
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
                'ai_credits' => 1000,
            ]);

        $this->recipient =
            User::factory()->create([
                'name' =>
                    'Recipient User',
                'email' =>
                    'recipient@example.com',
                'ai_credits' =>
                    10,
                'wallet_balance' =>
                    '250.00000000',
            ]);
    }

    public function test_sender_can_transfer_credits_by_email(): void
    {
        $senderWalletBefore =
            DB::table('users')
                ->where(
                    'email',
                    RootUserSeeder::EMAIL,
                )
                ->value('wallet_balance');

        $recipientWalletBefore =
            DB::table('users')
                ->where(
                    'id',
                    $this->recipient->id,
                )
                ->value('wallet_balance');

        $response = $this
            ->withHeaders(
                $this->headers(),
            )
            ->postJson(
                '/api/trading/futures/wallet/transfers',
                [
                    'recipientEmail' =>
                        'RECIPIENT@EXAMPLE.COM',
                    'amount' => 50,
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
                'sender.credits',
                950,
            )
            ->assertJsonPath(
                'transfer.direction',
                'SENT',
            )
            ->assertJsonPath(
                'transfer.amount',
                50,
            )
            ->assertJsonPath(
                'transfer.counterparty.email',
                'recipient@example.com',
            )
            ->assertJsonCount(
                1,
                'logs',
            );

        self::assertSame(
            950,
            (int) DB::table('users')
                ->where(
                    'email',
                    RootUserSeeder::EMAIL,
                )
                ->value('ai_credits'),
        );

        self::assertSame(
            60,
            (int) DB::table('users')
                ->where(
                    'id',
                    $this->recipient->id,
                )
                ->value('ai_credits'),
        );

        self::assertSame(
            (float) $senderWalletBefore,
            (float) DB::table('users')
                ->where(
                    'email',
                    RootUserSeeder::EMAIL,
                )
                ->value('wallet_balance'),
        );

        self::assertSame(
            (float) $recipientWalletBefore,
            (float) DB::table('users')
                ->where(
                    'id',
                    $this->recipient->id,
                )
                ->value('wallet_balance'),
        );

        self::assertSame(
            1,
            DB::table(
                'credit_transfers',
            )->count(),
        );
    }

    public function test_same_request_is_not_charged_twice(): void
    {
        $requestId =
            (string) Str::uuid();

        $payload = [
            'recipientEmail' =>
                'recipient@example.com',
            'amount' => 25,
            'clientRequestId' =>
                $requestId,
        ];

        $this
            ->withHeaders(
                $this->headers(),
            )
            ->postJson(
                '/api/trading/futures/wallet/transfers',
                $payload,
            )
            ->assertCreated();

        $this
            ->withHeaders(
                $this->headers(),
            )
            ->postJson(
                '/api/trading/futures/wallet/transfers',
                $payload,
            )
            ->assertOk()
            ->assertJsonPath(
                'idempotentReplay',
                true,
            );

        self::assertSame(
            975,
            (int) DB::table('users')
                ->where(
                    'email',
                    RootUserSeeder::EMAIL,
                )
                ->value('ai_credits'),
        );

        self::assertSame(
            35,
            (int) DB::table('users')
                ->where(
                    'id',
                    $this->recipient->id,
                )
                ->value('ai_credits'),
        );

        self::assertSame(
            1,
            DB::table(
                'credit_transfers',
            )->count(),
        );
    }

    public function test_self_transfer_is_rejected(): void
    {
        $this
            ->withHeaders(
                $this->headers(),
            )
            ->postJson(
                '/api/trading/futures/wallet/transfers',
                [
                    'recipientEmail' =>
                        RootUserSeeder::EMAIL,
                    'amount' => 5,
                    'clientRequestId' =>
                        (string) Str::uuid(),
                ],
            )
            ->assertStatus(422)
            ->assertJsonPath(
                'error.code',
                'SELF_TRANSFER_NOT_ALLOWED',
            );

        self::assertSame(
            1000,
            (int) DB::table('users')
                ->where(
                    'email',
                    RootUserSeeder::EMAIL,
                )
                ->value('ai_credits'),
        );
    }

    public function test_unknown_recipient_is_rejected(): void
    {
        $this
            ->withHeaders(
                $this->headers(),
            )
            ->postJson(
                '/api/trading/futures/wallet/transfers',
                [
                    'recipientEmail' =>
                        'missing@example.com',
                    'amount' => 5,
                    'clientRequestId' =>
                        (string) Str::uuid(),
                ],
            )
            ->assertNotFound()
            ->assertJsonPath(
                'error.code',
                'RECIPIENT_NOT_FOUND',
            );
    }

    public function test_insufficient_credits_change_nothing(): void
    {
        DB::table('users')
            ->where(
                'email',
                RootUserSeeder::EMAIL,
            )
            ->update([
                'ai_credits' => 4,
            ]);

        $this
            ->withHeaders(
                $this->headers(),
            )
            ->postJson(
                '/api/trading/futures/wallet/transfers',
                [
                    'recipientEmail' =>
                        'recipient@example.com',
                    'amount' => 5,
                    'clientRequestId' =>
                        (string) Str::uuid(),
                ],
            )
            ->assertStatus(422)
            ->assertJsonPath(
                'error.code',
                'INSUFFICIENT_AI_CREDITS',
            );

        self::assertSame(
            4,
            (int) DB::table('users')
                ->where(
                    'email',
                    RootUserSeeder::EMAIL,
                )
                ->value('ai_credits'),
        );

        self::assertSame(
            10,
            (int) DB::table('users')
                ->where(
                    'id',
                    $this->recipient->id,
                )
                ->value('ai_credits'),
        );

        self::assertSame(
            0,
            DB::table(
                'credit_transfers',
            )->count(),
        );
    }

    public function test_only_ten_newest_logs_are_returned(): void
    {
        for (
            $index = 1;
            $index <= 12;
            $index++
        ) {
            $this
                ->withHeaders(
                    $this->headers(),
                )
                ->postJson(
                    '/api/trading/futures/wallet/transfers',
                    [
                        'recipientEmail' =>
                            'recipient@example.com',
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
                '/api/trading/futures/wallet/transfers',
            );

        $response
            ->assertOk()
            ->assertJsonCount(
                10,
                'logs',
            )
            ->assertJsonPath(
                'sender.credits',
                988,
            );

        $logs =
            $response->json('logs');

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
                'credit-transfer-test-token',
            'X-Zainex-Session-Id' =>
                RootUserSeeder::TRADING_SESSION_ID,
            'X-Zainex-Request-Id' =>
                (string) Str::uuid(),
        ];
    }
}