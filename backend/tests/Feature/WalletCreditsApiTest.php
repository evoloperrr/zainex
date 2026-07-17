<?php

declare(strict_types=1);

namespace Tests\Feature;

use Database\Seeders\RootUserSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Tests\TestCase;

// ZAINEX_WALLET_AI_CREDITS_ROUTE_V1_3

final class WalletCreditsApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Config::set(
            'intelibrain.internal_token',
            'wallet-credits-test-token',
        );
    }

    public function test_wallet_and_ai_credits_are_returned(): void
    {
        $this->assertTrue(
            Schema::hasColumn('users', 'ai_credits'),
        );

        $this->seed(RootUserSeeder::class);

        $response = $this
            ->withHeaders([
                'X-Zainex-Internal-Token' =>
                    'wallet-credits-test-token',
                'X-Zainex-Session-Id' =>
                    RootUserSeeder::TRADING_SESSION_ID,
                'X-Zainex-Request-Id' =>
                    (string) Str::uuid(),
            ])
            ->getJson(
                '/api/trading/futures/account',
            );

        $response
            ->assertOk()
            ->assertJsonPath(
                'account.user.email',
                RootUserSeeder::EMAIL,
            )
            ->assertJsonPath(
                'account.user.credits',
                0,
            );

        $this->assertSame(
            10000.0,
            (float) $response->json(
                'account.user.walletBalance',
            ),
        );

        $this->assertSame(
            10000.0,
            (float) $response->json(
                'account.availableBalance',
            ),
        );
    }
}