<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Throwable;

// ZAINEX_USER_CREDIT_TRANSFER_V1

final class CreditTransferController extends Controller
{
    private const MAX_AMOUNT =
        1_000_000_000;

    public function index(
        Request $request,
    ): JsonResponse {
        $guard = $this->guard($request);

        if ($guard !== null) {
            return $guard;
        }

        $account =
            $this->accountForSession(
                trim(
                    (string) $request->header(
                        'X-Zainex-Session-Id',
                        '',
                    ),
                ),
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
            ->where(
                'id',
                $account->user_id,
            )
            ->first();

        if ($user === null) {
            return $this->error(
                409,
                'SENDER_USER_NOT_FOUND',
                'The linked sender user could not be found.',
            );
        }

        return response()
            ->json([
                'ok' => true,
                'mode' =>
                    'paper-credit-transfer',
                'liveTrading' => false,
                'sender' => [
                    'id' => (int) $user->id,
                    'name' =>
                        (string) $user->name,
                    'email' =>
                        (string) $user->email,
                    'credits' =>
                        (int) $user->ai_credits,
                ],
                'logs' => $this->logs(
                    (int) $user->id,
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
                'recipientEmail' => [
                    'required',
                    'string',
                    'email:rfc',
                    'max:255',
                ],
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
                'INVALID_CREDIT_TRANSFER',
                $validator
                    ->errors()
                    ->first(),
            );
        }

        $validated =
            $validator->validated();

        $recipientEmail =
            strtolower(
                trim(
                    (string)
                        $validated[
                            'recipientEmail'
                        ],
                ),
            );

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
                    $recipientEmail,
                    $amount,
                    $clientRequestId,
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

                    $senderId =
                        (int)
                            $account->user_id;

                    $existing =
                        DB::table(
                            'credit_transfers',
                        )
                            ->where(
                                'sender_user_id',
                                $senderId,
                            )
                            ->where(
                                'client_request_id',
                                $clientRequestId,
                            )
                            ->first();

                    if ($existing !== null) {
                        if (
                            (int)
                                $existing->amount !==
                                $amount ||
                            strtolower(
                                (string)
                                    $existing
                                        ->recipient_email_snapshot,
                            ) !==
                                $recipientEmail
                        ) {
                            return [
                                'status' => 409,
                                'payload' =>
                                    $this->errorPayload(
                                        'CREDIT_TRANSFER_IDEMPOTENCY_CONFLICT',
                                        'This transfer request ID was already used with different transfer details.',
                                    ),
                            ];
                        }

                        $sender =
                            DB::table('users')
                                ->where(
                                    'id',
                                    $senderId,
                                )
                                ->first();

                        return [
                            'status' => 200,
                            'payload' => [
                                'ok' => true,
                                'mode' =>
                                    'paper-credit-transfer',
                                'liveTrading' =>
                                    false,
                                'idempotentReplay' =>
                                    true,
                                'sender' => [
                                    'id' =>
                                        $senderId,
                                    'name' =>
                                        (string)
                                            $sender
                                                ->name,
                                    'email' =>
                                        (string)
                                            $sender
                                                ->email,
                                    'credits' =>
                                        (int)
                                            $sender
                                                ->ai_credits,
                                ],
                                'transfer' =>
                                    $this
                                        ->transferResource(
                                            $existing,
                                            $senderId,
                                        ),
                                'logs' =>
                                    $this->logs(
                                        $senderId,
                                    ),
                            ],
                        ];
                    }

                    $recipientMatches =
                        DB::table('users')
                            ->whereRaw(
                                'LOWER(email) = ?',
                                [
                                    $recipientEmail,
                                ],
                            )
                            ->orderBy('id')
                            ->limit(2)
                            ->get();

                    if (
                        $recipientMatches
                            ->count() === 0
                    ) {
                        return [
                            'status' => 404,
                            'payload' =>
                                $this->errorPayload(
                                    'RECIPIENT_NOT_FOUND',
                                    'No ZAINEX user was found with that email address.',
                                ),
                        ];
                    }

                    if (
                        $recipientMatches
                            ->count() > 1
                    ) {
                        return [
                            'status' => 409,
                            'payload' =>
                                $this->errorPayload(
                                    'RECIPIENT_EMAIL_AMBIGUOUS',
                                    'Multiple users were found with that email address.',
                                ),
                        ];
                    }

                    $recipientId =
                        (int)
                            $recipientMatches
                                ->first()
                                ->id;

                    if (
                        $recipientId ===
                        $senderId
                    ) {
                        return [
                            'status' => 422,
                            'payload' =>
                                $this->errorPayload(
                                    'SELF_TRANSFER_NOT_ALLOWED',
                                    'You cannot transfer credits to your own account.',
                                ),
                        ];
                    }

                    $userIds = [
                        $senderId,
                        $recipientId,
                    ];

                    sort(
                        $userIds,
                        SORT_NUMERIC,
                    );

                    /** @var Collection<int, object> $lockedUsers */
                    $lockedUsers =
                        DB::table('users')
                            ->whereIn(
                                'id',
                                $userIds,
                            )
                            ->orderBy('id')
                            ->lockForUpdate()
                            ->get()
                            ->keyBy('id');

                    $sender =
                        $lockedUsers->get(
                            $senderId,
                        );

                    $recipient =
                        $lockedUsers->get(
                            $recipientId,
                        );

                    if (
                        $sender === null ||
                        $recipient === null
                    ) {
                        return [
                            'status' => 409,
                            'payload' =>
                                $this->errorPayload(
                                    'TRANSFER_USERS_NOT_AVAILABLE',
                                    'The sender or recipient account is unavailable.',
                                ),
                        ];
                    }

                    $senderBefore =
                        (int)
                            $sender->ai_credits;

                    $recipientBefore =
                        (int)
                            $recipient
                                ->ai_credits;

                    if (
                        $senderBefore <
                        $amount
                    ) {
                        return [
                            'status' => 422,
                            'payload' =>
                                $this->errorPayload(
                                    'INSUFFICIENT_AI_CREDITS',
                                    'Your AI credit balance is not enough for this transfer.',
                                ),
                        ];
                    }

                    $senderAfter =
                        $senderBefore -
                        $amount;

                    $recipientAfter =
                        $recipientBefore +
                        $amount;

                    $occurredAt = now();

                    DB::table('users')
                        ->where(
                            'id',
                            $senderId,
                        )
                        ->update([
                            'ai_credits' =>
                                $senderAfter,
                            'updated_at' =>
                                $occurredAt,
                        ]);

                    DB::table('users')
                        ->where(
                            'id',
                            $recipientId,
                        )
                        ->update([
                            'ai_credits' =>
                                $recipientAfter,
                            'updated_at' =>
                                $occurredAt,
                        ]);

                    $referenceKey =
                        'credit-transfer:' .
                        $senderId .
                        ':' .
                        $clientRequestId;

                    $transferId =
                        DB::table(
                            'credit_transfers',
                        )->insertGetId([
                            'sender_user_id' =>
                                $senderId,
                            'recipient_user_id' =>
                                $recipientId,
                            'sender_trading_account_id' =>
                                $account->id,
                            'recipient_email_snapshot' =>
                                strtolower(
                                    (string)
                                        $recipient
                                            ->email,
                                ),
                            'amount' =>
                                $amount,
                            'sender_credits_before' =>
                                $senderBefore,
                            'sender_credits_after' =>
                                $senderAfter,
                            'recipient_credits_before' =>
                                $recipientBefore,
                            'recipient_credits_after' =>
                                $recipientAfter,
                            'client_request_id' =>
                                $clientRequestId,
                            'reference_key' =>
                                $referenceKey,
                            'status' =>
                                'COMPLETED',
                            'metadata' =>
                                json_encode(
                                    [
                                        'paper' =>
                                            true,
                                        'fee' => 0,
                                        'rate' =>
                                            '1 credit = 1 credit',
                                        'senderEmail' =>
                                            strtolower(
                                                (string)
                                                    $sender
                                                        ->email,
                                            ),
                                        'recipientEmail' =>
                                            strtolower(
                                                (string)
                                                    $recipient
                                                        ->email,
                                            ),
                                    ],
                                    JSON_THROW_ON_ERROR,
                                ),
                            'occurred_at' =>
                                $occurredAt,
                            'created_at' =>
                                $occurredAt,
                        ]);

                    $transfer =
                        DB::table(
                            'credit_transfers',
                        )
                            ->where(
                                'id',
                                $transferId,
                            )
                            ->first();

                    return [
                        'status' => 201,
                        'payload' => [
                            'ok' => true,
                            'mode' =>
                                'paper-credit-transfer',
                            'liveTrading' =>
                                false,
                            'idempotentReplay' =>
                                false,
                            'sender' => [
                                'id' =>
                                    $senderId,
                                'name' =>
                                    (string)
                                        $sender
                                            ->name,
                                'email' =>
                                    (string)
                                        $sender
                                            ->email,
                                'credits' =>
                                    $senderAfter,
                            ],
                            'transfer' =>
                                $this
                                    ->transferResource(
                                        $transfer,
                                        $senderId,
                                    ),
                            'logs' =>
                                $this->logs(
                                    $senderId,
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
                'CREDIT_TRANSFER_FAILED',
                'The AI credit transfer could not be completed.',
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
     * @return array<int, array<string, mixed>>
     */
    private function logs(
        int $currentUserId,
    ): array {
        return DB::table(
            'credit_transfers as transfers',
        )
            ->join(
                'users as sender',
                'sender.id',
                '=',
                'transfers.sender_user_id',
            )
            ->join(
                'users as recipient',
                'recipient.id',
                '=',
                'transfers.recipient_user_id',
            )
            ->where(
                function ($query) use (
                    $currentUserId,
                ): void {
                    $query
                        ->where(
                            'transfers.sender_user_id',
                            $currentUserId,
                        )
                        ->orWhere(
                            'transfers.recipient_user_id',
                            $currentUserId,
                        );
                },
            )
            ->select([
                'transfers.*',
                'sender.name as sender_name',
                'sender.email as sender_email',
                'recipient.name as recipient_name',
                'recipient.email as recipient_email',
            ])
            ->orderByDesc(
                'transfers.occurred_at',
            )
            ->orderByDesc(
                'transfers.id',
            )
            ->limit(10)
            ->get()
            ->map(
                fn (object $row): array =>
                    $this
                        ->transferResource(
                            $row,
                            $currentUserId,
                        ),
            )
            ->values()
            ->all();
    }

    /**
     * @return array<string, mixed>
     */
    private function transferResource(
        object $row,
        int $currentUserId,
    ): array {
        $sent =
            (int)
                $row->sender_user_id ===
            $currentUserId;

        return [
            'id' =>
                (int) $row->id,
            'direction' =>
                $sent
                    ? 'SENT'
                    : 'RECEIVED',
            'amount' =>
                (int) $row->amount,
            'counterparty' => [
                'name' =>
                    $sent
                        ? (
                            property_exists(
                                $row,
                                'recipient_name',
                            )
                                ? (string)
                                    $row
                                        ->recipient_name
                                : ''
                        )
                        : (
                            property_exists(
                                $row,
                                'sender_name',
                            )
                                ? (string)
                                    $row
                                        ->sender_name
                                : ''
                        ),
                'email' =>
                    $sent
                        ? (
                            property_exists(
                                $row,
                                'recipient_email',
                            )
                                ? (string)
                                    $row
                                        ->recipient_email
                                : (string)
                                    $row
                                        ->recipient_email_snapshot
                        )
                        : (
                            property_exists(
                                $row,
                                'sender_email',
                            )
                                ? (string)
                                    $row
                                        ->sender_email
                                : ''
                        ),
            ],
            'creditsBefore' =>
                $sent
                    ? (int)
                        $row
                            ->sender_credits_before
                    : (int)
                        $row
                            ->recipient_credits_before,
            'creditsAfter' =>
                $sent
                    ? (int)
                        $row
                            ->sender_credits_after
                    : (int)
                        $row
                            ->recipient_credits_after,
            'status' =>
                (string) $row->status,
            'referenceKey' =>
                (string)
                    $row->reference_key,
            'occurredAt' =>
                (string)
                    $row->occurred_at,
        ];
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