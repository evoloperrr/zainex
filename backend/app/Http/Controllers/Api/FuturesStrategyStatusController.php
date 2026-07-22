<?php

declare(strict_types=1);
// ZAINEX_STRATEGY_COMBINED_LATEST_10_LOGS_C2_V1

namespace App\Http\Controllers\Api;

use App\Exceptions\FuturesTradingException;
use App\Http\Controllers\Controller;
use App\Services\Trading\StrategyPayoutSchedule;
use Brick\Math\BigDecimal;
use Brick\Math\RoundingMode;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Throwable;

// ZAINEX_CURRENT_ACTIVE_STRATEGY_BORDER_V1

final class FuturesStrategyStatusController extends Controller
{
    public function __invoke(
        Request $request,
    ): JsonResponse {
        try {
            $this->authorizeInternalRequest(
                $request,
            );

            $sessionId = trim(
                (string) $request->header(
                    'X-Zainex-Session-Id',
                    '',
                ),
            );

            if (! Str::isUuid($sessionId)) {
                throw new FuturesTradingException(
                    'INVALID_DEMO_SESSION',
                    'A valid ZAINEX demo session is required.',
                    400,
                );
            }

            $account = DB::table(
                'trading_accounts',
            )
                ->where(
                    'external_session_id',
                    $sessionId,
                )
                ->where('status', 'ACTIVE')
                ->first();

            if ($account === null) {
                throw new FuturesTradingException(
                    'TRADING_ACCOUNT_NOT_FOUND',
                    'No active Futures account was found.',
                    404,
                );
            }

            $latest = DB::table(
                'strategy_activations',
            )
                ->where(
                    'trading_account_id',
                    $account->id,
                )
                ->where('status', 'ACTIVE')
                ->orderByRaw(
                    "
                    CASE tier
                        WHEN 'VIP 3' THEN 3
                        WHEN 'VIP 2' THEN 2
                        WHEN 'VIP 1' THEN 1
                        ELSE 0
                    END DESC
                    ",
                )
                ->orderByDesc('id')
                ->first();

            $nextPayoutActivation = DB::table(
                'strategy_activations',
            )
                ->where(
                    'trading_account_id',
                    $account->id,
                )
                ->where('status', 'ACTIVE')
                ->whereNotNull('next_accrual_at')
                ->orderBy('next_accrual_at')
                ->orderBy('id')
                ->first();

            $nextPayout = null;

            if ($nextPayoutActivation !== null) {
                $isFreeTier =
                    $nextPayoutActivation->tier ===
                    'FREE TIER';

                $payoutNumber =
                    (int) $nextPayoutActivation->paid_days + 1;

                $totalPayouts =
                    $isFreeTier
                        ? StrategyPayoutSchedule::FREE_PAYOUT_COUNT
                        : (int) $nextPayoutActivation->term_days;

                $calendarDay =
                    $isFreeTier
                        ? (
                            StrategyPayoutSchedule::normalizeFreeDays(
                                $nextPayoutActivation->payout_days ?? null,
                            )[$payoutNumber - 1] ?? null
                        )
                        : $payoutNumber;

                $expectedAmount = BigDecimal::of(
                    (string) $nextPayoutActivation->allocated_amount,
                )
                    ->multipliedBy(
                        BigDecimal::of(
                            (string) $nextPayoutActivation->daily_rate,
                        ),
                    )
                    ->toScale(8, RoundingMode::Down);

                $nextPayout = [
                    'activationId' => (int) $nextPayoutActivation->id,
                    'tier' => (string) $nextPayoutActivation->tier,
                    'cadence' => $isFreeTier
                            ? 'RANDOM_15_OF_30'
                            : 'EVERY_24_HOURS',
                    'scheduledAt' => Carbon::parse(
                        (string) $nextPayoutActivation->next_accrual_at,
                    )
                        ->utc()
                        ->toIso8601String(),
                    'expectedAmount' => (float) (string) $expectedAmount,
                    'principalBasis' => (float) $nextPayoutActivation->allocated_amount,
                    'dailyRate' => (float) $nextPayoutActivation->daily_rate,
                    'payoutNumber' => $payoutNumber,
                    'totalPayouts' => $totalPayouts,
                    'calendarDay' => $calendarDay,
                    'windowDays' => $isFreeTier
                            ? StrategyPayoutSchedule::FREE_WINDOW_DAYS
                            : $totalPayouts,
                ];
            }

            $openPositionCount = DB::table(
                'futures_positions',
            )
                ->where(
                    'trading_account_id',
                    $account->id,
                )
                ->where('status', 'OPEN')
                ->count();

            $pendingOrderCount = DB::table(
                'futures_orders',
            )
                ->where(
                    'trading_account_id',
                    $account->id,
                )
                ->whereIn(
                    'status',
                    [
                        'PENDING',
                        'NEW',
                        'OPEN',
                        'PARTIALLY_FILLED',
                    ],
                )
                ->count();

            $activationAllowed =
                $openPositionCount === 0 &&
                $pendingOrderCount === 0;
            $walletLogs = DB::table(
                'wallet_transactions as wallet_tx',
            )
                ->leftJoin(
                    'strategy_activations as activation',
                    'activation.id',
                    '=',
                    'wallet_tx.strategy_activation_id',
                )
                ->where(
                    'wallet_tx.trading_account_id',
                    $account->id,
                )
                ->select([
                    'wallet_tx.id as transaction_id',
                    'wallet_tx.strategy_activation_id',
                    'wallet_tx.event_type',
                    'wallet_tx.direction',
                    'wallet_tx.amount',
                    'wallet_tx.wallet_balance_before',
                    'wallet_tx.wallet_balance_after',
                    'wallet_tx.description',
                    'wallet_tx.metadata',
                    'wallet_tx.occurred_at',
                    'activation.tier',
                    'activation.display_rate',
                    'activation.allocated_amount',
                    'activation.daily_rate',
                    'activation.credit_cost',
                    'activation.status as activation_status',
                    'activation.paid_days',
                    'activation.term_days',
                ])
                ->orderByDesc(
                    'wallet_tx.occurred_at',
                )
                ->orderByDesc(
                    'wallet_tx.id',
                )
                ->limit(20)
                ->get()
                ->map(
                    static function (
                        object $row,
                    ): array {
                        $metadata = [];

                        if (
                            is_string($row->metadata) &&
                            $row->metadata !== ''
                        ) {
                            $decoded = json_decode(
                                $row->metadata,
                                true,
                            );

                            if (is_array($decoded)) {
                                $metadata = $decoded;
                            }
                        }

                        $sourceEventType =
                            (string) $row->event_type;

                        $eventType =
                            $sourceEventType ===
                            'LEGACY_STRATEGY_PRINCIPAL_RECLASSIFIED'
                                ? 'STRATEGY_ACTIVATED'
                                : $sourceEventType;

                        $priority = match ($eventType) {
                            'STRATEGY_PRINCIPAL_RELEASED' => 30,
                            'STRATEGY_DAILY_PROFIT' => 20,
                            'STRATEGY_ACTIVATED' => 11,
                            default => 5,
                        };

                        return [
                            'id' => (int)
                                    $row->transaction_id,
                            'activationId' => $row
                                ->strategy_activation_id ===
                                    null
                                    ? null
                                    : (int)
                                        $row
                                            ->strategy_activation_id,
                            'eventType' => $eventType,
                            'sourceEventType' => $sourceEventType,
                            'tier' => $row->tier ??
                                'FREE TIER',
                            'amount' => (float) $row->amount,
                            'walletBalanceBefore' => (float)
                                    $row
                                        ->wallet_balance_before,
                            'walletBalanceAfter' => (float)
                                    $row
                                        ->wallet_balance_after,
                            'principalBasis' => isset(
                                $metadata['principal'],
                            )
                                    ? (float)
                                        $metadata['principal']
                                    : (
                                        $row
                                            ->allocated_amount ===
                                            null
                                            ? null
                                            : (float)
                                                $row
                                                    ->allocated_amount
                                    ),
                            'dailyRate' => isset(
                                $metadata['dailyRate'],
                            )
                                    ? (float)
                                        $metadata['dailyRate']
                                    : (
                                        $row->daily_rate ===
                                        null
                                            ? null
                                            : (float)
                                                $row->daily_rate
                                    ),
                            'creditCost' => (int)
                                    ($row->credit_cost ?? 0),
                            'rate' => $row->display_rate,
                            'status' => $row->activation_status,
                            'direction' => $row->direction,
                            'dayNumber' => isset(
                                $metadata['dayNumber'],
                            )
                                    ? (int)
                                        $metadata['dayNumber']
                                    : (
                                        isset(
                                            $metadata[
                                                'completedDay'
                                            ],
                                        )
                                            ? (int)
                                                $metadata[
                                                    'completedDay'
                                                ]
                                            : null
                                    ),
                            'payoutNumber' => isset(
                                $metadata['payoutNumber'],
                            )
                                    ? (int)
                                        $metadata['payoutNumber']
                                    : null,
                            'paidDays' => $row->paid_days === null
                                    ? null
                                    : (int)
                                        $row->paid_days,
                            'termDays' => isset(
                                $metadata['termDays'],
                            )
                                    ? (int)
                                        $metadata['termDays']
                                    : (
                                        $row->term_days === null
                                            ? null
                                            : (int)
                                                $row->term_days
                                    ),
                            'windowDays' => isset(
                                $metadata['windowDays'],
                            )
                                    ? (int)
                                        $metadata['windowDays']
                                    : 30,
                            'cadence' => isset($metadata['cadence'])
                                    ? (string)
                                        $metadata['cadence']
                                    : (
                                        $row->tier === 'FREE TIER'
                                            ? 'RANDOM_15_OF_30'
                                            : 'EVERY_24_HOURS'
                                    ),
                            'description' => $row->description,
                            'occurredAt' => $row->occurred_at,
                            '_priority' => $priority,
                            '_sequence' => (int)
                                    $row->transaction_id,
                        ];
                    },
                );

            $activationLogs = DB::table(
                'strategy_activations',
            )
                ->where(
                    'trading_account_id',
                    $account->id,
                )
                ->orderByDesc('created_at')
                ->orderByDesc('id')
                ->limit(20)
                ->get()
                ->map(
                    static function (
                        object $row,
                    ): array {
                        return [
                            'id' => (int) $row->id,
                            'activationId' => (int) $row->id,
                            'eventType' => 'STRATEGY_ACTIVATED',
                            'sourceEventType' => 'STRATEGY_ACTIVATED',
                            'tier' => $row->tier,
                            'amount' => (float)
                                    $row->allocated_amount,
                            'creditCost' => (int)
                                    $row->credit_cost,
                            'rate' => $row->display_rate,
                            'status' => $row->status,
                            'direction' => 'LOCK',
                            'dayNumber' => null,
                            'paidDays' => (int)
                                    ($row->paid_days ?? 0),
                            'termDays' => (int)
                                    ($row->term_days ?? 30),
                            'windowDays' => 30,
                            'cadence' => $row->tier === 'FREE TIER'
                                    ? 'RANDOM_15_OF_30'
                                    : 'EVERY_24_HOURS',
                            'description' => 'Paper strategy activated.',
                            'occurredAt' => $row->created_at,
                            '_priority' => 10,
                            '_sequence' => (int) $row->id,
                        ];
                    },
                );

            $completionLogs = DB::table(
                'strategy_activations',
            )
                ->where(
                    'trading_account_id',
                    $account->id,
                )
                ->where('status', 'COMPLETED')
                ->whereNotNull('completed_at')
                ->orderByDesc('completed_at')
                ->orderByDesc('id')
                ->limit(10)
                ->get()
                ->map(
                    static function (
                        object $row,
                    ): array {
                        return [
                            'id' => 'completion-'.
                                $row->id,
                            'activationId' => (int) $row->id,
                            'eventType' => 'STRATEGY_COMPLETED',
                            'sourceEventType' => 'STRATEGY_COMPLETED',
                            'tier' => $row->tier,
                            'amount' => (float)
                                    $row->allocated_amount,
                            'creditCost' => (int)
                                    $row->credit_cost,
                            'rate' => $row->display_rate,
                            'status' => 'COMPLETED',
                            'direction' => 'STATUS',
                            'dayNumber' => (int)
                                    $row->paid_days,
                            'paidDays' => (int)
                                    $row->paid_days,
                            'termDays' => (int)
                                    $row->term_days,
                            'windowDays' => 30,
                            'cadence' => $row->tier === 'FREE TIER'
                                    ? 'RANDOM_15_OF_30'
                                    : 'EVERY_24_HOURS',
                            'description' => 'Paper strategy completed its term.',
                            'occurredAt' => $row->completed_at,
                            '_priority' => 40,
                            '_sequence' => (int) $row->id,
                        ];
                    },
                );

            $logs = $walletLogs
                ->concat($activationLogs)
                ->concat($completionLogs)
                ->unique(
                    static fn (
                        array $log,
                    ): string => (string) $log['eventType'].
                        '|'.
                        (string)
                            ($log['activationId'] ?? '').
                        '|'.
                        (string)
                            ($log['dayNumber'] ?? ''),
                )
                ->sort(
                    static function (
                        array $left,
                        array $right,
                    ): int {
                        $timeComparison = strcmp(
                            (string)
                                $right['occurredAt'],
                            (string)
                                $left['occurredAt'],
                        );

                        if ($timeComparison !== 0) {
                            return $timeComparison;
                        }

                        $priorityComparison =
                            (int)
                                $right['_priority'] <=>
                            (int)
                                $left['_priority'];

                        if (
                            $priorityComparison !== 0
                        ) {
                            return $priorityComparison;
                        }

                        return
                            (int)
                                $right['_sequence'] <=>
                            (int)
                                $left['_sequence'];
                    },
                )
                ->take(10)
                ->map(
                    static function (
                        array $log,
                    ): array {
                        unset(
                            $log['_priority'],
                            $log['_sequence'],
                        );

                        return $log;
                    },
                )
                ->values()
                ->all();

            return response()
                ->json([
                    'ok' => true,
                    'mode' => 'paper-futures',
                    'liveTrading' => false,
                    'currentStrategy' => [
                        'tier' => $latest?->tier ??
                            'FREE TIER',
                        'defaulted' => $latest === null,
                        'activationId' => $latest === null
                                ? null
                                : (int) $latest->id,
                        'activatedAt' => $latest?->created_at,
                    ],
                    'nextPayout' => $nextPayout,
                    'tradingExposure' => [
                        'activationAllowed' => $activationAllowed,
                        'openPositions' => $openPositionCount,
                        'pendingOrders' => $pendingOrderCount,
                        'note' => $activationAllowed
                                ? null
                                : 'Close all open positions and cancel all pending orders before activating or adding a strategy.',
                    ],
                    'logs' => $logs,
                    'autoTradingEnabled' => false,
                    'automaticOrderCreated' => false,
                ])
                ->header(
                    'Cache-Control',
                    'no-store',
                );
        } catch (
            FuturesTradingException $exception
        ) {
            $error = [
                'code' => $exception->errorCode,
                'message' => $exception->getMessage(),
            ];

            if ($exception->details !== []) {
                $error['details'] =
                    $exception->details;
            }

            return response()
                ->json(
                    [
                        'ok' => false,
                        'error' => $error,
                    ],
                    $exception->httpStatus,
                )
                ->header(
                    'Cache-Control',
                    'no-store',
                );
        } catch (Throwable $exception) {
            if (app()->environment('testing')) {
                throw $exception;
            }

            Log::error(
                'ZAINEX current strategy lookup failed.',
                [
                    'exception' => $exception::class,
                    'message' => $exception->getMessage(),
                ],
            );

            return response()
                ->json(
                    [
                        'ok' => false,
                        'error' => [
                            'code' => 'CURRENT_STRATEGY_ERROR',
                            'message' => 'The current strategy could not be loaded.',
                        ],
                    ],
                    500,
                )
                ->header(
                    'Cache-Control',
                    'no-store',
                );
        }
    }

    private function authorizeInternalRequest(
        Request $request,
    ): void {
        $configuredToken = trim(
            (string) config(
                'intelibrain.internal_token',
                '',
            ),
        );

        if ($configuredToken === '') {
            throw new FuturesTradingException(
                'FUTURES_BACKEND_NOT_CONFIGURED',
                'The Laravel Futures backend is not configured.',
                503,
            );
        }

        $providedToken = trim(
            (string) $request->header(
                'X-Zainex-Internal-Token',
                '',
            ),
        );

        if (
            $providedToken === '' ||
            ! hash_equals(
                $configuredToken,
                $providedToken,
            )
        ) {
            throw new FuturesTradingException(
                'FUTURES_BACKEND_UNAUTHORIZED',
                'The Laravel Futures request is unauthorized.',
                401,
            );
        }
    }
}
