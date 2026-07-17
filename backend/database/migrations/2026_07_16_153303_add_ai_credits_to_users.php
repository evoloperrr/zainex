<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// ZAINEX_WALLET_AI_CREDITS_ROUTE_V1_3

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('users', 'ai_credits')) {
            Schema::table('users', function (Blueprint $table): void {
                $table
                    ->unsignedBigInteger('ai_credits')
                    ->default(0);
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('users', 'ai_credits')) {
            Schema::table('users', function (Blueprint $table): void {
                $table->dropColumn('ai_credits');
            });
        }
    }
};