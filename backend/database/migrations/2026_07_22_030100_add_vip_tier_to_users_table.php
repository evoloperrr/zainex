<?php

// ZAINEX_NOWPAYMENTS_VIP_TIER_V1

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->string('vip_tier', 20)->nullable();
            $table->timestamp('vip_expires_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->dropColumn(['vip_tier', 'vip_expires_at']);
        });
    }
};
