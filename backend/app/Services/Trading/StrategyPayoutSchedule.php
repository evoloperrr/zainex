<?php

declare(strict_types=1);

namespace App\Services\Trading;

// ZAINEX_STRATEGY_PAYOUT_CADENCE_V1

final class StrategyPayoutSchedule
{
    public const FREE_WINDOW_DAYS = 30;

    public const FREE_PAYOUT_COUNT = 15;

    /**
     * Free users receive exactly 15 drops during a 30-day window. Day 30
     * is always included so principal release stays aligned with maturity.
     *
     * @return list<int>
     */
    public static function randomFreeDays(): array
    {
        $days = range(1, self::FREE_WINDOW_DAYS - 1);

        shuffle($days);

        $selected = array_slice(
            $days,
            0,
            self::FREE_PAYOUT_COUNT - 1,
        );

        $selected[] = self::FREE_WINDOW_DAYS;

        sort($selected, SORT_NUMERIC);

        return array_values($selected);
    }

    /**
     * @return list<int>
     */
    public static function normalizeFreeDays(mixed $value): array
    {
        if (is_string($value)) {
            $decoded = json_decode($value, true);
            $value = is_array($decoded) ? $decoded : [];
        }

        if (! is_array($value)) {
            return self::fallbackFreeDays();
        }

        $days = array_values(array_unique(array_filter(
            array_map(
                static fn (mixed $day): int => (int) $day,
                $value,
            ),
            static fn (int $day): bool => $day >= 1 &&
                $day <= self::FREE_WINDOW_DAYS,
        )));

        sort($days, SORT_NUMERIC);

        if (
            count($days) !== self::FREE_PAYOUT_COUNT ||
            ! in_array(self::FREE_WINDOW_DAYS, $days, true)
        ) {
            return self::fallbackFreeDays();
        }

        return $days;
    }

    /**
     * Stable fallback for legacy or malformed rows: every second day.
     *
     * @return list<int>
     */
    private static function fallbackFreeDays(): array
    {
        return range(
            2,
            self::FREE_WINDOW_DAYS,
            2,
        );
    }
}
