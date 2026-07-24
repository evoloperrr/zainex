<?php

// ZAINEX_UNIFIED_BILLING_V1
// Lets a subscription payment (merchant or crypto) carry an optional
// extra amount the user wants added straight to their trading wallet in
// the SAME submission — one QR/invoice, one proof, one admin approval —
// instead of the old flow where funding the wallet after subscribing was
// a second, separate cash-in submission end to end.

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('merchant_cashins', function (Blueprint $table): void {
            $table->decimal('wallet_top_up_amount', 18, 2)->default(0)->after('amount');
            $table->string('billing_cycle', 16)->nullable()->after('plan_name');
        });

        Schema::table('crypto_payments', function (Blueprint $table): void {
            $table->decimal('wallet_top_up_amount', 18, 2)->default(0)->after('price_amount');
            $table->string('billing_cycle', 16)->nullable()->after('plan_name');
        });
    }

    public function down(): void
    {
        Schema::table('merchant_cashins', function (Blueprint $table): void {
            $table->dropColumn(['wallet_top_up_amount', 'billing_cycle']);
        });

        Schema::table('crypto_payments', function (Blueprint $table): void {
            $table->dropColumn(['wallet_top_up_amount', 'billing_cycle']);
        });
    }
};
