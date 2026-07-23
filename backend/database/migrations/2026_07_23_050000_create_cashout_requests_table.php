<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// ZAINEX_CASHOUT_REQUEST_V1
// User-initiated wallet withdrawal requests. Payment rails aren't
// finalized yet, so destination_note is a free-text placeholder (e.g.
// "GCash 0917xxx") rather than a structured payment-method field —
// this will very likely need a real payment_method/destination schema
// once that's decided. Mirrors merchant_cashins' pending -> admin
// review -> approved/rejected shape, just for money leaving instead of
// entering the platform.

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('cashout_requests', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')
                ->nullable()
                ->constrained('users')
                ->nullOnDelete();
            $table->unsignedBigInteger('trading_account_id')->nullable();
            $table->decimal('amount', 30, 8);
            $table->text('destination_note')->nullable();
            $table->string('status', 20)->default('pending');
            $table->foreignId('reviewed_by')
                ->nullable()
                ->constrained('users')
                ->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();
            $table->string('admin_note', 255)->nullable();
            $table->timestamps();

            $table->index(['trading_account_id', 'status']);
            $table->index(['status', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('cashout_requests');
    }
};
