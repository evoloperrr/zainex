<?php

// ZAINEX_NOWPAYMENTS_CRYPTO_PAYMENTS_V1

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('crypto_payments', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')
                ->nullable()
                ->constrained('users')
                ->nullOnDelete();
            $table->unsignedBigInteger('trading_account_id')->nullable();
            $table->string('purpose', 20);
            $table->string('plan_name', 40)->nullable();
            $table->decimal('price_amount', 18, 2);
            $table->string('price_currency', 10)->default('usd');
            $table->string('pay_currency', 20)->nullable();
            $table->string('order_id', 80)->unique();
            $table->string('provider_payment_id', 80)->nullable()->unique();
            $table->string('pay_address', 255)->nullable();
            $table->decimal('pay_amount', 30, 8)->nullable();
            $table->string('status', 30)->default('waiting');
            $table->timestamp('credited_at')->nullable();
            $table->json('ipn_payload')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('crypto_payments');
    }
};
