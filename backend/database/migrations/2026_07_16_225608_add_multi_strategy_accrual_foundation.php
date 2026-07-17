<?php

declare(strict_types=1);

use Brick\Math\BigDecimal;
use Brick\Math\RoundingMode;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// ZAINEX_MULTI_STRATEGY_ACCRUAL_FOUNDATION_V1_2

return new class extends Migration
{
    public function up(): void
    {
        Schema::table(
            'trading_balances',
            function (Blueprint $table): void {
                $table
                    ->decimal(
                        'strategy_locked_balance',
                        30,
                        8,
                    )
                    ->default(0);
            },
        );

        Schema::table(
            'strategy_activations',
            function (Blueprint $table): void {
                $table
                    ->decimal('daily_rate', 18, 10)
                    ->default(0);

                $table
                    ->unsignedSmallInteger('term_days')
                    ->default(30);

                $table
                    ->unsignedSmallInteger('paid_days')
                    ->default(0);

                $table
                    ->decimal('accrued_profit', 30, 8)
                    ->default(0);

                $table->timestamp('started_at')->nullable();
                $table->timestamp('next_accrual_at')->nullable();
                $table->timestamp('last_accrual_at')->nullable();
                $table->timestamp('matures_at')->nullable();
                $table->timestamp('principal_released_at')->nullable();
                $table->timestamp('completed_at')->nullable();

                $table->index(
                    [
                        'status',
                        'next_accrual_at',
                    ],
                    'strategy_due_accrual_idx',
                );
            },
        );

        Schema::create(
            'wallet_transactions',
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

                $table
                    ->foreignId('strategy_activation_id')
                    ->nullable()
                    ->constrained('strategy_activations')
                    ->nullOnDelete();

                $table->string('event_type', 64);
                $table->string('direction', 16);
                $table->string('asset', 16)->default('USDT');
                $table->decimal('amount', 30, 8);
                $table->decimal('wallet_balance_before', 30, 8);
                $table->decimal('wallet_balance_after', 30, 8);
                $table->decimal('available_balance_before', 30, 8);
                $table->decimal('available_balance_after', 30, 8);
                $table->decimal('strategy_locked_before', 30, 8);
                $table->decimal('strategy_locked_after', 30, 8);

                $table
                    ->unsignedBigInteger('ai_credits_before')
                    ->nullable();

                $table
                    ->unsignedBigInteger('ai_credits_after')
                    ->nullable();

                $table
                    ->string('reference_key', 191)
                    ->unique();

                $table
                    ->string('description', 191)
                    ->nullable();

                $table->json('metadata')->nullable();
                $table->timestamp('occurred_at');
                $table->timestamp('created_at')->useCurrent();

                $table->index(
                    [
                        'trading_account_id',
                        'occurred_at',
                    ],
                    'wallet_tx_account_time_idx',
                );

                $table->index(
                    [
                        'event_type',
                        'occurred_at',
                    ],
                    'wallet_tx_event_time_idx',
                );
            },
        );

        Schema::create(
            'strategy_daily_accruals',
            function (Blueprint $table): void {
                $table->id();

                $table
                    ->foreignId('strategy_activation_id')
                    ->constrained('strategy_activations')
                    ->cascadeOnDelete();

                $table
                    ->foreignId('wallet_transaction_id')
                    ->nullable()
                    ->constrained('wallet_transactions')
                    ->nullOnDelete();

                $table->unsignedSmallInteger('day_number');
                $table->timestamp('scheduled_for');
                $table->decimal('principal_basis', 30, 8);
                $table->decimal('daily_rate', 18, 10);
                $table->decimal('profit_amount', 30, 8);
                $table->decimal('wallet_balance_before', 30, 8);
                $table->decimal('wallet_balance_after', 30, 8);
                $table->decimal('available_balance_before', 30, 8);
                $table->decimal('available_balance_after', 30, 8);
                $table->timestamp('credited_at');
                $table->timestamp('created_at')->useCurrent();

                $table->unique(
                    [
                        'strategy_activation_id',
                        'day_number',
                    ],
                    'strategy_accrual_day_unique',
                );

                $table->unique(
                    'wallet_transaction_id',
                    'strategy_accrual_wallet_tx_unique',
                );
            },
        );

        DB::transaction(function (): void {
            $accountIds = DB::table('strategy_activations')
                ->where('status', 'ACTIVE')
                ->distinct()
                ->pluck('trading_account_id');

            foreach ($accountIds as $accountId) {
                $account = DB::table('trading_accounts')
                    ->where('id', $accountId)
                    ->lockForUpdate()
                    ->first();

                if (
                    $account === null ||
                    $account->user_id === null
                ) {
                    throw new \RuntimeException(
                        'Strategy account is invalid.',
                    );
                }

                $user = DB::table('users')
                    ->where('id', $account->user_id)
                    ->lockForUpdate()
                    ->first();

                $balance = DB::table('trading_balances')
                    ->where(
                        'trading_account_id',
                        $account->id,
                    )
                    ->where(
                        'asset',
                        $account->base_asset,
                    )
                    ->lockForUpdate()
                    ->first();

                if (
                    $user === null ||
                    $balance === null
                ) {
                    throw new \RuntimeException(
                        'Strategy balance state is incomplete.',
                    );
                }

                $wallet = BigDecimal::of(
                    (string) $user->wallet_balance,
                )->toScale(
                    8,
                    RoundingMode::Down,
                );

                $available = BigDecimal::of(
                    (string) $balance->available_balance,
                )->toScale(
                    8,
                    RoundingMode::Down,
                );

                $strategyLocked = BigDecimal::of(
                    (string) $balance->strategy_locked_balance,
                )->toScale(
                    8,
                    RoundingMode::Down,
                );

                $activations = DB::table('strategy_activations')
                    ->where(
                        'trading_account_id',
                        $account->id,
                    )
                    ->where('status', 'ACTIVE')
                    ->orderBy('id')
                    ->lockForUpdate()
                    ->get();

                foreach ($activations as $activation) {
                    $amount = BigDecimal::of(
                        (string) $activation->allocated_amount,
                    )->toScale(
                        8,
                        RoundingMode::Down,
                    );

                    $rate = match ($activation->tier) {
                        'VIP 3' => '0.0300000000',
                        'VIP 2' => '0.0200000000',
                        default => '0.0100000000',
                    };

                    $startedAt = Carbon::parse(
                        (string) $activation->created_at,
                    );

                    $walletBefore = $wallet;
                    $strategyBefore = $strategyLocked;

                    $wallet = $wallet
                        ->plus($amount)
                        ->toScale(
                            8,
                            RoundingMode::Down,
                        );

                    $strategyLocked = $strategyLocked
                        ->plus($amount)
                        ->toScale(
                            8,
                            RoundingMode::Down,
                        );

                    DB::table('strategy_activations')
                        ->where('id', $activation->id)
                        ->update([
                            'daily_rate' => $rate,
                            'term_days' => 30,
                            'paid_days' => 0,
                            'accrued_profit' => '0.00000000',
                            'started_at' => $startedAt,
                            'next_accrual_at' =>
                                $startedAt->copy()->addDay(),
                            'last_accrual_at' => null,
                            'matures_at' =>
                                $startedAt->copy()->addDays(30),
                            'principal_released_at' => null,
                            'completed_at' => null,
                            'updated_at' => now(),
                        ]);

                    DB::table('wallet_transactions')
                        ->insert([
                            'trading_account_id' =>
                                $account->id,
                            'user_id' =>
                                $user->id,
                            'strategy_activation_id' =>
                                $activation->id,
                            'event_type' =>
                                'LEGACY_STRATEGY_PRINCIPAL_RECLASSIFIED',
                            'direction' => 'LOCK',
                            'asset' => $account->base_asset,
                            'amount' => (string) $amount,
                            'wallet_balance_before' =>
                                (string) $walletBefore,
                            'wallet_balance_after' =>
                                (string) $wallet,
                            'available_balance_before' =>
                                (string) $available,
                            'available_balance_after' =>
                                (string) $available,
                            'strategy_locked_before' =>
                                (string) $strategyBefore,
                            'strategy_locked_after' =>
                                (string) $strategyLocked,
                            'ai_credits_before' =>
                                (int) $user->ai_credits,
                            'ai_credits_after' =>
                                (int) $user->ai_credits,
                            'reference_key' =>
                                'strategy:' .
                                $activation->id .
                                ':legacy-principal-reclassification',
                            'description' =>
                                'Existing paper strategy principal moved into strategy-locked accounting.',
                            'metadata' =>
                                json_encode(
                                    [
                                        'paper' => true,
                                        'legacy' => true,
                                        'availableBalanceChanged' =>
                                            false,
                                        'creditsChanged' =>
                                            false,
                                    ],
                                    JSON_THROW_ON_ERROR,
                                ),
                            'occurred_at' => now(),
                            'created_at' => now(),
                        ]);
                }

                DB::table('users')
                    ->where('id', $user->id)
                    ->update([
                        'wallet_balance' => (string) $wallet,
                        'updated_at' => now(),
                    ]);

                DB::table('trading_balances')
                    ->where('id', $balance->id)
                    ->update([
                        'strategy_locked_balance' =>
                            (string) $strategyLocked,
                        'updated_at' => now(),
                    ]);
            }
        });
    }

    public function down(): void
    {
        if (
            Schema::hasTable('strategy_daily_accruals') &&
            DB::table('strategy_daily_accruals')->count() > 0
        ) {
            throw new \RuntimeException(
                'Cannot roll back after daily accruals exist.',
            );
        }

        DB::transaction(function (): void {
            $transactions = DB::table('wallet_transactions')
                ->where(
                    'event_type',
                    'LEGACY_STRATEGY_PRINCIPAL_RECLASSIFIED',
                )
                ->orderByDesc('id')
                ->get();

            foreach ($transactions as $transaction) {
                DB::table('users')
                    ->where('id', $transaction->user_id)
                    ->update([
                        'wallet_balance' =>
                            $transaction->wallet_balance_before,
                        'updated_at' => now(),
                    ]);

                DB::table('trading_balances')
                    ->where(
                        'trading_account_id',
                        $transaction->trading_account_id,
                    )
                    ->where('asset', $transaction->asset)
                    ->update([
                        'strategy_locked_balance' =>
                            $transaction->strategy_locked_before,
                        'updated_at' => now(),
                    ]);
            }
        });

        Schema::dropIfExists('strategy_daily_accruals');
        Schema::dropIfExists('wallet_transactions');

        Schema::table(
            'strategy_activations',
            function (Blueprint $table): void {
                $table->dropIndex(
                    'strategy_due_accrual_idx',
                );

                $table->dropColumn([
                    'daily_rate',
                    'term_days',
                    'paid_days',
                    'accrued_profit',
                    'started_at',
                    'next_accrual_at',
                    'last_accrual_at',
                    'matures_at',
                    'principal_released_at',
                    'completed_at',
                ]);
            },
        );

        Schema::table(
            'trading_balances',
            function (Blueprint $table): void {
                $table->dropColumn(
                    'strategy_locked_balance',
                );
            },
        );
    }
};