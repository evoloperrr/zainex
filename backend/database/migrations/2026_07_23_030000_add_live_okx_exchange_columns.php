<?php

// ZAINEX_LIVE_OKX_TRADING_V1
// Additive-only columns so LIVE_OKX trading_accounts rows can reuse the
// existing futures_orders/futures_positions/trading_executions tables as
// a local mirror/audit trail of real exchange state. All nullable, so
// existing PAPER rows are completely unaffected.

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('trading_accounts', function (Blueprint $table): void {
            $table->foreignId('exchange_connection_id')
                ->nullable()
                ->after('user_id')
                ->constrained('exchange_connections')
                ->nullOnDelete();
        });

        Schema::table('futures_orders', function (Blueprint $table): void {
            $table->string('exchange_order_id', 64)->nullable()->after('client_order_id');
            $table->string('exchange_client_order_id', 32)->nullable()->after('exchange_order_id');
        });

        Schema::table('futures_positions', function (Blueprint $table): void {
            $table->string('exchange_instrument_id', 32)->nullable()->after('symbol');
        });

        Schema::table('trading_executions', function (Blueprint $table): void {
            $table->string('exchange_fill_id', 64)->nullable()->after('order_id');
            $table->string('fee_currency', 16)->nullable()->after('fee');
        });
    }

    public function down(): void
    {
        Schema::table('trading_executions', function (Blueprint $table): void {
            $table->dropColumn(['exchange_fill_id', 'fee_currency']);
        });

        Schema::table('futures_positions', function (Blueprint $table): void {
            $table->dropColumn('exchange_instrument_id');
        });

        Schema::table('futures_orders', function (Blueprint $table): void {
            $table->dropColumn(['exchange_order_id', 'exchange_client_order_id']);
        });

        Schema::table('trading_accounts', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('exchange_connection_id');
        });
    }
};
