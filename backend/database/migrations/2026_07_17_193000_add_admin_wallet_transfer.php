<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// ZAINEX_ROOT_ADMIN_WALLET_TRANSFER_V1

return new class extends Migration
{
    public function up(): void
    {
        if (
            ! Schema::hasColumn(
                'users',
                'is_admin',
            )
        ) {
            Schema::table(
                'users',
                function (
                    Blueprint $table,
                ): void {
                    $table
                        ->boolean('is_admin')
                        ->default(false)
                        ->index();
                },
            );
        }

        if (
            ! Schema::hasTable(
                'admin_wallet_transfers',
            )
        ) {
            Schema::create(
                'admin_wallet_transfers',
                function (
                    Blueprint $table,
                ): void {
                    $table->id();

                    $table
                        ->foreignId(
                            'sender_user_id',
                        )
                        ->constrained('users')
                        ->restrictOnDelete();

                    $table
                        ->foreignId(
                            'recipient_user_id',
                        )
                        ->constrained('users')
                        ->restrictOnDelete();

                    $table
                        ->foreignId(
                            'sender_trading_account_id',
                        )
                        ->constrained(
                            'trading_accounts',
                        )
                        ->restrictOnDelete();

                    $table
                        ->foreignId(
                            'recipient_trading_account_id',
                        )
                        ->constrained(
                            'trading_accounts',
                        )
                        ->restrictOnDelete();

                    $table->string(
                        'recipient_email_snapshot',
                        255,
                    );

                    $table->decimal(
                        'amount',
                        30,
                        8,
                    );

                    $table->decimal(
                        'sender_wallet_before',
                        30,
                        8,
                    );

                    $table->decimal(
                        'sender_wallet_after',
                        30,
                        8,
                    );

                    $table->decimal(
                        'sender_available_before',
                        30,
                        8,
                    );

                    $table->decimal(
                        'sender_available_after',
                        30,
                        8,
                    );

                    $table->decimal(
                        'recipient_wallet_before',
                        30,
                        8,
                    );

                    $table->decimal(
                        'recipient_wallet_after',
                        30,
                        8,
                    );

                    $table->decimal(
                        'recipient_available_before',
                        30,
                        8,
                    );

                    $table->decimal(
                        'recipient_available_after',
                        30,
                        8,
                    );

                    $table
                        ->uuid(
                            'client_request_id',
                        );

                    $table
                        ->string(
                            'reference_key',
                            191,
                        )
                        ->unique();

                    $table
                        ->string(
                            'status',
                            24,
                        )
                        ->default(
                            'COMPLETED',
                        );

                    $table
                        ->text('metadata')
                        ->nullable();

                    $table->timestamp(
                        'occurred_at',
                    );

                    $table
                        ->timestamp('created_at')
                        ->useCurrent();

                    $table->unique(
                        [
                            'sender_user_id',
                            'client_request_id',
                        ],
                        'admin_wallet_sender_request_unique',
                    );

                    $table->index(
                        [
                            'sender_user_id',
                            'occurred_at',
                        ],
                        'admin_wallet_sender_time_idx',
                    );

                    $table->index(
                        [
                            'recipient_user_id',
                            'occurred_at',
                        ],
                        'admin_wallet_recipient_time_idx',
                    );
                },
            );
        }
    }

    public function down(): void
    {
        Schema::dropIfExists(
            'admin_wallet_transfers',
        );

        if (
            Schema::hasColumn(
                'users',
                'is_admin',
            )
        ) {
            Schema::table(
                'users',
                function (
                    Blueprint $table,
                ): void {
                    $table->dropColumn(
                        'is_admin',
                    );
                },
            );
        }
    }
};