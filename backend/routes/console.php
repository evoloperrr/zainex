<?php

use App\Services\Referral\StrategyReferralIncomeBackfillService;
use App\Services\Trading\StrategyAccrualService;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

// ZAINEX_STRATEGY_DAILY_ACCRUAL_ENGINE_C1_V1

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Artisan::command(
    'strategy:backfill-referral-income',
    function (): int {
        $summary = app(
            StrategyReferralIncomeBackfillService::class,
        )->run();

        $this->line(
            json_encode(
                $summary,
                JSON_THROW_ON_ERROR |
                JSON_PRETTY_PRINT,
            ),
        );

        return 0;
    },
)->purpose(
    'Credit missing direct-inviter income for previous strategy activations.',
);

Artisan::command(
    'strategy:accrue-due',
    function (): int {
        $summary = app(
            StrategyAccrualService::class,
        )->accrueDue();

        $this->line(
            json_encode(
                $summary,
                JSON_THROW_ON_ERROR |
                JSON_PRETTY_PRINT,
            ),
        );

        return 0;
    },
)->purpose(
    'Credit all due paper-strategy daily profits and release matured principals.',
);

Schedule::command(
    'strategy:accrue-due',
)
    ->everyMinute()
    ->withoutOverlapping();
