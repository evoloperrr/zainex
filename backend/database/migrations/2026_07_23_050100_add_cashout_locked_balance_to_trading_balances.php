<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// ZAINEX_CASHOUT_REQUEST_V1
// Mirrors strategy_locked_balance's pattern: funds committed to a
// pending cashout request move out of available_balance and into this
// column immediately at request time (so the user can't double-spend
// them while admin reviews), without touching wallet_balance (the
// user's total) until the request is actually approved.

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('trading_balances', function (Blueprint $table): void {
            $table->decimal('cashout_locked_balance', 30, 8)->default(0);
        });
    }

    public function down(): void
    {
        Schema::table('trading_balances', function (Blueprint $table): void {
            $table->dropColumn('cashout_locked_balance');
        });
    }
};
