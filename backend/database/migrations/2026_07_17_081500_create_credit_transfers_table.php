<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// ZAINEX_USER_CREDIT_TRANSFER_V1

return new class extends Migration
{
    public function up(): void
    {
        Schema::create(
            'credit_transfers',
            function (Blueprint $table): void {
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

                $table->string(
                    'recipient_email_snapshot',
                    255,
                );

                $table
                    ->unsignedBigInteger(
                        'amount',
                    );

                $table
                    ->unsignedBigInteger(
                        'sender_credits_before',
                    );

                $table
                    ->unsignedBigInteger(
                        'sender_credits_after',
                    );

                $table
                    ->unsignedBigInteger(
                        'recipient_credits_before',
                    );

                $table
                    ->unsignedBigInteger(
                        'recipient_credits_after',
                    );

                $table->uuid(
                    'client_request_id',
                );

                $table
                    ->string(
                        'reference_key',
                        191,
                    )
                    ->unique();

                $table
                    ->string('status', 24)
                    ->default('COMPLETED');

                $table
                    ->json('metadata')
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
                    'credit_transfers_sender_request_unique',
                );

                $table->index(
                    [
                        'sender_user_id',
                        'occurred_at',
                    ],
                    'credit_transfers_sender_time_idx',
                );

                $table->index(
                    [
                        'recipient_user_id',
                        'occurred_at',
                    ],
                    'credit_transfers_recipient_time_idx',
                );
            },
        );
    }

    public function down(): void
    {
        Schema::dropIfExists(
            'credit_transfers',
        );
    }
};