<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

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

// ZAINEX_ROOT_ADMIN_WALLET_TRANSFER_V1

final class AdminWalletTransferController extends Controller
{
    private const ASSET = 'USDT';

    public function index(
        Request $request,
    ): JsonResponse {
        $guard =
            $this->guard($request);

        if ($guard !== null) {
            return $guard;
        }

        $actor =
            $this->actor(
                trim(
                    (string)
                        $request->header(
                            'X-Zainex-Session-Id',
                            '',
                        ),
                ),
            );

        if ($actor === null) {
            return $this->error(
                404,
                'ADMIN_ACCOUNT_NOT_FOUND',
                'The active admin wallet account was not found.',
            );
        }

        [
            $account,
            $user,
        ] = $actor;

        if (! $this->isAdmin($user)) {
            return $this->error(
                403,
                'ADMIN_PERMISSION_REQUIRED',
                'Root administrator permission is required.',
            );
        }

        $balance =
            DB::table('trading_balances')
                ->where(
                    'trading_account_id',
                    $account->id,
                )
                ->where(
                    'asset',
                    self::ASSET,
                )
                ->first();

        return response()
            ->json([
                'ok' => true,
                'mode' =>
                    'admin-paper-wallet-transfer',
                'liveFunds' =>
                    false,
                'admin' => [
                    'id' =>
                        (int) $user->id,
                    'name' =>
                        (string) $user->name,
                    'email' =>
                        (string) $user->email,
                    'role' =>
                        (string) $user->role,
                    'isAdmin' =>
                        true,
                    'walletBalance' =>
                        (string)
                            $this->decimal(
                                $user->wallet_balance,
                            ),
                    'availableBalance' =>
                        $balance === null
                            ? '0.00000000'
                            : (string)
                                $this->decimal(
                                    $balance
                                        ->available_balance,
                                ),
                ],
                'logs' =>
                    $this->logs(
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
        $guard =
            $this->guard($request);

        if ($guard !== null) {
            return $guard;
        }

        $validator =
            Validator::make(
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
                        'string',
                        'regex:/\A(?:0|[1-9]\d{0,19})(?:\.\d{1,8})?\z/',
                    ],
                    'clientRequestId' => [
                        'required',
                        'string',
                        'uuid',
                    ],
                ],
            );

        if ($validator->fails()) {
            return $this->error(
                422,
                'INVALID_ADMIN_TRANSFER',
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

        $clientRequestId =
            strtolower(
                trim(
                    (string)
                        $validated[
                            'clientRequestId'
                        ],
                ),
            );

        $amount =
            BigDecimal::of(
                (string)
                    $validated['amount'],
            )->toScale(
                8,
                RoundingMode::Down,
            );

        if (
            $amount->compareTo(
                '0.01000000',
            ) < 0 ||
            $amount->compareTo(
                '100000000.00000000',
            ) > 0
        ) {
            return $this->error(
                422,
                'INVALID_TRANSFER_AMOUNT',
                'Transfer amount must be between 0.01 and 100,000,000.00.',
            );
        }

        $sessionId =
            trim(
                (string)
                    $request->header(
                        'X-Zainex-Session-Id',
                        '',
                    ),
            );

        try {
            $result =
                DB::transaction(
                    function () use (
                        $sessionId,
                        $recipientEmail,
                        $clientRequestId,
                        $amount,
                    ): array {
                        $actor =
                            $this->actor(
                                $sessionId,
                                true,
                            );

                        if ($actor === null) {
                            return [
                                'status' => 404,
                                'payload' =>
                                    $this->errorPayload(
                                        'ADMIN_ACCOUNT_NOT_FOUND',
                                        'The active admin wallet account was not found.',
                                    ),
                            ];
                        }

                        [
                            $adminAccount,
                            $admin,
                        ] = $actor;

                        if (
                            ! $this->isAdmin(
                                $admin,
                            )
                        ) {
                            return [
                                'status' => 403,
                                'payload' =>
                                    $this->errorPayload(
                                        'ADMIN_PERMISSION_REQUIRED',
                                        'Root administrator permission is required.',
                                    ),
                            ];
                        }

                        $existing =
                            DB::table(
                                'admin_wallet_transfers',
                            )
                                ->where(
                                    'sender_user_id',
                                    $admin->id,
                                )
                                ->where(
                                    'client_request_id',
                                    $clientRequestId,
                                )
                                ->first();

                        if ($existing !== null) {
                            if (
                                strtolower(
                                    (string)
                                        $existing
                                            ->recipient_email_snapshot,
                                ) !==
                                    $recipientEmail ||
                                $this->decimal(
                                    $existing->amount,
                                )->compareTo(
                                    $amount,
                                ) !== 0
                            ) {
                                return [
                                    'status' => 409,
                                    'payload' =>
                                        $this->errorPayload(
                                            'ADMIN_TRANSFER_IDEMPOTENCY_CONFLICT',
                                            'This request ID was already used with different transfer details.',
                                        ),
                                ];
                            }

                            $recipient =
                                DB::table(
                                    'users',
                                )
                                    ->where(
                                        'id',
                                        $existing
                                            ->recipient_user_id,
                                    )
                                    ->first();

                            return [
                                'status' => 200,
                                'payload' =>
                                    $this->successPayload(
                                        $existing,
                                        $admin,
                                        $recipient,
                                        true,
                                    ),
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
                                        'RECIPIENT_AMBIGUOUS',
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
                            (int) $admin->id
                        ) {
                            return [
                                'status' => 422,
                                'payload' =>
                                    $this->errorPayload(
                                        'ADMIN_SELF_TRANSFER_BLOCKED',
                                        'The admin cannot transfer wallet funds to the same account.',
                                    ),
                            ];
                        }

                        $userIds = [
                            (int) $admin->id,
                            $recipientId,
                        ];

                        sort($userIds);

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

                        $admin =
                            $lockedUsers->get(
                                (int) $admin->id,
                            );

                        $recipient =
                            $lockedUsers->get(
                                $recipientId,
                            );

                        if (
                            $admin === null ||
                            $recipient === null
                        ) {
                            return [
                                'status' => 409,
                                'payload' =>
                                    $this->errorPayload(
                                        'TRANSFER_USERS_UNAVAILABLE',
                                        'The transfer users are not currently available.',
                                    ),
                            ];
                        }

                        if (
                            ! $this->isAdmin(
                                $admin,
                            )
                        ) {
                            return [
                                'status' => 403,
                                'payload' =>
                                    $this->errorPayload(
                                        'ADMIN_PERMISSION_REQUIRED',
                                        'Root administrator permission is required.',
                                    ),
                            ];
                        }

                        $recipientAccount =
                            DB::table(
                                'trading_accounts',
                            )
                                ->where(
                                    'user_id',
                                    $recipientId,
                                )
                                ->where(
                                    'status',
                                    'ACTIVE',
                                )
                                ->orderBy('id')
                                ->lockForUpdate()
                                ->first();

                        if (
                            $recipientAccount ===
                            null
                        ) {
                            return [
                                'status' => 409,
                                'payload' =>
                                    $this->errorPayload(
                                        'RECIPIENT_WALLET_NOT_READY',
                                        'The recipient does not have an active paper wallet.',
                                    ),
                            ];
                        }

                        $adminBalance =
                            DB::table(
                                'trading_balances',
                            )
                                ->where(
                                    'trading_account_id',
                                    $adminAccount->id,
                                )
                                ->where(
                                    'asset',
                                    self::ASSET,
                                )
                                ->lockForUpdate()
                                ->first();

                        $recipientBalance =
                            DB::table(
                                'trading_balances',
                            )
                                ->where(
                                    'trading_account_id',
                                    $recipientAccount->id,
                                )
                                ->where(
                                    'asset',
                                    self::ASSET,
                                )
                                ->lockForUpdate()
                                ->first();

                        if (
                            $adminBalance === null ||
                            $recipientBalance === null
                        ) {
                            return [
                                'status' => 409,
                                'payload' =>
                                    $this->errorPayload(
                                        'TRADING_BALANCE_NOT_READY',
                                        'One of the paper wallet balances is unavailable.',
                                    ),
                            ];
                        }

                        $adminWalletBefore =
                            $this->decimal(
                                $admin
                                    ->wallet_balance,
                            );

                        $adminAvailableBefore =
                            $this->decimal(
                                $adminBalance
                                    ->available_balance,
                            );

                        if (
                            $adminAvailableBefore
                                ->compareTo(
                                    $amount,
                                ) < 0 ||
                            $adminWalletBefore
                                ->compareTo(
                                    $amount,
                                ) < 0
                        ) {
                            return [
                                'status' => 422,
                                'payload' =>
                                    $this->errorPayload(
                                        'ADMIN_WALLET_INSUFFICIENT',
                                        'The admin available wallet balance is insufficient.',
                                    ),
                            ];
                        }

                        $recipientWalletBefore =
                            $this->decimal(
                                $recipient
                                    ->wallet_balance,
                            );

                        $recipientAvailableBefore =
                            $this->decimal(
                                $recipientBalance
                                    ->available_balance,
                            );

                        $adminWalletAfter =
                            $adminWalletBefore
                                ->minus($amount)
                                ->toScale(
                                    8,
                                    RoundingMode::Down,
                                );

                        $adminAvailableAfter =
                            $adminAvailableBefore
                                ->minus($amount)
                                ->toScale(
                                    8,
                                    RoundingMode::Down,
                                );

                        $recipientWalletAfter =
                            $recipientWalletBefore
                                ->plus($amount)
                                ->toScale(
                                    8,
                                    RoundingMode::Down,
                                );

                        $recipientAvailableAfter =
                            $recipientAvailableBefore
                                ->plus($amount)
                                ->toScale(
                                    8,
                                    RoundingMode::Down,
                                );

                        $occurredAt =
                            now();

                        DB::table('users')
                            ->where(
                                'id',
                                $admin->id,
                            )
                            ->update([
                                'wallet_balance' =>
                                    (string)
                                        $adminWalletAfter,

                                'updated_at' =>
                                    $occurredAt,
                            ]);

                        DB::table(
                            'trading_balances',
                        )
                            ->where(
                                'id',
                                $adminBalance->id,
                            )
                            ->update([
                                'available_balance' =>
                                    (string)
                                        $adminAvailableAfter,

                                'updated_at' =>
                                    $occurredAt,
                            ]);

                        DB::table('users')
                            ->where(
                                'id',
                                $recipient->id,
                            )
                            ->update([
                                'wallet_balance' =>
                                    (string)
                                        $recipientWalletAfter,

                                'updated_at' =>
                                    $occurredAt,
                            ]);

                        DB::table(
                            'trading_balances',
                        )
                            ->where(
                                'id',
                                $recipientBalance->id,
                            )
                            ->update([
                                'available_balance' =>
                                    (string)
                                        $recipientAvailableAfter,

                                'updated_at' =>
                                    $occurredAt,
                            ]);

                        $referenceKey =
                            'admin-wallet:' .
                            $admin->id .
                            ':' .
                            $clientRequestId;

                        $transferId =
                            DB::table(
                                'admin_wallet_transfers',
                            )->insertGetId([
                                'sender_user_id' =>
                                    $admin->id,

                                'recipient_user_id' =>
                                    $recipient->id,

                                'sender_trading_account_id' =>
                                    $adminAccount->id,

                                'recipient_trading_account_id' =>
                                    $recipientAccount->id,

                                'recipient_email_snapshot' =>
                                    strtolower(
                                        (string)
                                            $recipient
                                                ->email,
                                    ),

                                'amount' =>
                                    (string) $amount,

                                'sender_wallet_before' =>
                                    (string)
                                        $adminWalletBefore,

                                'sender_wallet_after' =>
                                    (string)
                                        $adminWalletAfter,

                                'sender_available_before' =>
                                    (string)
                                        $adminAvailableBefore,

                                'sender_available_after' =>
                                    (string)
                                        $adminAvailableAfter,

                                'recipient_wallet_before' =>
                                    (string)
                                        $recipientWalletBefore,

                                'recipient_wallet_after' =>
                                    (string)
                                        $recipientWalletAfter,

                                'recipient_available_before' =>
                                    (string)
                                        $recipientAvailableBefore,

                                'recipient_available_after' =>
                                    (string)
                                        $recipientAvailableAfter,

                                'client_request_id' =>
                                    $clientRequestId,

                                'reference_key' =>
                                    $referenceKey,

                                'status' =>
                                    'COMPLETED',

                                'metadata' =>
                                    json_encode([
                                        'mode' =>
                                            'paper-wallet',
                                        'asset' =>
                                            self::ASSET,
                                        'liveFunds' =>
                                            false,
                                    ]),

                                'occurred_at' =>
                                    $occurredAt,

                                'created_at' =>
                                    $occurredAt,
                            ]);

                        $transfer =
                            DB::table(
                                'admin_wallet_transfers',
                            )
                                ->where(
                                    'id',
                                    $transferId,
                                )
                                ->first();

                        return [
                            'status' => 201,
                            'payload' =>
                                $this->successPayload(
                                    $transfer,
                                    $admin,
                                    $recipient,
                                    false,
                                ),
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
        catch (Throwable $error) {
            report($error);

            return $this->error(
                500,
                'ADMIN_TRANSFER_FAILED',
                'The admin wallet transfer could not be completed.',
            );
        }
    }

    private function guard(
        Request $request,
    ): ?JsonResponse {
        $expectedToken =
            trim(
                (string)
                    Config::get(
                        'intelibrain.internal_token',
                        '',
                    ),
            );

        $providedToken =
            trim(
                (string)
                    $request->header(
                        'X-Zainex-Internal-Token',
                        '',
                    ),
            );

        if (
            $expectedToken === '' ||
            $providedToken === '' ||
            ! hash_equals(
                $expectedToken,
                $providedToken,
            )
        ) {
            return $this->error(
                401,
                'ADMIN_BACKEND_UNAUTHORIZED',
                'The admin wallet request is unauthorized.',
            );
        }

        $sessionId =
            trim(
                (string)
                    $request->header(
                        'X-Zainex-Session-Id',
                        '',
                    ),
            );

        if (! Str::isUuid($sessionId)) {
            return $this->error(
                422,
                'INVALID_ADMIN_SESSION',
                'A valid ZAINEX session is required.',
            );
        }

        return null;
    }

    /**
     * @return array{object, object}|null
     */
    private function actor(
        string $sessionId,
        bool $lock = false,
    ): ?array {
        $accountQuery =
            DB::table(
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
            $accountQuery
                ->lockForUpdate();
        }

        $account =
            $accountQuery->first();

        if (
            $account === null ||
            $account->user_id === null
        ) {
            return null;
        }

        $userQuery =
            DB::table('users')
                ->where(
                    'id',
                    $account->user_id,
                );

        if ($lock) {
            $userQuery
                ->lockForUpdate();
        }

        $user =
            $userQuery->first();

        if ($user === null) {
            return null;
        }

        return [
            $account,
            $user,
        ];
    }

    private function isAdmin(
        object $user,
    ): bool {
        return
            (bool)
                (
                    $user->is_admin ??
                    false
                ) &&
            in_array(
                (string) $user->role,
                [
                    'ROOT',
                    'ADMIN',
                ],
                true,
            );
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function logs(
        int $adminUserId,
    ): array {
        return DB::table(
            'admin_wallet_transfers as transfers',
        )
            ->join(
                'users as recipients',
                'recipients.id',
                '=',
                'transfers.recipient_user_id',
            )
            ->where(
                'transfers.sender_user_id',
                $adminUserId,
            )
            ->orderByDesc(
                'transfers.occurred_at',
            )
            ->orderByDesc(
                'transfers.id',
            )
            ->limit(10)
            ->get([
                'transfers.id',
                'transfers.amount',
                'transfers.status',
                'transfers.occurred_at',
                'recipients.name as recipient_name',
                'recipients.email as recipient_email',
            ])
            ->map(
                fn (object $row): array => [
                    'id' =>
                        (int) $row->id,

                    'amount' =>
                        (string)
                            $this->decimal(
                                $row->amount,
                            ),

                    'status' =>
                        (string)
                            $row->status,

                    'occurredAt' =>
                        $row->occurred_at,

                    'recipient' => [
                        'name' =>
                            (string)
                                $row
                                    ->recipient_name,

                        'email' =>
                            (string)
                                $row
                                    ->recipient_email,
                    ],
                ],
            )
            ->values()
            ->all();
    }

    /**
     * @return array<string, mixed>
     */
    private function successPayload(
        object $transfer,
        object $admin,
        ?object $recipient,
        bool $idempotentReplay,
    ): array {
        return [
            'ok' => true,
            'mode' =>
                'admin-paper-wallet-transfer',
            'liveFunds' =>
                false,
            'idempotentReplay' =>
                $idempotentReplay,
            'transfer' => [
                'id' =>
                    (int) $transfer->id,
                'amount' =>
                    (string)
                        $this->decimal(
                            $transfer->amount,
                        ),
                'status' =>
                    (string)
                        $transfer->status,
                'occurredAt' =>
                    $transfer->occurred_at,
                'recipient' => [
                    'id' =>
                        (int)
                            $transfer
                                ->recipient_user_id,
                    'name' =>
                        (string)
                            (
                                $recipient->name ??
                                ''
                            ),
                    'email' =>
                        (string)
                            $transfer
                                ->recipient_email_snapshot,
                ],
            ],
            'admin' => [
                'id' =>
                    (int) $admin->id,
                'walletBalance' =>
                    (string)
                        $this->decimal(
                            $transfer
                                ->sender_wallet_after,
                        ),
                'availableBalance' =>
                    (string)
                        $this->decimal(
                            $transfer
                                ->sender_available_after,
                        ),
            ],
            'logs' =>
                $this->logs(
                    (int) $admin->id,
                ),
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
                'code' =>
                    $code,
                'message' =>
                    $message,
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

    private function decimal(
        mixed $value,
    ): BigDecimal {
        return BigDecimal::of(
            (string) $value,
        )->toScale(
            8,
            RoundingMode::Down,
        );
    }
}