<?php

// ZAINEX_LIVE_OKX_TRADING_V1
// Per-user encrypted exchange API credentials (non-custodial: the user's
// own OKX account, trade-only permission, never withdrawal-capable).

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('exchange_connections', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')
                ->constrained('users')
                ->cascadeOnDelete();
            $table->string('exchange', 16)->default('OKX');
            $table->string('label', 64)->nullable();
            $table->boolean('is_demo')->default(false);
            $table->text('api_key')->nullable();
            $table->text('api_secret')->nullable();
            $table->text('passphrase')->nullable();
            $table->string('status', 16)->default('PENDING');
            $table->timestamp('last_verified_at')->nullable();
            $table->string('last_error_code', 32)->nullable();
            $table->string('last_error_message', 255)->nullable();
            $table->timestamp('revoked_at')->nullable();
            $table->timestamps();

            $table->unique(['user_id', 'exchange']);
            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('exchange_connections');
    }
};
