<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// ZAINEX_REFERRAL_REWARD_PERCENTAGES_V1

return new class extends Migration
{
    public function up(): void
    {
        if (
            ! Schema::hasColumn(
                'users',
                'referral_credit_balance',
            )
        ) {
            Schema::table(
                'users',
                function (Blueprint $table): void {
                    $table
                        ->decimal(
                            'referral_credit_balance',
                            30,
                            8,
                        )
                        ->default(0);
                },
            );
        }

        if (! Schema::hasTable('referral_rewards')) {
            Schema::create(
                'referral_rewards',
                function (Blueprint $table): void {
                    $table->id();

                    $table
                        ->foreignId('source_user_id')
                        ->constrained('users')
                        ->cascadeOnDelete();

                    $table
                        ->foreignId('beneficiary_user_id')
                        ->constrained('users')
                        ->cascadeOnDelete();

                    $table->unsignedTinyInteger('level');
                    $table->unsignedSmallInteger('rate_bps');

                    $table->decimal(
                        'base_credits',
                        30,
                        8,
                    );

                    $table->decimal(
                        'reward_credits',
                        30,
                        8,
                    );

                    $table->decimal(
                        'balance_before',
                        30,
                        8,
                    );

                    $table->decimal(
                        'balance_after',
                        30,
                        8,
                    );

                    $table->string('source_type', 48);

                    $table->string(
                        'source_reference',
                        191,
                    );

                    $table
                        ->string('reference_key', 191)
                        ->unique();

                    $table->timestamp('occurred_at');

                    $table
                        ->timestamp('created_at')
                        ->useCurrent();

                    $table->index(
                        [
                            'beneficiary_user_id',
                            'occurred_at',
                        ],
                        'referral_rewards_beneficiary_time_idx',
                    );

                    $table->index(
                        [
                            'source_user_id',
                            'source_type',
                        ],
                        'referral_rewards_source_type_idx',
                    );

                    $table->unique(
                        [
                            'source_type',
                            'source_reference',
                            'level',
                        ],
                        'referral_rewards_source_level_unique',
                    );
                },
            );
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('referral_rewards');

        if (
            Schema::hasColumn(
                'users',
                'referral_credit_balance',
            )
        ) {
            Schema::table(
                'users',
                function (Blueprint $table): void {
                    $table->dropColumn(
                        'referral_credit_balance',
                    );
                },
            );
        }
    }
};