<?php

declare(strict_types=1);

namespace App\Services\Referral;

use Brick\Math\BigDecimal;
use Brick\Math\RoundingMode;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

// ZAINEX_REFERRAL_REWARD_PERCENTAGES_V1

final class ReferralRewardService
{
    /**
     * @return array<int, array<string, mixed>>
     */
    public function distribute(
        int $sourceUserId,
        string $sourceType,
        string $sourceReference,
        string|int|float $baseCredits,
        ?CarbonInterface $occurredAt = null,
    ): array {
        $sourceType =
            strtoupper(trim($sourceType));

        $sourceReference =
            trim($sourceReference);

        $allowedSourceTypes =
            array_map(
                static fn (mixed $value): string =>
                    strtoupper(
                        trim((string) $value),
                    ),
                (array) config(
                    'referral_rewards.allowed_source_types',
                    [],
                ),
            );

        if (
            ! in_array(
                $sourceType,
                $allowedSourceTypes,
                true,
            )
        ) {
            throw new InvalidArgumentException(
                'Unsupported referral reward source type.',
            );
        }

        if ($sourceReference === '') {
            throw new InvalidArgumentException(
                'Referral reward source reference is required.',
            );
        }

        $base = BigDecimal::of(
            (string) $baseCredits,
        )->toScale(
            8,
            RoundingMode::Down,
        );

        if ($base->isNegative()) {
            throw new InvalidArgumentException(
                'Referral reward base credits cannot be negative.',
            );
        }

        if ($base->isZero()) {
            return [];
        }

        $timestamp =
            $occurredAt ?? now();

        return DB::transaction(
            function () use (
                $sourceUserId,
                $sourceType,
                $sourceReference,
                $base,
                $timestamp,
            ): array {
                $maxDepth = min(
                    3,
                    max(
                        0,
                        (int) config(
                            'referral_rewards.max_depth',
                            3,
                        ),
                    ),
                );

                $rates = (array) config(
                    'referral_rewards.level_rates_bps',
                    [],
                );

                $currentUserId =
                    $sourceUserId;

                $visited = [
                    $sourceUserId => true,
                ];

                $distributed = [];

                for (
                    $level = 1;
                    $level <= $maxDepth;
                    $level++
                ) {
                    $currentUser =
                        DB::table('users')
                            ->where(
                                'id',
                                $currentUserId,
                            )
                            ->lockForUpdate()
                            ->first([
                                'id',
                                'inviter_id',
                            ]);

                    if (
                        $currentUser === null ||
                        $currentUser->inviter_id === null
                    ) {
                        break;
                    }

                    $beneficiaryId =
                        (int)
                            $currentUser
                                ->inviter_id;

                    if (
                        $beneficiaryId <= 0 ||
                        isset(
                            $visited[
                                $beneficiaryId
                            ],
                        )
                    ) {
                        break;
                    }

                    $visited[
                        $beneficiaryId
                    ] = true;

                    $beneficiary =
                        DB::table('users')
                            ->where(
                                'id',
                                $beneficiaryId,
                            )
                            ->lockForUpdate()
                            ->first([
                                'id',
                                'referral_credit_balance',
                            ]);

                    if ($beneficiary === null) {
                        break;
                    }

                    $rateBps =
                        (int) (
                            $rates[$level] ??
                            0
                        );

                    if ($rateBps <= 0) {
                        $currentUserId =
                            $beneficiaryId;

                        continue;
                    }

                    $referenceKey =
                        'referral-credit:' .
                        hash(
                            'sha256',
                            implode(
                                '|',
                                [
                                    $sourceType,
                                    $sourceReference,
                                    (string) $level,
                                ],
                            ),
                        );

                    $existing =
                        DB::table(
                            'referral_rewards',
                        )
                            ->where(
                                'reference_key',
                                $referenceKey,
                            )
                            ->first();

                    if ($existing !== null) {
                        $distributed[] =
                            $this->resource(
                                $existing,
                                true,
                            );

                        $currentUserId =
                            $beneficiaryId;

                        continue;
                    }

                    $reward = $base
                        ->multipliedBy(
                            $rateBps,
                        )
                        ->dividedBy(
                            10_000,
                            8,
                            RoundingMode::Down,
                        );

                    $balanceBefore =
                        BigDecimal::of(
                            (string)
                                $beneficiary
                                    ->referral_credit_balance,
                        )->toScale(
                            8,
                            RoundingMode::Down,
                        );

                    $balanceAfter =
                        $balanceBefore
                            ->plus($reward)
                            ->toScale(
                                8,
                                RoundingMode::Down,
                            );

                    DB::table('users')
                        ->where(
                            'id',
                            $beneficiaryId,
                        )
                        ->update([
                            'referral_credit_balance' =>
                                (string)
                                    $balanceAfter,
                            'updated_at' =>
                                $timestamp,
                        ]);

                    $rewardId =
                        DB::table(
                            'referral_rewards',
                        )->insertGetId([
                            'source_user_id' =>
                                $sourceUserId,

                            'beneficiary_user_id' =>
                                $beneficiaryId,

                            'level' =>
                                $level,

                            'rate_bps' =>
                                $rateBps,

                            'base_credits' =>
                                (string) $base,

                            'reward_credits' =>
                                (string) $reward,

                            'balance_before' =>
                                (string)
                                    $balanceBefore,

                            'balance_after' =>
                                (string)
                                    $balanceAfter,

                            'source_type' =>
                                $sourceType,

                            'source_reference' =>
                                $sourceReference,

                            'reference_key' =>
                                $referenceKey,

                            'occurred_at' =>
                                $timestamp,

                            'created_at' =>
                                $timestamp,
                        ]);

                    $row =
                        DB::table(
                            'referral_rewards',
                        )
                            ->where(
                                'id',
                                $rewardId,
                            )
                            ->firstOrFail();

                    $distributed[] =
                        $this->resource(
                            $row,
                            false,
                        );

                    $currentUserId =
                        $beneficiaryId;
                }

                return $distributed;
            },
        );
    }

    /**
     * @return array<string, mixed>
     */
    private function resource(
        object $row,
        bool $idempotentReplay,
    ): array {
        return [
            'id' =>
                (int) $row->id,

            'sourceUserId' =>
                (int)
                    $row->source_user_id,

            'beneficiaryUserId' =>
                (int)
                    $row->beneficiary_user_id,

            'level' =>
                (int) $row->level,

            'percentage' =>
                (float)
                    $row->rate_bps /
                100,

            'baseCredits' =>
                (float)
                    $row->base_credits,

            'rewardCredits' =>
                (float)
                    $row->reward_credits,

            'balanceAfter' =>
                (float)
                    $row->balance_after,

            'sourceType' =>
                $row->source_type,

            'sourceReference' =>
                $row->source_reference,

            'idempotentReplay' =>
                $idempotentReplay,
        ];
    }
}