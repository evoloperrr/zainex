<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\LinksTradingAccountToUser;
use App\Http\Controllers\Controller;
use Brick\Math\BigDecimal;
use Brick\Math\RoundingMode;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Throwable;

// ZAINEX_ADMIN_CONSOLE_V1
// General-purpose admin console: platform overview, user lookup/search,
// manual VIP grants + wallet credits (the only way today to complete a
// "Pay via Merchant" GoTyme checkout, which has no automated backend of
// its own), and read-only visibility into the crypto payment ledger and
// the wallet transaction audit trail. Auth mirrors AdminWalletTransferController
// exactly: shared internal token + session-resolved actor + is_admin/role check.

final class AdminController extends Controller
{
    use LinksTradingAccountToUser;

    private const ASSET = 'USDT';

    private const MAX_PER_PAGE = 100;

    public function overview(Request $request): JsonResponse
    {
        $guard = $this->authorize($request);

        if ($guard !== null) {
            return $guard;
        }

        $totalUsers = (int) DB::table('users')->count();

        $totalWalletBalance = (string) DB::table('users')->sum('wallet_balance');

        $totalAiCredits = (int) DB::table('users')->sum('ai_credits');

        $vipBreakdown = DB::table('users')
            ->select('vip_tier', DB::raw('count(*) as total'))
            ->whereNotNull('vip_tier')
            ->where('vip_expires_at', '>', now())
            ->groupBy('vip_tier')
            ->get()
            ->map(fn (object $row): array => [
                'tier' => (string) $row->vip_tier,
                'count' => (int) $row->total,
            ])
            ->values()
            ->all();

        $pendingCryptoPayments = (int) DB::table('crypto_payments')
            ->whereNotIn('status', ['finished', 'confirmed', 'failed', 'expired'])
            ->count();

        $recentSignups = DB::table('users')
            ->select('id', 'name', 'email', 'created_at')
            ->orderByDesc('created_at')
            ->limit(10)
            ->get()
            ->map(fn (object $row): array => [
                'id' => (int) $row->id,
                'name' => (string) $row->name,
                'email' => (string) $row->email,
                'createdAt' => (string) $row->created_at,
            ])
            ->values()
            ->all();

        return response()
            ->json([
                'ok' => true,
                'totalUsers' => $totalUsers,
                'totalWalletBalance' => (float) $totalWalletBalance,
                'totalAiCredits' => $totalAiCredits,
                'vipBreakdown' => $vipBreakdown,
                'pendingCryptoPayments' => $pendingCryptoPayments,
                'recentSignups' => $recentSignups,
            ])
            ->header('Cache-Control', 'no-store');
    }

    public function users(Request $request): JsonResponse
    {
        $guard = $this->authorize($request);

        if ($guard !== null) {
            return $guard;
        }

        [$page, $perPage] = $this->pagination($request);

        $search = trim((string) $request->query('search', ''));

        $query = DB::table('users')->select(
            'id',
            'name',
            'email',
            'role',
            'is_admin',
            'wallet_balance',
            'ai_credits',
            'vip_tier',
            'vip_expires_at',
            'created_at',
        );

        if ($search !== '') {
            $query->where(function ($inner) use ($search): void {
                $inner->whereRaw('LOWER(email) LIKE ?', ['%'.strtolower($search).'%'])
                    ->orWhereRaw('LOWER(name) LIKE ?', ['%'.strtolower($search).'%']);
            });
        }

        $total = (clone $query)->count();

        $rows = $query
            ->orderByDesc('created_at')
            ->forPage($page, $perPage)
            ->get()
            ->map(fn (object $row): array => $this->userPayload($row))
            ->values()
            ->all();

        return response()
            ->json([
                'ok' => true,
                'page' => $page,
                'perPage' => $perPage,
                'total' => $total,
                'users' => $rows,
            ])
            ->header('Cache-Control', 'no-store');
    }

    public function updateUserName(Request $request): JsonResponse
    {
        $guard = $this->authorize($request);

        if ($guard !== null) {
            return $guard;
        }

        $validator = Validator::make($request->all(), [
            'targetEmail' => ['required', 'string', 'email:rfc', 'max:255'],
            'name' => ['required', 'string', 'min:1', 'max:255'],
        ]);

        if ($validator->fails()) {
            return $this->error(422, 'INVALID_NAME_UPDATE_REQUEST', $validator->errors()->first());
        }

        $validated = $validator->validated();
        $targetEmail = strtolower(trim((string) $validated['targetEmail']));
        $name = trim((string) $validated['name']);

        $target = DB::table('users')
            ->whereRaw('LOWER(email) = ?', [$targetEmail])
            ->first();

        if ($target === null) {
            return $this->error(404, 'TARGET_USER_NOT_FOUND', 'No user was found with that email.');
        }

        DB::table('users')
            ->where('id', $target->id)
            ->update([
                'name' => $name,
                'updated_at' => now(),
            ]);

        return response()
            ->json([
                'ok' => true,
                'user' => [
                    'id' => (int) $target->id,
                    'email' => (string) $target->email,
                    'name' => $name,
                ],
            ])
            ->header('Cache-Control', 'no-store');
    }

    public function grantVip(Request $request): JsonResponse
    {
        $guard = $this->authorize($request);

        if ($guard !== null) {
            return $guard;
        }

        $validator = Validator::make($request->all(), [
            'targetEmail' => ['required', 'string', 'email:rfc', 'max:255'],
            'planName' => ['required', 'string', 'in:VIP 1,VIP 2,VIP 3'],
            'months' => ['nullable', 'integer', 'min:1', 'max:24'],
        ]);

        if ($validator->fails()) {
            return $this->error(422, 'INVALID_VIP_GRANT_REQUEST', $validator->errors()->first());
        }

        $validated = $validator->validated();
        $targetEmail = strtolower(trim((string) $validated['targetEmail']));
        $planName = (string) $validated['planName'];
        $months = (int) ($validated['months'] ?? 1);

        try {
            $result = DB::transaction(function () use ($targetEmail, $planName, $months): array {
                $target = DB::table('users')
                    ->whereRaw('LOWER(email) = ?', [$targetEmail])
                    ->lockForUpdate()
                    ->first();

                if ($target === null) {
                    return [
                        'status' => 404,
                        'payload' => $this->errorPayload(
                            'TARGET_USER_NOT_FOUND',
                            'No user was found with that email.',
                        ),
                    ];
                }

                $currentExpiry = $target->vip_expires_at !== null
                    ? Carbon::parse($target->vip_expires_at)
                    : null;

                $base = ($currentExpiry !== null && $currentExpiry->isFuture())
                    ? $currentExpiry
                    : now();

                $expiresAt = $base->copy()->addMonths($months);

                DB::table('users')
                    ->where('id', $target->id)
                    ->update([
                        'vip_tier' => $planName,
                        'vip_expires_at' => $expiresAt,
                        'updated_at' => now(),
                    ]);

                return [
                    'status' => 200,
                    'payload' => [
                        'ok' => true,
                        'user' => [
                            'id' => (int) $target->id,
                            'email' => (string) $target->email,
                            'vipTier' => $planName,
                            'vipExpiresAt' => (string) $expiresAt,
                        ],
                    ],
                ];
            }, 5);

            return response()
                ->json($result['payload'], $result['status'])
                ->header('Cache-Control', 'no-store');
        } catch (Throwable $exception) {
            report($exception);

            return $this->error(500, 'VIP_GRANT_FAILED', 'The VIP grant could not be completed.');
        }
    }

    public function creditWallet(Request $request): JsonResponse
    {
        $guard = $this->authorize($request);

        if ($guard !== null) {
            return $guard;
        }

        $validator = Validator::make($request->all(), [
            'targetEmail' => ['required', 'string', 'email:rfc', 'max:255'],
            'amount' => ['required', 'numeric', 'min:0.01', 'max:100000000'],
            'clientRequestId' => ['required', 'uuid'],
            'note' => ['nullable', 'string', 'max:255'],
        ]);

        if ($validator->fails()) {
            return $this->error(422, 'INVALID_ADMIN_CREDIT_REQUEST', $validator->errors()->first());
        }

        $validated = $validator->validated();
        $targetEmail = strtolower(trim((string) $validated['targetEmail']));
        $amount = $this->decimal((string) $validated['amount']);
        $clientRequestId = strtolower(trim((string) $validated['clientRequestId']));
        $note = trim((string) ($validated['note'] ?? ''));

        try {
            $result = DB::transaction(function () use (
                $targetEmail,
                $amount,
                $clientRequestId,
                $note,
            ): array {
                $target = DB::table('users')
                    ->whereRaw('LOWER(email) = ?', [$targetEmail])
                    ->lockForUpdate()
                    ->first();

                if ($target === null) {
                    return [
                        'status' => 404,
                        'payload' => $this->errorPayload(
                            'TARGET_USER_NOT_FOUND',
                            'No user was found with that email.',
                        ),
                    ];
                }

                $account = DB::table('trading_accounts')
                    ->where('user_id', $target->id)
                    ->where('status', 'ACTIVE')
                    ->lockForUpdate()
                    ->first();

                if ($account === null) {
                    return [
                        'status' => 409,
                        'payload' => $this->errorPayload(
                            'TARGET_ACCOUNT_NOT_FOUND',
                            'That user has no active trading account to credit.',
                        ),
                    ];
                }

                $balance = DB::table('trading_balances')
                    ->where('trading_account_id', $account->id)
                    ->where('asset', self::ASSET)
                    ->lockForUpdate()
                    ->first();

                if ($balance === null) {
                    return [
                        'status' => 409,
                        'payload' => $this->errorPayload(
                            'TARGET_BALANCE_NOT_FOUND',
                            'That user has no wallet balance row to credit.',
                        ),
                    ];
                }

                $referenceKey = 'admin-manual-credit:'.$account->id.':'.$clientRequestId;

                $existing = DB::table('wallet_transactions')
                    ->where('reference_key', $referenceKey)
                    ->first();

                if ($existing !== null) {
                    return [
                        'status' => 200,
                        'payload' => [
                            'ok' => true,
                            'idempotentReplay' => true,
                            'walletBalanceAfter' => (float) $existing->wallet_balance_after,
                        ],
                    ];
                }

                $walletBefore = $this->decimal($target->wallet_balance);
                $walletAfter = $walletBefore->plus($amount)->toScale(8, RoundingMode::Down);

                $availableBefore = $this->decimal($balance->available_balance);
                $availableAfter = $availableBefore->plus($amount)->toScale(8, RoundingMode::Down);

                $strategyLocked = $this->decimal($balance->strategy_locked_balance ?? '0');

                $occurredAt = now();

                DB::table('users')
                    ->where('id', $target->id)
                    ->update([
                        'wallet_balance' => (string) $walletAfter,
                        'updated_at' => $occurredAt,
                    ]);

                DB::table('trading_balances')
                    ->where('id', $balance->id)
                    ->update([
                        'available_balance' => (string) $availableAfter,
                        'updated_at' => $occurredAt,
                    ]);

                DB::table('wallet_transactions')->insert([
                    'trading_account_id' => $account->id,
                    'user_id' => $target->id,
                    'strategy_activation_id' => null,
                    'event_type' => 'ADMIN_MANUAL_CREDIT',
                    'direction' => 'CREDIT',
                    'asset' => self::ASSET,
                    'amount' => (string) $amount,
                    'wallet_balance_before' => (string) $walletBefore,
                    'wallet_balance_after' => (string) $walletAfter,
                    'available_balance_before' => (string) $availableBefore,
                    'available_balance_after' => (string) $availableAfter,
                    'strategy_locked_before' => (string) $strategyLocked,
                    'strategy_locked_after' => (string) $strategyLocked,
                    'ai_credits_before' => (int) $target->ai_credits,
                    'ai_credits_after' => (int) $target->ai_credits,
                    'reference_key' => $referenceKey,
                    'description' => $note !== '' ? $note : 'Manual admin wallet credit.',
                    'metadata' => json_encode(['manual' => true], JSON_THROW_ON_ERROR),
                    'occurred_at' => $occurredAt,
                    'created_at' => $occurredAt,
                ]);

                return [
                    'status' => 201,
                    'payload' => [
                        'ok' => true,
                        'idempotentReplay' => false,
                        'walletBalanceAfter' => (float) (string) $walletAfter,
                    ],
                ];
            }, 5);

            return response()
                ->json($result['payload'], $result['status'])
                ->header('Cache-Control', 'no-store');
        } catch (Throwable $exception) {
            report($exception);

            return $this->error(500, 'ADMIN_CREDIT_FAILED', 'The wallet credit could not be completed.');
        }
    }

    public function cryptoPayments(Request $request): JsonResponse
    {
        $guard = $this->authorize($request);

        if ($guard !== null) {
            return $guard;
        }

        [$page, $perPage] = $this->pagination($request);

        $status = trim((string) $request->query('status', ''));

        $query = DB::table('crypto_payments as cp')
            ->leftJoin('users as u', 'u.id', '=', 'cp.user_id')
            ->select(
                'cp.id',
                'cp.purpose',
                'cp.plan_name',
                'cp.price_amount',
                'cp.pay_currency',
                'cp.pay_amount',
                'cp.status',
                'cp.provider_payment_id',
                'cp.credited_at',
                'cp.created_at',
                'u.email as user_email',
            );

        if ($status !== '') {
            $query->where('cp.status', $status);
        }

        $total = (clone $query)->count();

        $rows = $query
            ->orderByDesc('cp.created_at')
            ->forPage($page, $perPage)
            ->get()
            ->map(fn (object $row): array => [
                'id' => (int) $row->id,
                'userEmail' => $row->user_email,
                'purpose' => (string) $row->purpose,
                'planName' => $row->plan_name,
                'priceAmount' => (float) $row->price_amount,
                'payCurrency' => $row->pay_currency,
                'payAmount' => $row->pay_amount,
                'status' => (string) $row->status,
                'providerPaymentId' => $row->provider_payment_id,
                'creditedAt' => $row->credited_at,
                'createdAt' => (string) $row->created_at,
            ])
            ->values()
            ->all();

        return response()
            ->json([
                'ok' => true,
                'page' => $page,
                'perPage' => $perPage,
                'total' => $total,
                'payments' => $rows,
            ])
            ->header('Cache-Control', 'no-store');
    }

    public function walletLedger(Request $request): JsonResponse
    {
        $guard = $this->authorize($request);

        if ($guard !== null) {
            return $guard;
        }

        [$page, $perPage] = $this->pagination($request);

        $eventType = trim((string) $request->query('eventType', ''));

        $query = DB::table('wallet_transactions as wt')
            ->leftJoin('users as u', 'u.id', '=', 'wt.user_id')
            ->select(
                'wt.id',
                'wt.event_type',
                'wt.direction',
                'wt.asset',
                'wt.amount',
                'wt.wallet_balance_before',
                'wt.wallet_balance_after',
                'wt.reference_key',
                'wt.description',
                'wt.occurred_at',
                'u.email as user_email',
            );

        if ($eventType !== '') {
            $query->where('wt.event_type', $eventType);
        }

        $total = (clone $query)->count();

        $rows = $query
            ->orderByDesc('wt.occurred_at')
            ->orderByDesc('wt.id')
            ->forPage($page, $perPage)
            ->get()
            ->map(fn (object $row): array => [
                'id' => (int) $row->id,
                'userEmail' => $row->user_email,
                'eventType' => (string) $row->event_type,
                'direction' => (string) $row->direction,
                'asset' => (string) $row->asset,
                'amount' => (float) $row->amount,
                'walletBalanceBefore' => (float) $row->wallet_balance_before,
                'walletBalanceAfter' => (float) $row->wallet_balance_after,
                'referenceKey' => (string) $row->reference_key,
                'description' => $row->description,
                'occurredAt' => (string) $row->occurred_at,
            ])
            ->values()
            ->all();

        return response()
            ->json([
                'ok' => true,
                'page' => $page,
                'perPage' => $perPage,
                'total' => $total,
                'transactions' => $rows,
            ])
            ->header('Cache-Control', 'no-store');
    }

    public function adminWalletTransfers(Request $request): JsonResponse
    {
        $guard = $this->authorize($request);

        if ($guard !== null) {
            return $guard;
        }

        [$page, $perPage] = $this->pagination($request);

        $query = DB::table('admin_wallet_transfers as awt')
            ->leftJoin('users as sender', 'sender.id', '=', 'awt.sender_user_id')
            ->leftJoin('users as recipient', 'recipient.id', '=', 'awt.recipient_user_id')
            ->select(
                'awt.id',
                'awt.amount',
                'awt.status',
                'awt.reference_key',
                'awt.occurred_at',
                'sender.email as sender_email',
                'recipient.email as recipient_email',
            );

        $total = (clone $query)->count();

        $rows = $query
            ->orderByDesc('awt.occurred_at')
            ->orderByDesc('awt.id')
            ->forPage($page, $perPage)
            ->get()
            ->map(fn (object $row): array => [
                'id' => (int) $row->id,
                'senderEmail' => $row->sender_email,
                'recipientEmail' => $row->recipient_email,
                'amount' => (float) $row->amount,
                'status' => (string) $row->status,
                'referenceKey' => (string) $row->reference_key,
                'occurredAt' => (string) $row->occurred_at,
            ])
            ->values()
            ->all();

        return response()
            ->json([
                'ok' => true,
                'page' => $page,
                'perPage' => $perPage,
                'total' => $total,
                'transfers' => $rows,
            ])
            ->header('Cache-Control', 'no-store');
    }

    public function creditTransfers(Request $request): JsonResponse
    {
        $guard = $this->authorize($request);

        if ($guard !== null) {
            return $guard;
        }

        [$page, $perPage] = $this->pagination($request);

        $query = DB::table('credit_transfers as ct')
            ->leftJoin('users as sender', 'sender.id', '=', 'ct.sender_user_id')
            ->leftJoin('users as recipient', 'recipient.id', '=', 'ct.recipient_user_id')
            ->select(
                'ct.id',
                'ct.amount',
                'ct.status',
                'ct.reference_key',
                'ct.occurred_at',
                'sender.email as sender_email',
                'recipient.email as recipient_email',
            );

        $total = (clone $query)->count();

        $rows = $query
            ->orderByDesc('ct.occurred_at')
            ->orderByDesc('ct.id')
            ->forPage($page, $perPage)
            ->get()
            ->map(fn (object $row): array => [
                'id' => (int) $row->id,
                'senderEmail' => $row->sender_email,
                'recipientEmail' => $row->recipient_email,
                'amount' => (int) $row->amount,
                'status' => (string) $row->status,
                'referenceKey' => (string) $row->reference_key,
                'occurredAt' => (string) $row->occurred_at,
            ])
            ->values()
            ->all();

        return response()
            ->json([
                'ok' => true,
                'page' => $page,
                'perPage' => $perPage,
                'total' => $total,
                'transfers' => $rows,
            ])
            ->header('Cache-Control', 'no-store');
    }

    /**
     * @return array{int, int}
     */
    private function pagination(Request $request): array
    {
        $page = max(1, (int) $request->query('page', 1));
        $perPage = (int) $request->query('perPage', 20);
        $perPage = $perPage < 1 ? 20 : min($perPage, self::MAX_PER_PAGE);

        return [$page, $perPage];
    }

    /**
     * @return array<string, mixed>
     */
    private function userPayload(object $row): array
    {
        return [
            'id' => (int) $row->id,
            'name' => (string) $row->name,
            'email' => (string) $row->email,
            'role' => (string) $row->role,
            'isAdmin' => (bool) $row->is_admin,
            'walletBalance' => (float) $row->wallet_balance,
            'aiCredits' => (int) $row->ai_credits,
            'vipTier' => $row->vip_tier,
            'vipExpiresAt' => $row->vip_expires_at,
            'createdAt' => (string) $row->created_at,
        ];
    }

    /**
     * Combines the internal-token + session guard, actor resolution, and
     * is_admin/role check into one call — every action on this controller
     * needs all three, so callers just get back a JsonResponse to short
     * circuit on, or null to proceed.
     */
    private function authorize(Request $request): ?JsonResponse
    {
        $guard = $this->guard($request);

        if ($guard !== null) {
            return $guard;
        }

        $sessionId = trim((string) $request->header('X-Zainex-Session-Id', ''));

        $this->linkAccountToUser(
            $sessionId,
            $request->header('X-Zainex-User-Email'),
        );

        $actor = $this->actor($sessionId);

        if ($actor === null) {
            return $this->error(
                404,
                'ADMIN_ACCOUNT_NOT_FOUND',
                'The active admin account was not found.',
            );
        }

        [, $user] = $actor;

        if (! $this->isAdmin($user)) {
            return $this->error(
                403,
                'ADMIN_PERMISSION_REQUIRED',
                'Root administrator permission is required.',
            );
        }

        return null;
    }

    private function guard(Request $request): ?JsonResponse
    {
        $expectedToken = trim((string) Config::get('intelibrain.internal_token', ''));
        $providedToken = trim((string) $request->header('X-Zainex-Internal-Token', ''));

        if (
            $expectedToken === '' ||
            $providedToken === '' ||
            ! hash_equals($expectedToken, $providedToken)
        ) {
            return $this->error(401, 'ADMIN_BACKEND_UNAUTHORIZED', 'The admin request is unauthorized.');
        }

        $sessionId = trim((string) $request->header('X-Zainex-Session-Id', ''));

        if (! Str::isUuid($sessionId)) {
            return $this->error(422, 'INVALID_ADMIN_SESSION', 'A valid ZAINEX session is required.');
        }

        return null;
    }

    /**
     * @return array{object, object}|null
     */
    private function actor(string $sessionId): ?array
    {
        $account = DB::table('trading_accounts')
            ->where('external_session_id', $sessionId)
            ->where('status', 'ACTIVE')
            ->first();

        if ($account === null || $account->user_id === null) {
            return null;
        }

        $user = DB::table('users')->where('id', $account->user_id)->first();

        if ($user === null) {
            return null;
        }

        return [$account, $user];
    }

    private function isAdmin(object $user): bool
    {
        return (bool) ($user->is_admin ?? false)
            && in_array((string) ($user->role ?? ''), ['ROOT', 'ADMIN'], true);
    }

    private function decimal(mixed $value): BigDecimal
    {
        return BigDecimal::of((string) $value)->toScale(8, RoundingMode::Down);
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
