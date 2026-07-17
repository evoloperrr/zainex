<?php

// ZAINEX_DB_PHASE2A_COMBINED_USER_WALLET_INVITER_FUTURES_V2_4

namespace Tests\Unit;

use App\Models\User;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Tests\TestCase;

final class UserTradingRelationsTest extends TestCase
{
    public function test_user_wallet_cast_and_relationships_are_defined(): void
    {
        $user = new User();

        self::assertSame('decimal:8', $user->getCasts()['wallet_balance'] ?? null);
        self::assertInstanceOf(BelongsTo::class, $user->inviter());
        self::assertInstanceOf(HasMany::class, $user->invitees());
        self::assertInstanceOf(HasMany::class, $user->tradingAccounts());
        self::assertNotContains('wallet_balance', $user->getFillable());
        self::assertContains('inviter_id', $user->getFillable());
    }
}