<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// ZAINEX_STRATEGY_REFERRAL_CREDIT_RECONCILIATION_V1

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('referral_rewards', 'reversed_at')) {
            Schema::table(
                'referral_rewards',
                function (Blueprint $table): void {
                    $table
                        ->timestamp('reversed_at')
                        ->nullable()
                        ->index();
                },
            );
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('referral_rewards', 'reversed_at')) {
            Schema::table(
                'referral_rewards',
                function (Blueprint $table): void {
                    $table->dropColumn('reversed_at');
                },
            );
        }
    }
};
