<?php

declare(strict_types=1);

namespace Tests\Feature;

use Database\Seeders\RootUserSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Str;
use Tests\TestCase;

// ZAINEX_SESSION_USER_DYNAMIC_INITIALS_V1

final class SessionUserIdentityApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Config::set(
            'intelibrain.internal_token',
            'session-user-test-token',
        );
    }

    public function test_account_returns_the_session_linked_user_identity(): void
    {
        $this->seed(RootUserSeeder::class);

        $this
            ->withHeaders([
                'X-Zainex-Internal-Token' =>
                    'session-user-test-token',
                'X-Zainex-Session-Id' =>
                    RootUserSeeder::TRADING_SESSION_ID,
                'X-Zainex-Request-Id' =>
                    (string) Str::uuid(),
            ])
            ->getJson(
                '/api/trading/futures/account',
            )
            ->assertOk()
            ->assertJsonPath(
                'account.user.name',
                'Erdie Barela',
            )
            ->assertJsonPath(
                'account.user.email',
                RootUserSeeder::EMAIL,
            )
            ->assertJsonPath(
                'account.user.role',
                'ROOT',
            )
            ->assertJsonPath(
                'account.user.avatarUrl',
                '/avatars/root-eb.svg',
            );
    }
}