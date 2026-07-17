<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TradingAccount;
use App\Models\TradingBalance;
use App\Models\User;
use Brick\Math\BigDecimal;
use Brick\Math\RoundingMode;
use Database\Seeders\RootUserSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Tests\TestCase;

// ZAINEX_ROOT_USER_LINKED_WALLET_AVATAR_V1

final class RootUserWalletProvisioningTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Config::set('intelibrain.internal_token', 'root-user-test-token');
    }

    public function test_root_user_and_linked_wallet_are_provisioned(): void
    {
        $this->seed(RootUserSeeder::class);

        $user = User::query()->where('email', RootUserSeeder::EMAIL)->firstOrFail();

        self::assertSame('ROOT', $user->role);
        // ZAINEX_ROOT_ADMIN_WALLET_TRANSFER_V1
        self::assertTrue((bool) $user->is_admin);
        self::assertTrue($user->isAdmin());
        self::assertSame('/avatars/root-eb.svg', $user->avatar_url);
        self::assertSame('100000.00000000', $user->wallet_balance);

        $account = TradingAccount::query()
            ->where('user_id', $user->id)
            ->where('external_session_id', RootUserSeeder::TRADING_SESSION_ID)
            ->firstOrFail();

        self::assertSame('100000.00000000', $account->starting_balance);

        $this->assertDatabaseHas('trading_balances', [
            'trading_account_id' => $account->id,
            'asset' => 'USDT',
            'available_balance' => '100000.00000000',
            'locked_balance' => '0.00000000',
        ]);
    }

    public function test_user_wallet_projection_tracks_trading_balance(): void
    {
        $this->seed(RootUserSeeder::class);

        Http::fakeSequence()
            ->push(['symbol' => 'BTCUSDT', 'price' => '100000.00000000'], 200)
            ->push(['symbol' => 'BTCUSDT', 'price' => '100000.00000000'], 200);

        $open = $this
            ->withHeaders($this->headers())
            ->postJson('/api/trading/futures/orders', [
                'symbol' => 'BTCUSDT',
                'direction' => 'LONG',
                'margin' => '100',
                'leverage' => 1,
                'stopLoss' => '50000',
                'takeProfit' => '200000',
                'clientOrderId' => 'root-wallet-open-test',
            ])
            ->assertCreated();

        $positionId = (string) $open->json('result.account.positions.0.id');
        self::assertNotSame('', $positionId);
        $this->assertProjection();

        $this
            ->withHeaders($this->headers())
            ->postJson('/api/trading/futures/close', [
                'positionId' => $positionId,
                'clientOrderId' => 'root-wallet-close-test',
            ])
            ->assertCreated();

        $this->assertProjection();
    }

    private function headers(): array
    {
        return [
            'X-Zainex-Internal-Token' => 'root-user-test-token',
            'X-Zainex-Session-Id' => RootUserSeeder::TRADING_SESSION_ID,
            'X-Zainex-Request-Id' => (string) Str::uuid(),
        ];
    }

    private function assertProjection(): void
    {
        $user = User::query()->where('email', RootUserSeeder::EMAIL)->firstOrFail();
        $account = TradingAccount::query()->where('user_id', $user->id)->firstOrFail();
        $balance = TradingBalance::query()
            ->where('trading_account_id', $account->id)
            ->where('asset', 'USDT')
            ->firstOrFail();

        $expected = BigDecimal::of($balance->available_balance)
            ->plus(BigDecimal::of($balance->locked_balance))
            ->toScale(8, RoundingMode::HalfUp);

        $actual = BigDecimal::of($user->wallet_balance)
            ->toScale(8, RoundingMode::HalfUp);

        self::assertSame((string) $expected, (string) $actual);
    }
}
