<?php

declare(strict_types=1);

use App\Services\Trading\StrategyPayoutSchedule;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// ZAINEX_STRATEGY_PAYOUT_CADENCE_V1

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('strategy_activations', 'payout_days')) {
            Schema::table(
                'strategy_activations',
                function (Blueprint $table): void {
                    $table->json('payout_days')->nullable();
                },
            );
        }

        DB::table('strategy_activations')
            ->where('tier', 'FREE TIER')
            ->where('status', 'ACTIVE')
            ->orderBy('id')
            ->eachById(function (object $activation): void {
                $creditedDays = DB::table('strategy_daily_accruals')
                    ->where('strategy_activation_id', $activation->id)
                    ->orderBy('day_number')
                    ->pluck('day_number')
                    ->map(static fn (mixed $day): int => (int) $day)
                    ->all();

                $schedule = $this->schedulePreserving(
                    $creditedDays,
                );

                $paidDays = min(
                    count($creditedDays),
                    StrategyPayoutSchedule::FREE_PAYOUT_COUNT,
                );

                $startedAt = Carbon::parse(
                    (string) ($activation->started_at ?? $activation->created_at),
                );

                $nextDay = $schedule[$paidDays] ?? null;

                DB::table('strategy_activations')
                    ->where('id', $activation->id)
                    ->update([
                        'payout_days' => json_encode(
                            $schedule,
                            JSON_THROW_ON_ERROR,
                        ),
                        'term_days' => StrategyPayoutSchedule::FREE_PAYOUT_COUNT,
                        'paid_days' => $paidDays,
                        'next_accrual_at' => $nextDay === null
                                ? null
                                : $startedAt->copy()->addDays($nextDay),
                        'matures_at' => $startedAt
                            ->copy()
                            ->addDays(
                                StrategyPayoutSchedule::FREE_WINDOW_DAYS,
                            ),
                        'updated_at' => now(),
                    ]);
            });
    }

    /**
     * @param  list<int>  $creditedDays
     * @return list<int>
     */
    private function schedulePreserving(array $creditedDays): array
    {
        $creditedDays = array_values(array_unique(array_filter(
            $creditedDays,
            static fn (int $day): bool => $day >= 1 &&
                $day <= StrategyPayoutSchedule::FREE_WINDOW_DAYS,
        )));

        sort($creditedDays, SORT_NUMERIC);

        $schedule = $creditedDays;

        foreach (StrategyPayoutSchedule::randomFreeDays() as $day) {
            if (
                count($schedule) >=
                    StrategyPayoutSchedule::FREE_PAYOUT_COUNT ||
                in_array($day, $schedule, true)
            ) {
                continue;
            }

            $schedule[] = $day;
        }

        for (
            $day = 1;
            count($schedule) < StrategyPayoutSchedule::FREE_PAYOUT_COUNT &&
                $day <= StrategyPayoutSchedule::FREE_WINDOW_DAYS;
            $day++
        ) {
            if (! in_array($day, $schedule, true)) {
                $schedule[] = $day;
            }
        }

        if (
            ! in_array(
                StrategyPayoutSchedule::FREE_WINDOW_DAYS,
                $schedule,
                true,
            )
        ) {
            array_pop($schedule);
            $schedule[] = StrategyPayoutSchedule::FREE_WINDOW_DAYS;
        }

        sort($schedule, SORT_NUMERIC);

        return array_slice(
            $schedule,
            0,
            StrategyPayoutSchedule::FREE_PAYOUT_COUNT,
        );
    }

    public function down(): void
    {
        if (Schema::hasColumn('strategy_activations', 'payout_days')) {
            Schema::table(
                'strategy_activations',
                function (Blueprint $table): void {
                    $table->dropColumn('payout_days');
                },
            );
        }
    }
};
