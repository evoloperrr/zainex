<?php

// ZAINEX_DB_PHASE2A_COMBINED_USER_WALLET_INVITER_FUTURES_V2_4

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->decimal('wallet_balance', 30, 8)->default(0);
            $table->foreignId('inviter_id')
                ->nullable()
                ->constrained('users')
                ->nullOnDelete();
        });

        Schema::create('futures_orders', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->foreignId('trading_account_id')
                ->constrained('trading_accounts')
                ->cascadeOnDelete();
            $table->string('client_order_id', 80);
            $table->string('symbol', 24);
            $table->string('direction', 8);
            $table->string('action', 16);
            $table->string('order_type', 16)->default('MARKET');
            $table->string('margin_mode', 16)->default('ISOLATED');
            $table->string('position_mode', 16)->default('ONE_WAY');
            $table->unsignedSmallInteger('leverage');
            $table->decimal('margin', 30, 8);
            $table->decimal('quantity', 30, 12);
            $table->decimal('requested_price', 30, 8)->nullable();
            $table->decimal('executed_price', 30, 8);
            $table->decimal('notional', 30, 8);
            $table->decimal('fee', 30, 8)->default(0);
            $table->decimal('fee_rate', 18, 10)->default(0);
            $table->decimal('stop_loss', 30, 8)->nullable();
            $table->decimal('take_profit', 30, 8)->nullable();
            $table->boolean('reduce_only')->default(false);
            $table->string('quote_provider', 64);
            $table->string('status', 24);
            $table->string('rejection_code', 96)->nullable();
            $table->timestamp('filled_at')->nullable();
            $table->timestamp('cancelled_at')->nullable();
            $table->timestamps();

            $table->unique(
                ['trading_account_id', 'client_order_id'],
                'futures_orders_account_client_unique'
            );
            $table->index(
                ['trading_account_id', 'created_at'],
                'futures_orders_account_created_idx'
            );
            $table->index(
                ['trading_account_id', 'symbol', 'status'],
                'futures_orders_account_symbol_status_idx'
            );
        });

        Schema::create('futures_positions', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->foreignId('trading_account_id')
                ->constrained('trading_accounts')
                ->cascadeOnDelete();
            $table->string('symbol', 24);
            $table->string('direction', 8);
            $table->string('status', 24)->default('OPEN');
            $table->unsignedTinyInteger('open_slot')->nullable()->default(1);
            $table->string('position_mode', 16)->default('ONE_WAY');
            $table->string('margin_mode', 16)->default('ISOLATED');
            $table->unsignedSmallInteger('leverage');
            $table->decimal('margin', 30, 8);
            $table->decimal('quantity', 30, 12);
            $table->decimal('entry_price', 30, 8);
            $table->decimal('mark_price', 30, 8);
            $table->decimal('liquidation_price', 30, 8);
            $table->decimal('stop_loss', 30, 8);
            $table->decimal('take_profit', 30, 8);
            $table->decimal('maintenance_margin_rate', 18, 10);
            $table->decimal('entry_notional', 30, 8);
            $table->decimal('current_notional', 30, 8);
            $table->decimal('unrealized_pnl', 30, 8)->default(0);
            $table->decimal('realized_pnl', 30, 8)->default(0);
            $table->decimal('entry_fee', 30, 8)->default(0);
            $table->decimal('close_fee', 30, 8)->default(0);
            $table->decimal('funding_fee', 30, 8)->default(0);
            $table->decimal('net_pnl', 30, 8)->default(0);
            $table->string('mark_provider', 64);
            $table->string('close_reason', 32)->nullable();
            $table->unsignedBigInteger('version')->default(1);
            $table->timestamp('opened_at');
            $table->timestamp('closed_at')->nullable();
            $table->timestamps();

            $table->unique(
                ['trading_account_id', 'symbol', 'open_slot'],
                'futures_positions_one_open_symbol_unique'
            );
            $table->index(
                ['trading_account_id', 'status'],
                'futures_positions_account_status_idx'
            );
            $table->index(
                ['trading_account_id', 'closed_at'],
                'futures_positions_account_closed_idx'
            );
        });

        Schema::create('trading_executions', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->foreignId('trading_account_id')
                ->constrained('trading_accounts')
                ->cascadeOnDelete();
            $table->uuid('order_id');
            $table->uuid('position_id')->nullable();
            $table->string('market_type', 24);
            $table->string('symbol', 24);
            $table->string('direction', 8);
            $table->string('action', 16);
            $table->string('execution_type', 24);
            $table->decimal('quantity', 30, 12);
            $table->decimal('price', 30, 8);
            $table->decimal('entry_price', 30, 8);
            $table->decimal('notional', 30, 8);
            $table->decimal('fee', 30, 8)->default(0);
            $table->decimal('realized_pnl', 30, 8)->default(0);
            $table->string('close_reason', 32)->nullable();
            $table->string('quote_provider', 64);
            $table->json('metadata')->nullable();
            $table->timestamp('executed_at');
            $table->timestamp('created_at')->useCurrent();

            $table->foreign('order_id')
                ->references('id')
                ->on('futures_orders')
                ->restrictOnDelete();
            $table->foreign('position_id')
                ->references('id')
                ->on('futures_positions')
                ->nullOnDelete();

            $table->unique(
                ['trading_account_id', 'order_id'],
                'trading_executions_account_order_unique'
            );
            $table->index(
                ['trading_account_id', 'executed_at'],
                'trading_executions_account_executed_idx'
            );
            $table->index(
                ['trading_account_id', 'position_id'],
                'trading_executions_account_position_idx'
            );
            $table->index(
                ['trading_account_id', 'close_reason'],
                'trading_executions_account_reason_idx'
            );
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('trading_executions');
        Schema::dropIfExists('futures_positions');
        Schema::dropIfExists('futures_orders');

        Schema::table('users', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('inviter_id');
            $table->dropColumn('wallet_balance');
        });
    }
};