<?php

declare(strict_types=1);

namespace Tests\Feature;

use Database\Seeders\RootUserSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

// ZAINEX_STRATEGY_ACTIVATION_BACKEND_V2_2

final class FuturesStrategyActivationApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Config::set(
            'intelibrain.internal_token',
            'strategy-activation-test-token',
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

    public function test_vip_two_activation_locks_available_amount_and_deducts_credits_without_opening_trade(): void
    {
        $clientRequestId =
            (string) Str::uuid();

        $response = $this
            ->withHeaders($this->headers())
            ->postJson(
                '/api/trading/futures/strategies/activate',
                [
                    'tier' => 'VIP 2',
                    'amount' => '500',
                    'clientRequestId' =>
                        $clientRequestId,
                ],
            );

        $this->dumpUnexpected(
            $response->status(),
            201,
            $response->getContent(),
        );

        $response
            ->assertCreated()
            ->assertJsonPath('ok', true)
            ->assertJsonPath(
                'liveTrading',
                false,
            )
            ->assertJsonPath(
                'result.idempotentReplay',
                false,
            )
            ->assertJsonPath(
                'result.activation.tier',
                'VIP 2',
            )
            ->assertJsonPath(
                'result.activation.creditCost',
                15,
            )
            ->assertJsonPath(
                'result.activation.allocatedAmount',
                500,
            )
            ->assertJsonPath(
                'result.account.walletBalance',
                100000,
            )
            ->assertJsonPath(
                'result.account.availableBalance',
                99500,
            )
            ->assertJsonPath(
                'result.account.lockedBalance',
                0,
            )
            ->assertJsonPath(
                'result.account.credits',
                985,
            )
            ->assertJsonPath(
                'result.autoTradingEnabled',
                false,
            )
            ->assertJsonPath(
                'result.automaticOrderCreated',
                false,
            );

        $this->assertDatabaseHas(
            'strategy_activations',
            [
                'client_request_id' =>
                    $clientRequestId,
                'tier' =>
                    'VIP 2',
                'allocated_amount' =>
                    '500.00000000',
                'credit_cost' =>
                    15,
                'status' =>
                    'ACTIVE',
            ],
        );

        self::assertSame(
            0,
            DB::table(
                'trading_executions',
            )->count(),
        );
    }

    public function test_repeated_request_id_does_not_charge_twice(): void
    {
        $clientRequestId =
            (string) Str::uuid();

        $payload = [
            'tier' => 'VIP 1',
            'amount' => '500',
            'clientRequestId' =>
                $clientRequestId,
        ];

        $first = $this
            ->withHeaders($this->headers())
            ->postJson(
                '/api/trading/futures/strategies/activate',
                $payload,
            );

        $this->dumpUnexpected(
            $first->status(),
            201,
            $first->getContent(),
        );

        $first->assertCreated();

        $second = $this
            ->withHeaders($this->headers())
            ->postJson(
                '/api/trading/futures/strategies/activate',
                $payload,
            );

        $this->dumpUnexpected(
            $second->status(),
            200,
            $second->getContent(),
        );

        $second
            ->assertOk()
            ->assertJsonPath(
                'result.idempotentReplay',
                true,
            );

        self::assertSame(
            1,
            DB::table(
                'strategy_activations',
            )->count(),
        );

        $user = DB::table('users')
            ->where(
                'email',
                'evoloperr@gmail.com',
            )
            ->firstOrFail();

        self::assertSame(
            995,
            (int) $user->ai_credits,
        );

        self::assertSame(
            100000.0,
            (float) $user->wallet_balance,
        );
    }

    public function test_free_tier_costs_zero_credits(): void
    {
        $response = $this
            ->withHeaders($this->headers())
            ->postJson(
                '/api/trading/futures/strategies/activate',
                [
                    'tier' => 'FREE TIER',
                    'amount' => '100',
                    'clientRequestId' =>
                        (string) Str::uuid(),
                ],
            );

        $this->dumpUnexpected(
            $response->status(),
            201,
            $response->getContent(),
        );

        $response
            ->assertCreated()
            ->assertJsonPath(
                'result.activation.creditCost',
                0,
            )
            ->assertJsonPath(
                'result.account.credits',
                1000,
            )
            ->assertJsonPath(
                'result.account.walletBalance',
                100000,
            )
            ->assertJsonPath(
                'result.account.availableBalance',
                99900,
            );
    }

    public function test_activating_the_same_vip_tier_already_held_waives_the_credit_cost(): void
    {
        DB::table('users')
            ->where('email', 'evoloperr@gmail.com')
            ->update([
                'vip_tier' => 'VIP 2',
                'vip_expires_at' => now()->addDays(10),
            ]);

        $response = $this
            ->withHeaders($this->headers())
            ->postJson(
                '/api/trading/futures/strategies/activate',
                [
                    'tier' => 'VIP 2',
                    'amount' => '500',
                    'clientRequestId' => (string) Str::uuid(),
                ],
            );

        $this->dumpUnexpected(
            $response->status(),
            201,
            $response->getContent(),
        );

        $response
            ->assertCreated()
            ->assertJsonPath('result.activation.creditCost', 0)
            ->assertJsonPath('result.account.credits', 1000)
            ->assertJsonPath('result.account.availableBalance', 99500);
    }

    public function test_upgrading_to_a_higher_vip_tier_still_charges_the_full_credit_cost(): void
    {
        DB::table('users')
            ->where('email', 'evoloperr@gmail.com')
            ->update([
                'vip_tier' => 'VIP 2',
                'vip_expires_at' => now()->addDays(10),
            ]);

        $response = $this
            ->withHeaders($this->headers())
            ->postJson(
                '/api/trading/futures/strategies/activate',
                [
                    'tier' => 'VIP 3',
                    'amount' => '500',
                    'clientRequestId' => (string) Str::uuid(),
                ],
            );

        $this->dumpUnexpected(
            $response->status(),
            201,
            $response->getContent(),
        );

        $response
            ->assertCreated()
            ->assertJsonPath('result.activation.creditCost', 45)
            ->assertJsonPath('result.account.credits', 955);
    }

    public function test_reactivating_the_same_vip_tier_after_it_expired_still_charges_the_credit_cost(): void
    {
        DB::table('users')
            ->where('email', 'evoloperr@gmail.com')
            ->update([
                'vip_tier' => 'VIP 2',
                'vip_expires_at' => now()->subDay(),
            ]);

        $response = $this
            ->withHeaders($this->headers())
            ->postJson(
                '/api/trading/futures/strategies/activate',
                [
                    'tier' => 'VIP 2',
                    'amount' => '500',
                    'clientRequestId' => (string) Str::uuid(),
                ],
            );

        $this->dumpUnexpected(
            $response->status(),
            201,
            $response->getContent(),
        );

        $response
            ->assertCreated()
            ->assertJsonPath('result.activation.creditCost', 15)
            ->assertJsonPath('result.account.credits', 985);
    }

    public function test_insufficient_balance_does_not_modify_wallet_or_credits(): void
    {
        $response = $this
            ->withHeaders($this->headers())
            ->postJson(
                '/api/trading/futures/strategies/activate',
                [
                    'tier' => 'VIP 3',
                    'amount' => '200000',
                    'clientRequestId' =>
                        (string) Str::uuid(),
                ],
            );

        $this->dumpUnexpected(
            $response->status(),
            422,
            $response->getContent(),
        );

        $response
            ->assertStatus(422)
            ->assertJsonPath(
                'ok',
                false,
            )
            ->assertJsonPath(
                'error.code',
                'INSUFFICIENT_AVAILABLE_BALANCE',
            );

        $user = DB::table('users')
            ->where(
                'email',
                'evoloperr@gmail.com',
            )
            ->firstOrFail();

        self::assertSame(
            1000,
            (int) $user->ai_credits,
        );

        self::assertSame(
            100000.0,
            (float) $user->wallet_balance,
        );

        self::assertSame(
            0,
            DB::table(
                'strategy_activations',
            )->count(),
        );
    }

    /**
     * @return array<string, string>
     */
    private function headers(): array
    {
        return [
            'X-Zainex-Internal-Token' =>
                'strategy-activation-test-token',
            'X-Zainex-Session-Id' =>
                $this->sessionId(),
            'X-Zainex-Request-Id' =>
                (string) Str::uuid(),
        ];
    }

    private function sessionId(): string
    {
        return (string) DB::table(
            'trading_accounts',
        )
            ->whereNotNull('user_id')
            ->where('status', 'ACTIVE')
            ->value('external_session_id');
    }

    private function dumpUnexpected(
        int $actual,
        int $expected,
        string $body,
    ): void {
        if ($actual === $expected) {
            return;
        }

        fwrite(
            STDERR,
            PHP_EOL .
            'UNEXPECTED_RESPONSE_BODY=' .
            $body .
            PHP_EOL,
        );
    }
}