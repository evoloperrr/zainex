<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Referral\ReferralRewardService;
use Brick\Math\BigDecimal;
use Brick\Math\RoundingMode;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Throwable;

// ZAINEX_WALLET_TO_CREDITS_CONVERTER_V1

final class WalletToCreditsController extends Controller
{
    private const EVENT_TYPE =
        'WALLET_TO_CREDITS';

    private const MAX_AMOUNT =
        1_000_000;

    public function index(
        Request $request,
    ): JsonResponse {
        $guard = $this->guard($request);

        if ($guard !== null) {
            return $guard;
        }

        $sessionId = trim(
            (string) $request->header(
                'X-Zainex-Session-Id',
                '',
            ),
        );

        $account =
            $this->accountForSession(
                $sessionId,
            );

        if ($account === null) {
            return $this->error(
                404,
                'FUTURES_ACCOUNT_NOT_FOUND',
                'No active Futures account was found.',
            );
        }

        if ($account->user_id === null) {
            return $this->error(
                409,
                'FUTURES_ACCOUNT_USER_NOT_LINKED',
                'The Futures account is not linked to a user.',
            );
        }

        $user = DB::table('users')
            ->where('id', $account->user_id)
            ->first();

        $balance = DB::table(
            'trading_balances',
        )
            ->where(
                'trading_account_id',
                $account->id,
            )
            ->where('asset', 'USDT')
            ->first();

        if (
            $user === null ||
            $balance === null
        ) {
            return $this->error(
                409,
                'WALLET_STATE_NOT_AVAILABLE',
                'The linked wallet state is unavailable.',
            );
        }

        return response()
            ->json([
                'ok' => true,
                'mode' => 'paper-wallet',
                'liveTrading' => false,
                'rate' => $this->rate(),
                'state' => $this->state(
                    $user,
                    $balance,
                ),
                'logs' => $this->logs(
                    (int) $account->id,
                ),
            ])
            ->header(
                'Cache-Control',
                'no-store',
            );
    }

    public function store(
        Request $request,
    ): JsonResponse {
        $guard = $this->guard($request);

        if ($guard !== null) {
            return $guard;
        }

        $validator = Validator::make(
            $request->all(),
            [
                'amount' => [
                    'required',
                    'integer',
                    'min:1',
                    'max:' . self::MAX_AMOUNT,
                ],
                'clientRequestId' => [
                    'required',
                    'uuid',
                ],
            ],
        );

        if ($validator->fails()) {
            return $this->error(
                422,
                'INVALID_WALLET_CONVERSION',
                $validator
                    ->errors()
                    ->first(),
            );
        }

        $validated = $validator
            ->validated();

        $amount =
            (int) $validated['amount'];

        $clientRequestId =
            strtolower(
                trim(
                    (string)
                        $validated[
                            'clientRequestId'
                        ],
                ),
            );

        $sessionId = trim(
            (string) $request->header(
                'X-Zainex-Session-Id',
                '',
            ),
        );

        try {
            $result = DB::transaction(
                function () use (
                    $sessionId,
                    $clientRequestId,
                    $amount,
                ): array {
                    $account =
                        $this->accountForSession(
                            $sessionId,
                            true,
                        );

                    if ($account === null) {
                        return [
                            'status' => 404,
                            'payload' =>
                                $this->errorPayload(
                                    'FUTURES_ACCOUNT_NOT_FOUND',
                                    'No active Futures account was found.',
                                ),
                        ];
                    }

                    if (
                        $account->user_id ===
                        null
                    ) {
                        return [
                            'status' => 409,
                            'payload' =>
                                $this->errorPayload(
                                    'FUTURES_ACCOUNT_USER_NOT_LINKED',
                                    'The Futures account is not linked to a user.',
                                ),
                        ];
                    }

                    $user = DB::table(
                        'users',
                    )
                        ->where(
                            'id',
                            $account->user_id,
                        )
                        ->lockForUpdate()
                        ->first();

                    $balance = DB::table(
                        'trading_balances',
                    )
                        ->where(
                            'trading_account_id',
                            $account->id,
                        )
                        ->where(
                            'asset',
                            'USDT',
                        )
                        ->lockForUpdate()
                        ->first();

                    if (
                        $user === null ||
                        $balance === null
                    ) {
                        return [
                            'status' => 409,
                            'payload' =>
                                $this->errorPayload(
                                    'WALLET_STATE_NOT_AVAILABLE',
                                    'The linked wallet state is unavailable.',
                                ),
                        ];
                    }

                    $referenceKey =
                        'wallet-to-credits:' .
                        $account->id .
                        ':' .
                        $clientRequestId;

                    $existing = DB::table(
                        'wallet_transactions',
                    )
                        ->where(
                            'reference_key',
                            $referenceKey,
                        )
                        ->first();

                    if ($existing !== null) {
                        if (
                            (int) round(
                                (float)
                                    $existing
                                        ->amount,
                            ) !== $amount
                        ) {
                            return [
                                'status' => 409,
                                'payload' =>
                                    $this->errorPayload(
                                        'WALLET_CONVERSION_IDEMPOTENCY_CONFLICT',
                                        'This conversion request ID was already used with a different amount.',
                                    ),
                            ];
                        }

                        return [
                            'status' => 200,
                            'payload' => [
                                'ok' => true,
                                'mode' =>
                                    'paper-wallet',
                                'liveTrading' =>
                                    false,
                                'idempotentReplay' =>
                                    true,
                                'rate' =>
                                    $this->rate(),
                                'conversion' =>
                                    $this
                                        ->conversion(
                                            $existing,
                                        ),
                                'state' =>
                                    $this->state(
                                        $user,
                                        $balance,
                                    ),
                                'logs' =>
                                    $this->logs(
                                        (int)
                                            $account
                                                ->id,
                                    ),
                            ],
                        ];
                    }

                    $amountDecimal =
                        BigDecimal::of(
                            (string) $amount,
                        )->toScale(
                            8,
                            RoundingMode::Down,
                        );

                    $walletBefore =
                        BigDecimal::of(
                            (string)
                                $user
                                    ->wallet_balance,
                        )->toScale(
                            8,
                            RoundingMode::Down,
                        );

                    $availableBefore =
                        BigDecimal::of(
                            (string)
                                $balance
                                    ->available_balance,
                        )->toScale(
                            8,
                            RoundingMode::Down,
                        );

                    $strategyLocked =
                        BigDecimal::of(
                            (string) (
                                $balance
                                    ->strategy_locked_balance ??
                                '0'
                            ),
                        )->toScale(
                            8,
                            RoundingMode::Down,
                        );

                    if (
                        $availableBefore
                            ->isLessThan(
                                $amountDecimal,
                            )
                    ) {
                        return [
                            'status' => 422,
                            'payload' =>
                                $this->errorPayload(
                                    'INSUFFICIENT_AVAILABLE_BALANCE',
                                    'Available wallet balance is not enough for this conversion.',
                                ),
                        ];
                    }

                    if (
                        $walletBefore
                            ->isLessThan(
                                $amountDecimal,
                            )
                    ) {
                        return [
                            'status' => 422,
                            'payload' =>
                                $this->errorPayload(
                                    'INSUFFICIENT_WALLET_BALANCE',
                                    'Wallet balance is not enough for this conversion.',
                                ),
                        ];
                    }

                    $walletAfter =
                        $walletBefore
                            ->minus(
                                $amountDecimal,
                            )
                            ->toScale(
                                8,
                                RoundingMode::Down,
                            );

                    $availableAfter =
                        $availableBefore
                            ->minus(
                                $amountDecimal,
                            )
                            ->toScale(
                                8,
                                RoundingMode::Down,
                            );

                    $creditsBefore =
                        (int) $user->ai_credits;

                    $creditsAfter =
                        $creditsBefore +
                        $amount;

                    $occurredAt = now();

                    DB::table('users')
                        ->where(
                            'id',
                            $user->id,
                        )
                        ->update([
                            'wallet_balance' =>
                                (string)
                                    $walletAfter,
                            'ai_credits' =>
                                $creditsAfter,
                            'updated_at' =>
                                $occurredAt,
                        ]);

                    DB::table(
                        'trading_balances',
                    )
                        ->where(
                            'id',
                            $balance->id,
                        )
                        ->update([
                            'available_balance' =>
                                (string)
                                    $availableAfter,
                            'updated_at' =>
                                $occurredAt,
                        ]);

                    $transactionId =
                        DB::table(
                            'wallet_transactions',
                        )->insertGetId([
                            'trading_account_id' =>
                                $account->id,
                            'user_id' =>
                                $user->id,
                            'strategy_activation_id' =>
                                null,
                            'event_type' =>
                                self::EVENT_TYPE,
                            'direction' =>
                                'DEBIT',
                            'asset' =>
                                'USDT',
                            'amount' =>
                                (string)
                                    $amountDecimal,
                            'wallet_balance_before' =>
                                (string)
                                    $walletBefore,
                            'wallet_balance_after' =>
                                (string)
                                    $walletAfter,
                            'available_balance_before' =>
                                (string)
                                    $availableBefore,
                            'available_balance_after' =>
                                (string)
                                    $availableAfter,
                            'strategy_locked_before' =>
                                (string)
                                    $strategyLocked,
                            'strategy_locked_after' =>
                                (string)
                                    $strategyLocked,
                            'ai_credits_before' =>
                                $creditsBefore,
                            'ai_credits_after' =>
                                $creditsAfter,
                            'reference_key' =>
                                $referenceKey,
                            'description' =>
                                'Wallet funds converted to AI credits.',
                            'metadata' =>
                                json_encode(
                                    [
                                        'paper' =>
                                            true,
                                        'rate' =>
                                            '1 USD = 1 credit',
                                        'creditsAdded' =>
                                            $amount,
                                        'clientRequestId' =>
                                            $clientRequestId,
                                    ],
                                    JSON_THROW_ON_ERROR,
                                ),
                            'occurred_at' =>
                                $occurredAt,
                            'created_at' =>
                                $occurredAt,
                        ]);

                    // ZAINEX_REFERRAL_REWARD_PERCENTAGES_V1
                    app(
                        ReferralRewardService::class,
                    )->distribute(
                        sourceUserId:
                            (int) $user->id,
                        sourceType:
                            'CREDIT_PURCHASE',
                        sourceReference:
                            $referenceKey,
                        baseCredits:
                            $amount,
                        occurredAt:
                            $occurredAt,
                    );
                    $transaction =
                        DB::table(
                            'wallet_transactions',
                        )
                            ->where(
                                'id',
                                $transactionId,
                            )
                            ->first();

                    $updatedUser =
                        DB::table('users')
                            ->where(
                                'id',
                                $user->id,
                            )
                            ->first();

                    $updatedBalance =
                        DB::table(
                            'trading_balances',
                        )
                            ->where(
                                'id',
                                $balance->id,
                            )
                            ->first();

                    return [
                        'status' => 201,
                        'payload' => [
                            'ok' => true,
                            'mode' =>
                                'paper-wallet',
                            'liveTrading' =>
                                false,
                            'idempotentReplay' =>
                                false,
                            'rate' =>
                                $this->rate(),
                            'conversion' =>
                                $this->conversion(
                                    $transaction,
                                ),
                            'state' =>
                                $this->state(
                                    $updatedUser,
                                    $updatedBalance,
                                ),
                            'logs' =>
                                $this->logs(
                                    (int)
                                        $account->id,
                                ),
                        ],
                    ];
                },
                5,
            );

            return response()
                ->json(
                    $result['payload'],
                    $result['status'],
                )
                ->header(
                    'Cache-Control',
                    'no-store',
                );
        }
        catch (Throwable $exception) {
            report($exception);

            return $this->error(
                500,
                'WALLET_CONVERSION_FAILED',
                'The wallet conversion could not be completed.',
            );
        }
    }

    private function guard(
        Request $request,
    ): ?JsonResponse {
        $expected = trim(
            (string) Config::get(
                'intelibrain.internal_token',
                '',
            ),
        );

        $provided = trim(
            (string) $request->header(
                'X-Zainex-Internal-Token',
                '',
            ),
        );

        if (
            $expected === '' ||
            $provided === '' ||
            ! hash_equals(
                $expected,
                $provided,
            )
        ) {
            return $this->error(
                401,
                'FUTURES_BACKEND_UNAUTHORIZED',
                'The Laravel Futures request is unauthorized.',
            );
        }

        $sessionId = trim(
            (string) $request->header(
                'X-Zainex-Session-Id',
                '',
            ),
        );

        if (! Str::isUuid($sessionId)) {
            return $this->error(
                422,
                'INVALID_DEMO_SESSION',
                'A valid ZAINEX demo session is required.',
            );
        }

        return null;
    }

    private function accountForSession(
        string $sessionId,
        bool $lock = false,
    ): ?object {
        $query = DB::table(
            'trading_accounts',
        )
            ->where(
                'external_session_id',
                $sessionId,
            )
            ->where(
                'status',
                'ACTIVE',
            );

        if ($lock) {
            $query->lockForUpdate();
        }

        return $query->first();
    }

    /**
     * @return array<string, int|string>
     */
    private function rate(): array
    {
        return [
            'usd' => 1,
            'credits' => 1,
            'label' =>
                '1 USD = 1 AI credit',
        ];
    }

    /**
     * @return array<string, float|int>
     */
    private function state(
        object $user,
        object $balance,
    ): array {
        return [
            'walletBalance' =>
                (float)
                    $user->wallet_balance,
            'availableBalance' =>
                (float)
                    $balance
                        ->available_balance,
            'futuresLockedBalance' =>
                (float)
                    $balance
                        ->locked_balance,
            'strategyLockedBalance' =>
                (float) (
                    $balance
                        ->strategy_locked_balance ??
                    0
                ),
            'credits' =>
                (int) $user->ai_credits,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function conversion(
        object $row,
    ): array {
        return [
            'id' => (int) $row->id,
            'eventType' =>
                self::EVENT_TYPE,
            'amountUsd' =>
                (float) $row->amount,
            'creditsAdded' =>
                (int) (
                    (int)
                        $row
                            ->ai_credits_after -
                    (int)
                        $row
                            ->ai_credits_before
                ),
            'walletBalanceBefore' =>
                (float)
                    $row
                        ->wallet_balance_before,
            'walletBalanceAfter' =>
                (float)
                    $row
                        ->wallet_balance_after,
            'availableBalanceBefore' =>
                (float)
                    $row
                        ->available_balance_before,
            'availableBalanceAfter' =>
                (float)
                    $row
                        ->available_balance_after,
            'creditsBefore' =>
                (int)
                    $row
                        ->ai_credits_before,
            'creditsAfter' =>
                (int)
                    $row
                        ->ai_credits_after,
            'referenceKey' =>
                $row->reference_key,
            'occurredAt' =>
                $row->occurred_at,
        ];
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function logs(
        int $accountId,
    ): array {
        return DB::table(
            'wallet_transactions',
        )
            ->where(
                'trading_account_id',
                $accountId,
            )
            ->where(
                'event_type',
                self::EVENT_TYPE,
            )
            ->orderByDesc(
                'occurred_at',
            )
            ->orderByDesc('id')
            ->limit(10)
            ->get()
            ->map(
                fn (object $row): array =>
                    $this->conversion(
                        $row,
                    ),
            )
            ->values()
            ->all();
    }

    /**
     * @return array<string, mixed>
     */
    private function errorPayload(
        string $code,
        string $message,
    ): array {
        return [
            'ok' => false,
            'error' => [
                'code' => $code,
                'message' => $message,
            ],
        ];
    }

    private function error(
        int $status,
        string $code,
        string $message,
    ): JsonResponse {
        return response()
            ->json(
                $this->errorPayload(
                    $code,
                    $message,
                ),
                $status,
            )
            ->header(
                'Cache-Control',
                'no-store',
            );
    }
}