<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Exceptions\FuturesTradingException;
use App\Http\Controllers\Api\Concerns\LinksTradingAccountToUser;
use App\Http\Controllers\Controller;
use App\Services\Referral\ReferralRewardService;
use App\Services\Referral\StrategyReferralIncomeService;
use App\Services\Trading\StrategyPayoutSchedule;
use Brick\Math\BigDecimal;
use Brick\Math\RoundingMode;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Throwable;

// ZAINEX_STRATEGY_ACTIVATION_BACKEND_V2_2

final class FuturesStrategyActivationController extends Controller
{
    use LinksTradingAccountToUser;

    private const STRATEGIES = [
        'FREE TIER' => [
            'name' => 'Guarantrade Variable Rate Strategy',
            'rateType' => 'VARIABLE RATE',
            'displayRate' => '1%',
            'creditCost' => 0,
        ],
        'VIP 1' => [
            'name' => 'Guarantrade Fix Rate Strategy',
            'rateType' => 'FIX RATE',
            'displayRate' => '1%',
            'creditCost' => 5,
        ],
        'VIP 2' => [
            'name' => 'Guarantrade Fix Rate Strategy',
            'rateType' => 'FIX RATE',
            'displayRate' => '2%',
            'creditCost' => 15,
        ],
        'VIP 3' => [
            'name' => 'Guarantrade Fix Rate Strategy',
            'rateType' => 'FIX RATE',
            'displayRate' => '3%',
            'creditCost' => 45,
        ],
    ];

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

            $requestId = trim(
                (string) $request->header(
                    'X-Zainex-Request-Id',
                    '',
                ),
            );

            if (! Str::isUuid($requestId)) {
                $requestId =
                    (string) Str::uuid();
            }

            $this->linkAccountToUser(
                $sessionId,
                $request->header('X-Zainex-User-Email'),
            );

            $result = $this->activate(
                $sessionId,
                $requestId,
                $this->jsonBody($request),
                $request->header('X-Zainex-User-Email'),
            );

            return response()
                ->json(
                    [
                        'ok' => true,
                        'mode' => 'paper-futures',
                        'liveTrading' => false,
                        'result' => $result,
                    ],
                    $result['idempotentReplay']
                        ? 200
                        : 201,
                )
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
                'ZAINEX strategy activation failed.',
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
                            'code' => 'STRATEGY_ACTIVATION_ERROR',
                            'message' => 'The strategy activation could not be completed.',
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

    /**
     * @param  array<string, mixed>  $body
     * @return array<string, mixed>
     */
    private function activate(
        string $sessionId,
        string $requestId,
        array $body,
        ?string $email = null,
    ): array {
        $tier = strtoupper(
            trim(
                (string) (
                    $body['tier'] ?? ''
                ),
            ),
        );

        if (
            ! array_key_exists(
                $tier,
                self::STRATEGIES,
            )
        ) {
            throw new FuturesTradingException(
                'INVALID_STRATEGY_TIER',
                'The selected strategy tier is invalid.',
                400,
            );
        }

        $amountRaw = trim(
            (string) (
                $body['amount'] ?? ''
            ),
        );

        if (
            $amountRaw === '' ||
            ! is_numeric($amountRaw)
        ) {
            throw new FuturesTradingException(
                'INVALID_STRATEGY_AMOUNT',
                'Enter a valid strategy trading amount.',
                400,
            );
        }

        try {
            $amount = BigDecimal::of(
                $amountRaw,
            )->toScale(
                8,
                RoundingMode::Down,
            );
        } catch (Throwable) {
            throw new FuturesTradingException(
                'INVALID_STRATEGY_AMOUNT',
                'Enter a valid strategy trading amount.',
                400,
            );
        }

        if (
            $amount->isLessThanOrEqualTo(
                BigDecimal::of('0'),
            )
        ) {
            throw new FuturesTradingException(
                'INVALID_STRATEGY_AMOUNT',
                'The strategy amount must be greater than zero.',
                400,
            );
        }

        $clientRequestId = trim(
            (string) (
                $body['clientRequestId'] ?? ''
            ),
        );

        if (! Str::isUuid($clientRequestId)) {
            throw new FuturesTradingException(
                'INVALID_STRATEGY_REQUEST_ID',
                'A valid strategy activation request ID is required.',
                400,
            );
        }

        // Annual billing charges 12x the normal credit cost up front for
        // a 360-day term instead of 30, so the user doesn't have to
        // manually re-activate every month. Doesn't apply to FREE TIER,
        // which has its own fixed 30-day random-payout schedule and a
        // zero credit cost either way.
        $billingCycle = strtolower(
            trim(
                (string) (
                    $body['billingCycle'] ?? 'monthly'
                ),
            ),
        );

        if (
            ! in_array(
                $billingCycle,
                ['monthly', 'annual'],
                true,
            )
        ) {
            $billingCycle = 'monthly';
        }

        if ($tier === 'FREE TIER') {
            $billingCycle = 'monthly';
        }

        $strategy =
            self::STRATEGIES[$tier];

        $requestHash = hash(
            'sha256',
            json_encode(
                [
                    'tier' => $tier,
                    'amount' => (string) $amount,
                    'billingCycle' => $billingCycle,
                ],
                JSON_THROW_ON_ERROR,
            ),
        );

        return DB::transaction(
            function () use (
                $sessionId,
                $billingCycle,
                $requestId,
                $clientRequestId,
                $requestHash,
                $tier,
                $strategy,
                $amount,
                $email,
            ): array {
                // Prefer the user's existing linked account (found via
                // their verified email) over the current session's
                // account. The active browser session can end up
                // pointing at a fresh, unlinked account (e.g. if the
                // demo-session cookie was lost while the sign-in
                // persisted) while the user's real wallet-linked
                // account already exists under a different session.
                // Strategy activation touches real wallet/credit
                // balances, so it must resolve to that canonical
                // account rather than the incidental session one.
                $account = null;
                $trimmedEmail = trim((string) $email);

                if ($trimmedEmail !== '') {
                    $user = DB::table('users')
                        ->whereRaw(
                            'LOWER(email) = ?',
                            [strtolower($trimmedEmail)],
                        )
                        ->first();

                    if ($user !== null) {
                        $account = DB::table(
                            'trading_accounts',
                        )
                            ->where(
                                'user_id',
                                $user->id,
                            )
                            ->where(
                                'account_type',
                                'PAPER',
                            )
                            ->where(
                                'status',
                                'ACTIVE',
                            )
                            ->orderBy('id')
                            ->lockForUpdate()
                            ->first();
                    }
                }

                if ($account === null) {
                    $account = DB::table(
                        'trading_accounts',
                    )
                        ->where(
                            'external_session_id',
                            $sessionId,
                        )
                        ->where(
                            'status',
                            'ACTIVE',
                        )
                        ->lockForUpdate()
                        ->first();
                }

                if ($account === null) {
                    throw new FuturesTradingException(
                        'TRADING_ACCOUNT_NOT_FOUND',
                        'No active Futures account was found.',
                        404,
                    );
                }

                if ($account->user_id === null) {
                    throw new FuturesTradingException(
                        'TRADING_USER_NOT_LINKED',
                        'The Futures account is not linked to a user.',
                        409,
                    );
                }

                $user = DB::table('users')
                    ->where(
                        'id',
                        $account->user_id,
                    )
                    ->lockForUpdate()
                    ->first();

                if ($user === null) {
                    throw new FuturesTradingException(
                        'TRADING_USER_NOT_FOUND',
                        'The Futures account user was not found.',
                        404,
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
                    throw new FuturesTradingException(
                        'TRADING_BALANCE_NOT_FOUND',
                        'The Futures balance was not found.',
                        404,
                    );
                }

                $existing = DB::table(
                    'strategy_activations',
                )
                    ->where(
                        'trading_account_id',
                        $account->id,
                    )
                    ->where(
                        'client_request_id',
                        $clientRequestId,
                    )
                    ->first();

                if ($existing !== null) {
                    if (
                        ! hash_equals(
                            (string)
                                $existing->request_hash,
                            $requestHash,
                        )
                    ) {
                        throw new FuturesTradingException(
                            'STRATEGY_IDEMPOTENCY_CONFLICT',
                            'This request ID was already used for another activation.',
                            409,
                        );
                    }

                    return [
                        'idempotentReplay' => true,
                        'activation' => $this->activationResource(
                            $existing,
                        ),
                        'account' => $this->accountResource(
                            $user,
                            $balance,
                        ),
                        'autoTradingEnabled' => false,
                        'automaticOrderCreated' => false,
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

                if (
                    $openPositionCount > 0 ||
                    $pendingOrderCount > 0
                ) {
                    throw new FuturesTradingException(
                        'ACTIVE_TRADING_EXPOSURE',
                        'Close all open positions and cancel all pending orders before activating or adding a strategy.',
                        409,
                        [
                            'openPositions' => $openPositionCount,
                            'pendingOrders' => $pendingOrderCount,
                            'activationAllowed' => false,
                        ],
                    );
                }

                $available =
                    BigDecimal::of(
                        (string)
                            $balance->available_balance,
                    )->toScale(
                        8,
                        RoundingMode::Down,
                    );

                $wallet =
                    BigDecimal::of(
                        (string)
                            $user->wallet_balance,
                    )->toScale(
                        8,
                        RoundingMode::Down,
                    );

                $locked =
                    BigDecimal::of(
                        (string)
                            $balance->locked_balance,
                    )->toScale(
                        8,
                        RoundingMode::Down,
                    );

                $strategyLocked =
                    BigDecimal::of(
                        (string)
                            $balance->strategy_locked_balance,
                    )->toScale(
                        8,
                        RoundingMode::Down,
                    );

                $creditCost =
                    (int)
                        $strategy['creditCost'] *
                    ($billingCycle === 'annual'
                        ? 12
                        : 1);

                $currentCredits =
                    (int)
                        $user->ai_credits;

                if ($available->isLessThan($amount)) {
                    throw new FuturesTradingException(
                        'INSUFFICIENT_AVAILABLE_BALANCE',
                        'The amount exceeds your available trading balance.',
                        422,
                        [
                            'availableBalance' => (float)
                                    (string) $available,
                        ],
                    );
                }

                if ($currentCredits < $creditCost) {
                    throw new FuturesTradingException(
                        'INSUFFICIENT_AI_CREDITS',
                        'You do not have enough AI credits for this strategy.',
                        422,
                        [
                            'requiredCredits' => $creditCost,
                            'availableCredits' => $currentCredits,
                        ],
                    );
                }

                $newAvailable =
                    $available
                        ->minus($amount)
                        ->toScale(
                            8,
                            RoundingMode::Down,
                        );

                $newStrategyLocked =
                    $strategyLocked
                        ->plus($amount)
                        ->toScale(
                            8,
                            RoundingMode::Down,
                        );

                $newCredits =
                    $currentCredits -
                    $creditCost;

                $now = now();

                DB::table('users')
                    ->where(
                        'id',
                        $user->id,
                    )
                    ->update([
                        'ai_credits' => $newCredits,
                        'updated_at' => $now,
                    ]);

                DB::table('trading_balances')
                    ->where(
                        'id',
                        $balance->id,
                    )
                    ->update([
                        'available_balance' => (string) $newAvailable,
                        'strategy_locked_balance' => (string) $newStrategyLocked,
                        'updated_at' => $now,
                    ]);

                $payoutDays =
                    $tier === 'FREE TIER'
                        ? StrategyPayoutSchedule::randomFreeDays()
                        : null;

                $payoutCount =
                    $tier === 'FREE TIER'
                        ? StrategyPayoutSchedule::FREE_PAYOUT_COUNT
                        : ($billingCycle === 'annual'
                            ? 360
                            : 30);

                $firstPayoutDay =
                    $payoutDays[0] ?? 1;

                $activationId =
                    DB::table(
                        'strategy_activations',
                    )->insertGetId([
                        'trading_account_id' => $account->id,
                        'user_id' => $user->id,
                        'client_request_id' => $clientRequestId,
                        'request_id' => $requestId,
                        'request_hash' => $requestHash,
                        'tier' => $tier,
                        'strategy_name' => $strategy['name'],
                        'rate_type' => $strategy['rateType'],
                        'display_rate' => $strategy['displayRate'],
                        'allocated_amount' => (string) $amount,
                        'credit_cost' => $creditCost,
                        'billing_cycle' => $billingCycle,
                        'status' => 'ACTIVE',
                        'daily_rate' => match ($tier) {
                            'VIP 3' => '0.0300000000',
                            'VIP 2' => '0.0200000000',
                            default => '0.0100000000',
                        },
                        'term_days' => $payoutCount,
                        'paid_days' => 0,
                        'payout_days' => $payoutDays === null
                                ? null
                                : json_encode(
                                    $payoutDays,
                                    JSON_THROW_ON_ERROR,
                                ),
                        'accrued_profit' => '0.00000000',
                        'started_at' => $now,
                        'next_accrual_at' => $now
                            ->copy()
                            ->addDays($firstPayoutDay),
                        'last_accrual_at' => null,
                        'matures_at' => $now
                            ->copy()
                            ->addDays($payoutCount),
                        'principal_released_at' => null,
                        'completed_at' => null,
                        'created_at' => $now,
                        'updated_at' => $now,
                    ]);

                DB::table('wallet_transactions')
                    ->insert([
                        'trading_account_id' => $account->id,
                        'user_id' => $user->id,
                        'strategy_activation_id' => $activationId,
                        'event_type' => 'STRATEGY_ACTIVATED',
                        'direction' => 'LOCK',
                        'asset' => $account->base_asset,
                        'amount' => (string) $amount,
                        'wallet_balance_before' => (string) $wallet,
                        'wallet_balance_after' => (string) $wallet,
                        'available_balance_before' => (string) $available,
                        'available_balance_after' => (string) $newAvailable,
                        'strategy_locked_before' => (string) $strategyLocked,
                        'strategy_locked_after' => (string) $newStrategyLocked,
                        'ai_credits_before' => $currentCredits,
                        'ai_credits_after' => $newCredits,
                        'reference_key' => 'strategy:'.
                            $activationId.
                            ':activated',
                        'description' => 'Paper strategy principal allocated from available trading balance.',
                        'metadata' => json_encode(
                            [
                                'paper' => true,
                                'autoTrading' => false,
                            ],
                            JSON_THROW_ON_ERROR,
                        ),
                        'occurred_at' => $now,
                        'created_at' => $now,
                    ]);

                app(StrategyReferralIncomeService::class)->credit(
                    sourceUserId: (int) $user->id,
                    strategyActivationId: (int) $activationId,
                    tradingAmount: (string) $amount,
                    occurredAt: $now,
                );

                app(ReferralRewardService::class)->distribute(
                    sourceUserId: (int) $user->id,
                    sourceType: 'STRATEGY_ACTIVATION',
                    sourceReference: 'strategy:'.$activationId,
                    baseCredits: $creditCost,
                    occurredAt: $now,
                );

                $activation = DB::table(
                    'strategy_activations',
                )
                    ->where(
                        'id',
                        $activationId,
                    )
                    ->first();

                $user->wallet_balance =
                    (string) $wallet;

                $user->ai_credits =
                    $newCredits;

                $balance->available_balance =
                    (string) $newAvailable;

                $balance->locked_balance =
                    (string) $locked;

                $balance->strategy_locked_balance =
                    (string) $newStrategyLocked;

                return [
                    'idempotentReplay' => false,
                    'activation' => $this->activationResource(
                        $activation,
                    ),
                    'account' => $this->accountResource(
                        $user,
                        $balance,
                    ),
                    'autoTradingEnabled' => false,
                    'automaticOrderCreated' => false,
                ];
            },
            5,
        );
    }

    /**
     * @return array<string, mixed>
     */
    private function activationResource(
        object $activation,
    ): array {
        return [
            'id' => (int) $activation->id,
            'tier' => $activation->tier,
            'strategyName' => $activation->strategy_name,
            'rateType' => $activation->rate_type,
            'displayRate' => $activation->display_rate,
            'allocatedAmount' => (float)
                    $activation->allocated_amount,
            'creditCost' => (int)
                    $activation->credit_cost,
            'billingCycle' => (string)
                    ($activation->billing_cycle ?? 'monthly'),
            'termDays' => (int)
                    $activation->term_days,
            'status' => $activation->status,
            'createdAt' => $activation->created_at,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function accountResource(
        object $user,
        object $balance,
    ): array {
        return [
            'walletBalance' => (float)
                    $user->wallet_balance,
            'availableBalance' => (float)
                    $balance->available_balance,
            'lockedBalance' => (float)
                    $balance->locked_balance,
            'strategyLockedBalance' => (float)
                    $balance->strategy_locked_balance,
            'credits' => (int)
                    $user->ai_credits,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function jsonBody(
        Request $request,
    ): array {
        if (! $request->isJson()) {
            throw new FuturesTradingException(
                'INVALID_CONTENT_TYPE',
                'The strategy request must use application/json.',
                415,
            );
        }

        $body = $request
            ->json()
            ->all();

        if (! is_array($body)) {
            throw new FuturesTradingException(
                'INVALID_REQUEST_BODY',
                'The strategy request must be a JSON object.',
                400,
            );
        }

        return $body;
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
