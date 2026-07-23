<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// ZAINEX_STRATEGY_ANNUAL_BILLING_V1
// Lets a strategy activation be paid for annually (12x the normal credit
// cost) instead of the default monthly cycle, in exchange for a 360-day
// term instead of 30 — so an "Annual" subscriber doesn't have to
// manually re-activate (and pay again) every month to keep earning.
// Existing rows default to 'monthly', matching their current term_days.

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('strategy_activations', function (Blueprint $table): void {
            $table->string('billing_cycle', 16)->default('monthly')->after('credit_cost');
        });
    }

    public function down(): void
    {
        Schema::table('strategy_activations', function (Blueprint $table): void {
            $table->dropColumn('billing_cycle');
        });
    }
};
