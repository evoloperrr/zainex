<?php

declare(strict_types=1);

namespace App\Services\Referral;

use Brick\Math\BigDecimal;
use Brick\Math\RoundingMode;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use RuntimeException;

// ZAINEX_STRATEGY_REFERRAL_CREDIT_RECONCILIATION_V1

final class StrategyReferralCreditReconciliationService
{
    /**
     * @return array{
     *     legacyRewardsFound: int,
     *     legacyRewardsReversed: int,
     *     activationCount: int,
     *     rewardsCredited: int,
     *     rewardsExisting: int
     * }
     */
    public function run(): array
    {
        $summary = [
            'legacyRewardsFound' => 0,
            'legacyRewardsReversed' => 0,
            'activationCount' => 0,
            'rewardsCredited' => 0,
            'rewardsExisting' => 0,
        ];

        DB::table('referral_rewards')
            ->where('source_type', 'CREDIT_PURCHASE')
            ->whereNull('reversed_at')
            ->select('id')
            ->orderBy('id')
            ->chunkById(100, function ($rewards) use (&$summary): void {
                foreach ($rewards as $reward) {
                    $summary['legacyRewardsFound']++;

                    $reversed = DB::transaction(
                        fn (): bool => $this->reverseLegacyReward(
                            (int) $reward->id,
                        ),
                        5,
                    );

                    if ($reversed) {
                        $summary['legacyRewardsReversed']++;
                    }
                }
            });

        DB::table('strategy_activations as activation')
            ->join(
                'users as source_user',
                'source_user.id',
                '=',
                'activation.user_id',
            )
            ->whereNotNull('source_user.inviter_id')
            ->where('activation.credit_cost', '>', 0)
            ->select([
                'activation.id',
                'activation.user_id',
                'activation.credit_cost',
                'activation.created_at',
            ])
            ->orderBy('activation.id')
            ->chunkById(
                100,
                function ($activations) use (&$summary): void {
                    foreach ($activations as $activation) {
                        $summary['activationCount']++;

                        $rewards = DB::transaction(
                            fn (): array => app(
                                ReferralRewardService::class,
                            )->distribute(
                                sourceUserId: (int) $activation->user_id,
                                sourceType: 'STRATEGY_ACTIVATION',
                                sourceReference: 'strategy:'.$activation->id,
                                baseCredits: (int) $activation->credit_cost,
                                occurredAt: CarbonImmutable::parse(
                                    (string) $activation->created_at,
                                ),
                            ),
                            5,
                        );

                        foreach ($rewards as $reward) {
                            if ($reward['idempotentReplay'] === true) {
                                $summary['rewardsExisting']++;
                            } else {
                                $summary['rewardsCredited']++;
                            }
                        }
                    }
                },
                'activation.id',
                'id',
            );

        return $summary;
    }

    private function reverseLegacyReward(int $rewardId): bool
    {
        $reward = DB::table('referral_rewards')
            ->where('id', $rewardId)
            ->lockForUpdate()
            ->first();

        if ($reward === null || $reward->reversed_at !== null) {
            return false;
        }

        $beneficiary = DB::table('users')
            ->where('id', $reward->beneficiary_user_id)
            ->lockForUpdate()
            ->first([
                'id',
                'referral_credit_balance',
            ]);

        if ($beneficiary === null) {
            throw new RuntimeException(
                'Legacy referral reward beneficiary was not found.',
            );
        }

        $balanceBefore = BigDecimal::of(
            (string) $beneficiary->referral_credit_balance,
        )->toScale(8, RoundingMode::Down);
        $rewardCredits = BigDecimal::of(
            (string) $reward->reward_credits,
        )->toScale(8, RoundingMode::Down);

        if ($balanceBefore->isLessThan($rewardCredits)) {
            throw new RuntimeException(
                'Referral credit balance is insufficient for legacy reward reversal.',
            );
        }

        $timestamp = now();
        $balanceAfter = $balanceBefore
            ->minus($rewardCredits)
            ->toScale(8, RoundingMode::Down);

        DB::table('users')
            ->where('id', $beneficiary->id)
            ->update([
                'referral_credit_balance' => (string) $balanceAfter,
                'updated_at' => $timestamp,
            ]);

        DB::table('referral_rewards')
            ->where('id', $reward->id)
            ->update([
                'reversed_at' => $timestamp,
            ]);

        return true;
    }
}
