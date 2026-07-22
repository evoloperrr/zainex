<?php

declare(strict_types=1);

namespace App\Services\Referral;

use Illuminate\Support\Facades\DB;

// ZAINEX_STRATEGY_REFERRAL_INCOME_BACKFILL_V1

final class StrategyReferralIncomeBackfillService
{
    /**
     * @return array{eligible: int, credited: int, existing: int, skipped: int}
     */
    public function run(): array
    {
        $summary = [
            'eligible' => 0,
            'credited' => 0,
            'existing' => 0,
            'skipped' => 0,
        ];

        DB::table('strategy_activations as activation')
            ->join(
                'users as source_user',
                'source_user.id',
                '=',
                'activation.user_id',
            )
            ->whereNotNull('source_user.inviter_id')
            ->select([
                'activation.id',
                'activation.user_id',
                'activation.allocated_amount',
            ])
            ->orderBy('activation.id')
            ->chunkById(
                100,
                function ($activations) use (&$summary): void {
                    foreach ($activations as $activation) {
                        $summary['eligible']++;

                        $result = DB::transaction(
                            fn (): ?array => app(
                                StrategyReferralIncomeService::class,
                            )->credit(
                                sourceUserId: (int) $activation->user_id,
                                strategyActivationId: (int) $activation->id,
                                tradingAmount: (string) $activation->allocated_amount,
                                occurredAt: now(),
                            ),
                            5,
                        );

                        if ($result === null) {
                            $summary['skipped']++;

                            continue;
                        }

                        if ($result['idempotentReplay'] === true) {
                            $summary['existing']++;
                        } else {
                            $summary['credited']++;
                        }
                    }
                },
                'activation.id',
                'id',
            );

        return $summary;
    }
}
