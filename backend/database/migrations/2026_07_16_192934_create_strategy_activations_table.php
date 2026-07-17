<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// ZAINEX_STRATEGY_ACTIVATION_BACKEND_V2_2

return new class extends Migration
{
    public function up(): void
    {
        Schema::create(
            'strategy_activations',
            function (Blueprint $table): void {
                $table->id();

                $table
                    ->foreignId('trading_account_id')
                    ->constrained('trading_accounts')
                    ->cascadeOnDelete();

                $table
                    ->foreignId('user_id')
                    ->constrained('users')
                    ->cascadeOnDelete();

                $table->uuid('client_request_id');
                $table->uuid('request_id');
                $table->char('request_hash', 64);

                $table->string('tier', 32);
                $table->string('strategy_name', 120);
                $table->string('rate_type', 32);
                $table->string('display_rate', 16);

                $table->decimal(
                    'allocated_amount',
                    30,
                    8,
                );

                $table->unsignedInteger(
                    'credit_cost',
                );

                $table
                    ->string('status', 24)
                    ->default('ACTIVE');

                $table->timestamps();

                $table->unique(
                    [
                        'trading_account_id',
                        'client_request_id',
                    ],
                    'strategy_activation_account_request_unique',
                );

                $table->index(
                    [
                        'trading_account_id',
                        'status',
                    ],
                    'strategy_activation_account_status_idx',
                );

                $table->index(
                    [
                        'user_id',
                        'created_at',
                    ],
                    'strategy_activation_user_created_idx',
                );
            },
        );
    }

    public function down(): void
    {
        Schema::dropIfExists(
            'strategy_activations',
        );
    }
};