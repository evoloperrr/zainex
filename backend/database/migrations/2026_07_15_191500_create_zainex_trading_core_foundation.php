<?php

// ZAINEX_DB_PHASE1_CORE_FOUNDATION_V1_2

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('trading_accounts', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')
                ->nullable()
                ->constrained('users')
                ->nullOnDelete();
            $table->string('external_session_id', 128)->unique();
            $table->string('account_type', 24)->default('PAPER');
            $table->string('mode', 32)->default('UNIFIED_PAPER');
            $table->string('base_asset', 16)->default('USDT');
            $table->string('status', 24)->default('ACTIVE');
            $table->decimal('starting_balance', 30, 8)->default(10000);
            $table->timestamps();

            $table->index(['user_id', 'status'], 'trading_accounts_user_status_idx');
            $table->index(['account_type', 'mode'], 'trading_accounts_type_mode_idx');
        });

        Schema::create('trading_balances', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('trading_account_id')
                ->constrained('trading_accounts')
                ->cascadeOnDelete();
            $table->string('asset', 16);
            $table->decimal('available_balance', 30, 8)->default(0);
            $table->decimal('locked_balance', 30, 8)->default(0);
            $table->decimal('realized_pnl', 30, 8)->default(0);
            $table->timestamps();

            $table->unique(
                ['trading_account_id', 'asset'],
                'trading_balances_account_asset_unique'
            );
        });

        Schema::create('idempotency_records', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('trading_account_id')
                ->constrained('trading_accounts')
                ->cascadeOnDelete();
            $table->string('idempotency_key', 128);
            $table->string('route', 191);
            $table->char('request_hash', 64);
            $table->unsignedSmallInteger('response_status')->nullable();
            $table->json('response_body')->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->timestamps();

            $table->unique(
                ['trading_account_id', 'route', 'idempotency_key'],
                'idempotency_account_route_key_unique'
            );
            $table->index('expires_at', 'idempotency_expires_at_idx');
        });

        Schema::create('trading_audit_logs', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('trading_account_id')
                ->nullable()
                ->constrained('trading_accounts')
                ->nullOnDelete();
            $table->string('actor_type', 32);
            $table->string('actor_id', 128)->nullable();
            $table->string('event', 128);
            $table->string('request_id', 64);
            $table->string('client_order_id', 128)->nullable();
            $table->string('ip_address', 45)->nullable();
            $table->text('user_agent')->nullable();
            $table->char('payload_hash', 64);
            $table->json('metadata')->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->index(
                ['trading_account_id', 'created_at'],
                'trading_audit_account_created_idx'
            );
            $table->index('request_id', 'trading_audit_request_idx');
            $table->index('client_order_id', 'trading_audit_client_order_idx');
            $table->index('event', 'trading_audit_event_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('trading_audit_logs');
        Schema::dropIfExists('idempotency_records');
        Schema::dropIfExists('trading_balances');
        Schema::dropIfExists('trading_accounts');
    }
};