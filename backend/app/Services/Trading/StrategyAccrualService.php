<?php

declare(strict_types=1);

namespace App\Services\Trading;

use Brick\Math\BigDecimal;
use Brick\Math\RoundingMode;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

// ZAINEX_STRATEGY_DAILY_ACCRUAL_ENGINE_C1_V1

final class StrategyAccrualService
{
    /**
     * @return array{
     *     dueActivations: int,
     *     processedActivations: int,
     *     creditedDays: int,
     *     completedActivations: int,
     *     profitCredited: float,
     *     principalReleased: float
     * }
     */
    public function accrueDue(
        ?Carbon $asOf = null,
    ): array {
        $asOf ??= now();

        $activationIds = DB::table(
            'strategy_activations',
        )
            ->where('status', 'ACTIVE')
            ->whereNotNull('next_accrual_at')
            ->where(
                'next_accrual_at',
                '<=',
                $asOf,
            )
            ->orderBy('next_accrual_at')
            ->orderBy('id')
            ->pluck('id')
            ->map(
                static fn (mixed $id): int =>
                    (int) $id,
            )
            ->all();

        $summary = [
            'dueActivations' =>
                count($activationIds),
            'processedActivations' =>
                0,
            'creditedDays' =>
                0,
            'completedActivations' =>
                0,
            'profitCredited' =>
                BigDecimal::zero()
                    ->toScale(
                        8,
                        RoundingMode::Down,
                    ),
            'principalReleased' =>
                BigDecimal::zero()
                    ->toScale(
                        8,
                        RoundingMode::Down,
                    ),
        ];

        foreach ($activationIds as $activationId) {
            $result = $this->accrueActivation(
                $activationId,
                $asOf,
            );

            if ($result['creditedDays'] > 0) {
                $summary['processedActivations']++;
            }

            $summary['creditedDays'] +=
                $result['creditedDays'];

            $summary['completedActivations'] +=
                $result['completed'] ? 1 : 0;

            $summary['profitCredited'] =
                $summary['profitCredited']
                    ->plus(
                        $result['profitCredited'],
                    )
                    ->toScale(
                        8,
                        RoundingMode::Down,
                    );

            $summary['principalReleased'] =
                $summary['principalReleased']
                    ->plus(
                        $result['principalReleased'],
                    )
                    ->toScale(
                        8,
                        RoundingMode::Down,
                    );
        }

        return [
            'dueActivations' =>
                $summary['dueActivations'],
            'processedActivations' =>
                $summary['processedActivations'],
            'creditedDays' =>
                $summary['creditedDays'],
            'completedActivations' =>
                $summary['completedActivations'],
            'profitCredited' =>
                (float)
                    (string)
                        $summary['profitCredited'],
            'principalReleased' =>
                (float)
                    (string)
                        $summary['principalReleased'],
        ];
    }

    /**
     * @return array{
     *     creditedDays: int,
     *     completed: bool,
     *     profitCredited: BigDecimal,
     *     principalReleased: BigDecimal
     * }
     */
    private function accrueActivation(
        int $activationId,
        Carbon $asOf,
    ): array {
        return DB::transaction(
            function () use (
                $activationId,
                $asOf,
            ): array {
                $zero = BigDecimal::zero()
                    ->toScale(
                        8,
                        RoundingMode::Down,
                    );

                $activation = DB::table(
                    'strategy_activations',
                )
                    ->where('id', $activationId)
                    ->lockForUpdate()
                    ->first();

                if (
                    $activation === null ||
                    $activation->status !== 'ACTIVE' ||
                    $activation->next_accrual_at === null
                ) {
                    return [
                        'creditedDays' => 0,
                        'completed' => false,
                        'profitCredited' => $zero,
                        'principalReleased' => $zero,
                    ];
                }

                $account = DB::table(
                    'trading_accounts',
                )
                    ->where(
                        'id',
                        $activation->trading_account_id,
                    )
                    ->lockForUpdate()
                    ->first();

                $user = DB::table('users')
                    ->where(
                        'id',
                        $activation->user_id,
                    )
                    ->lockForUpdate()
                    ->first();

                if (
                    $account === null ||
                    $user === null
                ) {
                    throw new \RuntimeException(
                        'Strategy accrual account or user is missing.',
                    );
                }

                $balance = DB::table(
                    'trading_balances',
                )
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

                if ($balance === null) {
                    throw new \RuntimeException(
                        'Strategy accrual balance is missing.',
                    );
                }

                $principal = BigDecimal::of(
                    (string)
                        $activation->allocated_amount,
                )->toScale(
                    8,
                    RoundingMode::Down,
                );

                $dailyRate = BigDecimal::of(
                    (string)
                        $activation->daily_rate,
                )->toScale(
                    10,
                    RoundingMode::Down,
                );

                $wallet = BigDecimal::of(
                    (string)
                        $user->wallet_balance,
                )->toScale(
                    8,
                    RoundingMode::Down,
                );

                $available = BigDecimal::of(
                    (string)
                        $balance->available_balance,
                )->toScale(
                    8,
                    RoundingMode::Down,
                );

                $strategyLocked = BigDecimal::of(
                    (string)
                        $balance->strategy_locked_balance,
                )->toScale(
                    8,
                    RoundingMode::Down,
                );

                $accruedProfit = BigDecimal::of(
                    (string)
                        $activation->accrued_profit,
                )->toScale(
                    8,
                    RoundingMode::Down,
                );

                $paidDays =
                    (int) $activation->paid_days;

                $termDays = max(
                    1,
                    (int) $activation->term_days,
                );

                $nextAccrualAt = Carbon::parse(
                    (string)
                        $activation->next_accrual_at,
                );

                $lastAccrualAt =
                    $activation->last_accrual_at;

                $profitCredited = $zero;
                $principalReleased = $zero;
                $creditedDays = 0;
                $completed = false;

                while (
                    $paidDays < $termDays &&
                    $nextAccrualAt->lessThanOrEqualTo(
                        $asOf,
                    )
                ) {
                    $dayNumber = $paidDays + 1;
                    $scheduledFor =
                        $nextAccrualAt->copy();

                    $alreadyCredited = DB::table(
                        'strategy_daily_accruals',
                    )
                        ->where(
                            'strategy_activation_id',
                            $activation->id,
                        )
                        ->where(
                            'day_number',
                            $dayNumber,
                        )
                        ->exists();

                    if ($alreadyCredited) {
                        throw new \RuntimeException(
                            'Strategy accrual state is inconsistent.',
                        );
                    }

                    $profit = $principal
                        ->multipliedBy($dailyRate)
                        ->toScale(
                            8,
                            RoundingMode::Down,
                        );

                    $walletBefore = $wallet;
                    $availableBefore = $available;
                    $strategyBefore =
                        $strategyLocked;

                    $wallet = $wallet
                        ->plus($profit)
                        ->toScale(
                            8,
                            RoundingMode::Down,
                        );

                    $available = $available
                        ->plus($profit)
                        ->toScale(
                            8,
                            RoundingMode::Down,
                        );

                    $profitTransactionId =
                        DB::table(
                            'wallet_transactions',
                        )->insertGetId([
                            'trading_account_id' =>
                                $account->id,
                            'user_id' =>
                                $user->id,
                            'strategy_activation_id' =>
                                $activation->id,
                            'event_type' =>
                                'STRATEGY_DAILY_PROFIT',
                            'direction' =>
                                'CREDIT',
                            'asset' =>
                                $account->base_asset,
                            'amount' =>
                                (string) $profit,
                            'wallet_balance_before' =>
                                (string) $walletBefore,
                            'wallet_balance_after' =>
                                (string) $wallet,
                            'available_balance_before' =>
                                (string) $availableBefore,
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
                                ':day:' .
                                $dayNumber .
                                ':profit',
                            'description' =>
                                'Paper strategy daily profit credited.',
                            'metadata' =>
                                json_encode(
                                    [
                                        'paper' => true,
                                        'dayNumber' =>
                                            $dayNumber,
                                        'termDays' =>
                                            $termDays,
                                        'dailyRate' =>
                                            (string) $dailyRate,
                                        'principal' =>
                                            (string) $principal,
                                    ],
                                    JSON_THROW_ON_ERROR,
                                ),
                            'occurred_at' =>
                                $asOf,
                            'created_at' =>
                                $asOf,
                        ]);

                    DB::table(
                        'strategy_daily_accruals',
                    )->insert([
                        'strategy_activation_id' =>
                            $activation->id,
                        'wallet_transaction_id' =>
                            $profitTransactionId,
                        'day_number' =>
                            $dayNumber,
                        'scheduled_for' =>
                            $scheduledFor,
                        'principal_basis' =>
                            (string) $principal,
                        'daily_rate' =>
                            (string) $dailyRate,
                        'profit_amount' =>
                            (string) $profit,
                        'wallet_balance_before' =>
                            (string) $walletBefore,
                        'wallet_balance_after' =>
                            (string) $wallet,
                        'available_balance_before' =>
                            (string) $availableBefore,
                        'available_balance_after' =>
                            (string) $available,
                        'credited_at' =>
                            $asOf,
                        'created_at' =>
                            $asOf,
                    ]);

                    $paidDays++;
                    $creditedDays++;

                    $accruedProfit =
                        $accruedProfit
                            ->plus($profit)
                            ->toScale(
                                8,
                                RoundingMode::Down,
                            );

                    $profitCredited =
                        $profitCredited
                            ->plus($profit)
                            ->toScale(
                                8,
                                RoundingMode::Down,
                            );

                    $lastAccrualAt =
                        $scheduledFor;

                    if ($paidDays >= $termDays) {
                        if (
                            $strategyLocked
                                ->isLessThan(
                                    $principal,
                                )
                        ) {
                            throw new \RuntimeException(
                                'Strategy locked balance is lower than the principal release.',
                            );
                        }

                        $releaseAvailableBefore =
                            $available;

                        $releaseStrategyBefore =
                            $strategyLocked;

                        $available = $available
                            ->plus($principal)
                            ->toScale(
                                8,
                                RoundingMode::Down,
                            );

                        $strategyLocked =
                            $strategyLocked
                                ->minus($principal)
                                ->toScale(
                                    8,
                                    RoundingMode::Down,
                                );

                        DB::table(
                            'wallet_transactions',
                        )->insert([
                            'trading_account_id' =>
                                $account->id,
                            'user_id' =>
                                $user->id,
                            'strategy_activation_id' =>
                                $activation->id,
                            'event_type' =>
                                'STRATEGY_PRINCIPAL_RELEASED',
                            'direction' =>
                                'UNLOCK',
                            'asset' =>
                                $account->base_asset,
                            'amount' =>
                                (string) $principal,
                            'wallet_balance_before' =>
                                (string) $wallet,
                            'wallet_balance_after' =>
                                (string) $wallet,
                            'available_balance_before' =>
                                (string)
                                    $releaseAvailableBefore,
                            'available_balance_after' =>
                                (string) $available,
                            'strategy_locked_before' =>
                                (string)
                                    $releaseStrategyBefore,
                            'strategy_locked_after' =>
                                (string)
                                    $strategyLocked,
                            'ai_credits_before' =>
                                (int) $user->ai_credits,
                            'ai_credits_after' =>
                                (int) $user->ai_credits,
                            'reference_key' =>
                                'strategy:' .
                                $activation->id .
                                ':principal-release',
                            'description' =>
                                'Paper strategy principal released after the 30-day term.',
                            'metadata' =>
                                json_encode(
                                    [
                                        'paper' => true,
                                        'completedDay' =>
                                            $dayNumber,
                                        'termDays' =>
                                            $termDays,
                                    ],
                                    JSON_THROW_ON_ERROR,
                                ),
                            'occurred_at' =>
                                $asOf,
                            'created_at' =>
                                $asOf,
                        ]);

                        $principalReleased =
                            $principal;

                        $completed = true;
                        $nextAccrualAt = null;

                        break;
                    }

                    $nextAccrualAt =
                        $scheduledFor
                            ->copy()
                            ->addDay();
                }

                if ($creditedDays === 0) {
                    return [
                        'creditedDays' => 0,
                        'completed' => false,
                        'profitCredited' => $zero,
                        'principalReleased' => $zero,
                    ];
                }

                DB::table('users')
                    ->where('id', $user->id)
                    ->update([
                        'wallet_balance' =>
                            (string) $wallet,
                        'updated_at' =>
                            $asOf,
                    ]);

                DB::table('trading_balances')
                    ->where('id', $balance->id)
                    ->update([
                        'available_balance' =>
                            (string) $available,
                        'strategy_locked_balance' =>
                            (string) $strategyLocked,
                        'updated_at' =>
                            $asOf,
                    ]);

                DB::table(
                    'strategy_activations',
                )
                    ->where(
                        'id',
                        $activation->id,
                    )
                    ->update([
                        'status' =>
                            $completed
                                ? 'COMPLETED'
                                : 'ACTIVE',
                        'paid_days' =>
                            $paidDays,
                        'accrued_profit' =>
                            (string) $accruedProfit,
                        'last_accrual_at' =>
                            $lastAccrualAt,
                        'next_accrual_at' =>
                            $completed
                                ? null
                                : $nextAccrualAt,
                        'principal_released_at' =>
                            $completed
                                ? $asOf
                                : null,
                        'completed_at' =>
                            $completed
                                ? $asOf
                                : null,
                        'updated_at' =>
                            $asOf,
                    ]);

                return [
                    'creditedDays' =>
                        $creditedDays,
                    'completed' =>
                        $completed,
                    'profitCredited' =>
                        $profitCredited,
                    'principalReleased' =>
                        $principalReleased,
                ];
            },
            5,
        );
    }
}