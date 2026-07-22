<?php

// ZAINEX_MERCHANT_CASHIN_V1

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('merchant_cashins', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')
                ->nullable()
                ->constrained('users')
                ->nullOnDelete();
            $table->unsignedBigInteger('trading_account_id')->nullable();
            $table->string('purpose', 20);
            $table->string('plan_name', 40)->nullable();
            $table->decimal('amount', 18, 2);
            $table->longText('proof_image')->nullable();
            $table->string('status', 20)->default('pending');
            $table->foreignId('reviewed_by')
                ->nullable()
                ->constrained('users')
                ->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();
            $table->string('admin_note', 255)->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('merchant_cashins');
    }
};
