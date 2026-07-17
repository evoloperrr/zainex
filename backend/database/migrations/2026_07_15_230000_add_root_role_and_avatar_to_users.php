<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// ZAINEX_ROOT_USER_LINKED_WALLET_AVATAR_V1

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->string('role', 32)->default('USER');
            $table->string('avatar_url', 512)->nullable();
            $table->index('role', 'users_role_idx');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->dropIndex('users_role_idx');
            $table->dropColumn(['role', 'avatar_url']);
        });
    }
};
