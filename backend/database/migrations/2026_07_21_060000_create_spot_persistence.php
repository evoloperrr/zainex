<?php

// ZAINEX_SPOT_DB_PERSISTENCE_V1

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('spot_orders', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->foreignId('trading_account_id')
                ->constrained('trading_accounts')
                ->cascadeOnDelete();
            $table->string('client_order_id', 80);
            $table->string('asset_class', 16)->default('crypto');
            $table->string('symbol', 24);
            $table->string('side', 8);
            $table->string('order_type', 16)->default('MARKET');
            $table->decimal('quantity', 30, 12);
            $table->decimal('executed_price', 30, 8);
            $table->decimal('notional', 30, 8);
            $table->decimal('fee', 30, 8)->default(0);
            $table->decimal('fee_rate', 18, 10)->default(0);
            $table->decimal('stop_loss', 30, 8)->nullable();
            $table->decimal('take_profit', 30, 8)->nullable();
            $table->string('quote_provider', 64);
            $table->string('status', 24);
            $table->timestamp('filled_at')->nullable();
            $table->timestamps();

            $table->unique(
                ['trading_account_id', 'client_order_id'],
                'spot_orders_account_client_unique'
            );
            $table->index(
                ['trading_account_id', 'created_at'],
                'spot_orders_account_created_idx'
            );
        });

        Schema::create('spot_positions', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->foreignId('trading_account_id')
                ->constrained('trading_accounts')
                ->cascadeOnDelete();
            $table->string('asset_class', 16)->default('crypto');
            $table->string('symbol', 24);
            $table->string('status', 24)->default('OPEN');
            $table->unsignedTinyInteger('open_slot')->nullable()->default(1);
            $table->decimal('quantity', 30, 12);
            $table->decimal('average_entry_price', 30, 8);
            $table->decimal('mark_price', 30, 8);
            $table->decimal('stop_loss', 30, 8)->nullable();
            $table->decimal('take_profit', 30, 8)->nullable();
            $table->decimal('unrealized_pnl', 30, 8)->default(0);
            $table->decimal('realized_pnl', 30, 8)->default(0);
            $table->string('mark_provider', 64);
            $table->string('close_reason', 32)->nullable();
            $table->unsignedBigInteger('version')->default(1);
            $table->timestamp('opened_at');
            $table->timestamp('closed_at')->nullable();
            $table->timestamps();

            $table->unique(
                ['trading_account_id', 'symbol', 'open_slot'],
                'spot_positions_one_open_symbol_unique'
            );
            $table->index(
                ['trading_account_id', 'status'],
                'spot_positions_account_status_idx'
            );
        });

        Schema::create('spot_executions', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->foreignId('trading_account_id')
                ->constrained('trading_accounts')
                ->cascadeOnDelete();
            $table->uuid('order_id');
            $table->uuid('position_id')->nullable();
            $table->string('asset_class', 16)->default('crypto');
            $table->string('symbol', 24);
            $table->string('side', 8);
            $table->decimal('quantity', 30, 12);
            $table->decimal('price', 30, 8);
            $table->decimal('notional', 30, 8);
            $table->decimal('fee', 30, 8)->default(0);
            $table->decimal('realized_pnl', 30, 8)->default(0);
            $table->string('reason', 32)->default('USER');
            $table->string('quote_provider', 64);
            $table->json('metadata')->nullable();
            $table->timestamp('executed_at');
            $table->timestamp('created_at')->useCurrent();

            $table->foreign('order_id')
                ->references('id')
                ->on('spot_orders')
                ->restrictOnDelete();
            $table->foreign('position_id')
                ->references('id')
                ->on('spot_positions')
                ->nullOnDelete();

            $table->unique(
                ['trading_account_id', 'order_id'],
                'spot_executions_account_order_unique'
            );
            $table->index(
                ['trading_account_id', 'executed_at'],
                'spot_executions_account_executed_idx'
            );
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('spot_executions');
        Schema::dropIfExists('spot_positions');
        Schema::dropIfExists('spot_orders');
    }
};
