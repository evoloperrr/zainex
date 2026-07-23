<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\LinksTradingAccountToUser;
use App\Http\Controllers\Controller;
use Brick\Math\BigDecimal;
use Brick\Math\RoundingMode;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Throwable;

// ZAINEX_CASHOUT_REQUEST_V1
// User-initiated wallet withdrawal. Payment rails aren't finalized yet
// (see destination_note on the migration), so this only handles the
// request/hold/review lifecycle — no money actually leaves the platform
// through this code; an admin still has to send it manually and then
// approve the request here to finalize the ledger, exactly like
// MerchantCashinController does for money coming in.
//
// The requested amount is locked out of available_balance immediately
// at submission time (mirroring how a strategy activation locks funds)
// so the user can't spend/convert/transfer it away while the request is
// pending — wallet_balance itself (the user's real total) only drops
// once an admin approves.

final class CashoutRequestController extends Controller
{
    use LinksTradingAccountToUser;

    private const ASSET = 'USDT';

    private const MIN_CASHOUT_USD = 1.0;

    private const MAX_CASHOUT_USD = 100_000.0;

    public function store(Request $request): JsonResponse
    {
        $guard = $this->guard($request);

        if ($guard !== null) {
            return $guard;
        }

        $validator = Validator::make($request->all(), [
            'amount' => ['required', 'numeric'],
            'destinationNote' => ['nullable', 'string', 'max:500'],
            'clientRequestId' => ['required', 'uuid'],
        ]);

        if ($validator->fails()) {
            return $this->error(422, 'INVALID_CASHOUT_REQUEST', $validator->errors()->first());
        }

        $validated = $validator->validated();
        $amount = (float) $validated['amount'];

        if ($amount < self::MIN_CASHOUT_USD || $amount > self::MAX_CASHOUT_USD) {
            return $this->error(
                422,
                'INVALID_CASHOUT_AMOUNT',
                sprintf(
                    'Enter an amount between $%s and $%s.',
                    number_format(self::MIN_CASHOUT_USD, 2),
                    number_format(self::MAX_CASHOUT_USD, 2),
                ),
            );
        }

        $destinationNote = isset($validated['destinationNote'])
            ? trim((string) $validated['destinationNote'])
            : null;

        $clientRequestId = strtolower(trim((string) $validated['clientRequestId']));

        $sessionId = trim((string) $request->header('X-Zainex-Session-Id', ''));

        $this->linkAccountToUser($sessionId, $request->header('X-Zainex-User-Email'));

        try {
            $result = DB::transaction(function () use (
                $sessionId,
                $amount,
                $destinationNote,
                $clientRequestId,
            ): array {
                $account = $this->accountForSession($sessionId, true);

                if ($account === null) {
                    return [
                        'status' => 404,
                        'payload' => $this->errorPayload(
                            'FUTURES_ACCOUNT_NOT_FOUND',
                            'No active Futures account was found.',
                        ),
                    ];
                }

                if ($account->user_id === null) {
                    return [
                        'status' => 409,
                        'payload' => $this->errorPayload(
                            'FUTURES_ACCOUNT_USER_NOT_LINKED',
                            'The Futures account is not linked to a user.',
                        ),
                    ];
                }

                $user = DB::table('users')
                    ->where('id', $account->user_id)
                    ->lockForUpdate()
                    ->first();

                $balance = DB::table('trading_balances')
                    ->where('trading_account_id', $account->id)
                    ->where('asset', self::ASSET)
                    ->lockForUpdate()
                    ->first();

                if ($user === null || $balance === null) {
                    return [
                        'status' => 409,
                        'payload' => $this->errorPayload(
                            'WALLET_STATE_NOT_AVAILABLE',
                            'The linked wallet state is unavailable.',
                        ),
                    ];
                }

                $referenceKey = 'cashout-request:'.$account->id.':'.$clientRequestId;

                $existing = DB::table('wallet_transactions')
                    ->where('reference_key', $referenceKey)
                    ->first();

                if ($existing !== null) {
                    $existingMetadata = is_string($existing->metadata)
                        ? (json_decode($existing->metadata, true) ?: [])
                        : [];

                    $existingRequestId = isset($existingMetadata['cashoutRequestId'])
                        ? (int) $existingMetadata['cashoutRequestId']
                        : null;

                    $existingRequest = $existingRequestId === null
                        ? null
                        : DB::table('cashout_requests')->where('id', $existingRequestId)->first();

                    return [
                        'status' => 200,
                        'payload' => [
                            'ok' => true,
                            'idempotentReplay' => true,
                            'request' => $existingRequest === null
                                ? null
                                : $this->requestResource($existingRequest),
                            'availableBalance' => (float) $balance->available_balance,
                        ],
                    ];
                }

                $amountDecimal = BigDecimal::of((string) $amount)->toScale(8, RoundingMode::Down);

                $available = BigDecimal::of((string) $balance->available_balance)
                    ->toScale(8, RoundingMode::Down);

                if ($available->isLessThan($amountDecimal)) {
                    return [
                        'status' => 422,
                        'payload' => $this->errorPayload(
                            'INSUFFICIENT_AVAILABLE_BALANCE',
                            'The amount exceeds your available wallet balance.',
                        ),
                    ];
                }

                $walletBefore = BigDecimal::of((string) $user->wallet_balance)
                    ->toScale(8, RoundingMode::Down);

                $newAvailable = $available->minus($amountDecimal)->toScale(8, RoundingMode::Down);

                $cashoutLocked = BigDecimal::of((string) $balance->cashout_locked_balance)
                    ->toScale(8, RoundingMode::Down);

                $newCashoutLocked = $cashoutLocked->plus($amountDecimal)->toScale(8, RoundingMode::Down);

                $occurredAt = now();

                DB::table('trading_balances')
                    ->where('id', $balance->id)
                    ->update([
                        'available_balance' => (string) $newAvailable,
                        'cashout_locked_balance' => (string) $newCashoutLocked,
                        'updated_at' => $occurredAt,
                    ]);

                $cashoutRequestId = DB::table('cashout_requests')->insertGetId([
                    'user_id' => $user->id,
                    'trading_account_id' => $account->id,
                    'amount' => (string) $amountDecimal,
                    'destination_note' => $destinationNote !== '' ? $destinationNote : null,
                    'status' => 'pending',
                    'created_at' => $occurredAt,
                    'updated_at' => $occurredAt,
                ]);

                DB::table('wallet_transactions')->insert([
                    'trading_account_id' => $account->id,
                    'user_id' => $user->id,
                    'strategy_activation_id' => null,
                    'event_type' => 'CASHOUT_REQUESTED',
                    'direction' => 'LOCK',
                    'asset' => self::ASSET,
                    'amount' => (string) $amountDecimal,
                    'wallet_balance_before' => (string) $walletBefore,
                    'wallet_balance_after' => (string) $walletBefore,
                    'available_balance_before' => (string) $available,
                    'available_balance_after' => (string) $newAvailable,
                    'strategy_locked_before' => (string) $balance->strategy_locked_balance,
                    'strategy_locked_after' => (string) $balance->strategy_locked_balance,
                    'ai_credits_before' => (int) $user->ai_credits,
                    'ai_credits_after' => (int) $user->ai_credits,
                    'reference_key' => $referenceKey,
                    'description' => 'Cashout requested — pending admin review.',
                    'metadata' => json_encode([
                        'cashoutRequestId' => $cashoutRequestId,
                        'destinationNote' => $destinationNote,
                    ], JSON_THROW_ON_ERROR),
                    'occurred_at' => $occurredAt,
                    'created_at' => $occurredAt,
                ]);

                $cashoutRequest = DB::table('cashout_requests')->where('id', $cashoutRequestId)->first();

                return [
                    'status' => 201,
                    'payload' => [
                        'ok' => true,
                        'idempotentReplay' => false,
                        'request' => $this->requestResource($cashoutRequest),
                        'availableBalance' => (float) (string) $newAvailable,
                    ],
                ];
            }, 5);

            return response()
                ->json($result['payload'], $result['status'])
                ->header('Cache-Control', 'no-store');
        } catch (Throwable $exception) {
            report($exception);

            return $this->error(500, 'CASHOUT_REQUEST_FAILED', 'The cashout request could not be submitted.');
        }
    }

    public function index(Request $request): JsonResponse
    {
        $guard = $this->guard($request);

        if ($guard !== null) {
            return $guard;
        }

        $sessionId = trim((string) $request->header('X-Zainex-Session-Id', ''));

        $this->linkAccountToUser($sessionId, $request->header('X-Zainex-User-Email'));

        $account = $this->accountForSession($sessionId);

        if ($account === null) {
            return $this->error(404, 'FUTURES_ACCOUNT_NOT_FOUND', 'No active Futures account was found.');
        }

        $logs = DB::table('cashout_requests')
            ->where('trading_account_id', $account->id)
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->limit(10)
            ->get()
            ->map(fn (object $row): array => $this->requestResource($row))
            ->values()
            ->all();

        return response()
            ->json([
                'ok' => true,
                'logs' => $logs,
            ])
            ->header('Cache-Control', 'no-store');
    }

    /**
     * @return array<string, mixed>
     */
    private function requestResource(object $row): array
    {
        return [
            'id' => (int) $row->id,
            'amount' => (float) $row->amount,
            'destinationNote' => $row->destination_note,
            'status' => (string) $row->status,
            'adminNote' => $row->admin_note,
            'reviewedAt' => $row->reviewed_at,
            'createdAt' => (string) $row->created_at,
        ];
    }

    private function guard(Request $request): ?JsonResponse
    {
        $expected = trim((string) Config::get('intelibrain.internal_token', ''));
        $provided = trim((string) $request->header('X-Zainex-Internal-Token', ''));

        if ($expected === '' || $provided === '' || ! hash_equals($expected, $provided)) {
            return $this->error(401, 'FUTURES_BACKEND_UNAUTHORIZED', 'The Laravel Futures request is unauthorized.');
        }

        $sessionId = trim((string) $request->header('X-Zainex-Session-Id', ''));

        if (! Str::isUuid($sessionId)) {
            return $this->error(422, 'INVALID_DEMO_SESSION', 'A valid ZAINEX demo session is required.');
        }

        return null;
    }

    private function accountForSession(string $sessionId, bool $lock = false): ?object
    {
        $query = DB::table('trading_accounts')
            ->where('external_session_id', $sessionId)
            ->where('status', 'ACTIVE');

        if ($lock) {
            $query->lockForUpdate();
        }

        return $query->first();
    }

    /**
     * @return array<string, mixed>
     */
    private function errorPayload(string $code, string $message): array
    {
        return [
            'ok' => false,
            'error' => [
                'code' => $code,
                'message' => $message,
            ],
        ];
    }

    private function error(int $status, string $code, string $message): JsonResponse
    {
        return response()
            ->json($this->errorPayload($code, $message), $status)
            ->header('Cache-Control', 'no-store');
    }
}
