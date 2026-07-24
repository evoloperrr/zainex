<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\LinksTradingAccountToUser;
use App\Http\Controllers\Controller;
use App\Services\Referral\CashinReferralIncomeService;
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

    /**
     * Read-only diagnostic: for a given user, shows their inviter, their
     * strategy activations, and whether the 10% direct-inviter referral
     * income was actually recorded for each one — for tracking down a
     * specific "the referral reward didn't arrive" report without needing
     * direct database access.
     */
    public function referralDiagnostics(Request $request): JsonResponse
    {
        $guard = $this->authorize($request);

        if ($guard !== null) {
            return $guard;
        }

        $email = trim((string) $request->query('email', ''));

        if ($email === '') {
            return $this->error(422, 'INVALID_DIAGNOSTICS_REQUEST', 'An email query parameter is required.');
        }

        $user = DB::table('users')
            ->whereRaw('LOWER(email) = ?', [strtolower($email)])
            ->first();

        if ($user === null) {
            return $this->error(404, 'USER_NOT_FOUND', 'No user was found with that email.');
        }

        $inviter = $user->inviter_id === null
            ? null
            : DB::table('users')->where('id', $user->inviter_id)->first(['id', 'email', 'name']);

        $activations = DB::table('strategy_activations')
            ->where('user_id', $user->id)
            ->orderByDesc('created_at')
            ->limit(20)
            ->get(['id', 'tier', 'allocated_amount', 'billing_cycle', 'status', 'created_at']);

        $activationRows = $activations->map(function (object $activation) use ($user): array {
            $referenceKey = $user->inviter_id === null
                ? null
                : sprintf('strategy:%d:direct-inviter:%d', $activation->id, (int) $user->inviter_id);

            $rewardTransaction = $referenceKey === null
                ? null
                : DB::table('wallet_transactions')
                    ->where('reference_key', $referenceKey)
                    ->first(['id', 'amount', 'occurred_at']);

            return [
                'activationId' => (int) $activation->id,
                'tier' => $activation->tier,
                'allocatedAmount' => (string) $activation->allocated_amount,
                'billingCycle' => $activation->billing_cycle,
                'status' => $activation->status,
                'createdAt' => (string) $activation->created_at,
                'referralRewardRecorded' => $rewardTransaction !== null,
                'referralRewardAmount' => $rewardTransaction === null ? null : (string) $rewardTransaction->amount,
                'referralRewardOccurredAt' => $rewardTransaction === null ? null : (string) $rewardTransaction->occurred_at,
            ];
        })->values()->all();

        return response()
            ->json([
                'ok' => true,
                'user' => [
                    'id' => (int) $user->id,
                    'email' => $user->email,
                    'inviterId' => $user->inviter_id === null ? null : (int) $user->inviter_id,
                ],
                'inviter' => $inviter === null
                    ? null
                    : [
                        'id' => (int) $inviter->id,
                        'email' => $inviter->email,
                        'name' => $inviter->name,
                    ],
                'strategyRewardRateBps' => (int) config('referral_rewards.strategy_trading_amount_rate_bps', 1000),
                'activations' => $activationRows,
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

    public function updateUserRole(Request $request): JsonResponse
    {
        [$guard, $actor] = $this->authorizeWithActor($request);

        if ($guard !== null) {
            return $guard;
        }

        $actorRole = (string) ($actor->role ?? '');

        if (! in_array($actorRole, ['ROOT', 'ADMIN'], true)) {
            return $this->error(403, 'ADMIN_PERMISSION_REQUIRED', 'Administrator permission is required.');
        }

        $validator = Validator::make($request->all(), [
            'targetEmail' => ['required', 'string', 'email:rfc', 'max:255'],
            'role' => ['required', 'string', 'in:USER,WORKER,ADMIN'],
        ]);

        if ($validator->fails()) {
            return $this->error(422, 'INVALID_ROLE_UPDATE_REQUEST', $validator->errors()->first());
        }

        $validated = $validator->validated();
        $targetEmail = strtolower(trim((string) $validated['targetEmail']));
        $role = (string) $validated['role'];

        // Only ROOT may grant or revoke the ADMIN tier itself. A plain ADMIN
        // may only assign WORKER access or demote back to USER.
        if ($role === 'ADMIN' && $actorRole !== 'ROOT') {
            return $this->error(403, 'ROOT_PERMISSION_REQUIRED', 'Only a ROOT administrator can grant admin access.');
        }

        $target = DB::table('users')
            ->whereRaw('LOWER(email) = ?', [$targetEmail])
            ->first();

        if ($target === null) {
            return $this->error(404, 'TARGET_USER_NOT_FOUND', 'No user was found with that email.');
        }

        if ((string) ($target->role ?? '') === 'ROOT') {
            return $this->error(422, 'CANNOT_CHANGE_ROOT', 'The ROOT account cannot be changed here.');
        }

        if (
            $targetEmail === strtolower(trim((string) $actor->email)) &&
            $role === 'USER'
        ) {
            return $this->error(422, 'CANNOT_SELF_DEMOTE', 'You cannot remove your own admin access.');
        }

        DB::table('users')
            ->where('id', $target->id)
            ->update([
                'is_admin' => $role !== 'USER',
                'role' => $role,
                'updated_at' => now(),
            ]);

        return response()
            ->json([
                'ok' => true,
                'user' => [
                    'id' => (int) $target->id,
                    'email' => (string) $target->email,
                    'name' => (string) ($target->name ?? ''),
                    'role' => $role,
                    'isAdmin' => $role !== 'USER',
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
            $result = $this->applyVipGrant($targetEmail, $planName, $months);

            return response()
                ->json($result['payload'], $result['status'])
                ->header('Cache-Control', 'no-store');
        } catch (Throwable $exception) {
            report($exception);

            return $this->error(500, 'VIP_GRANT_FAILED', 'The VIP grant could not be completed.');
        }
    }

    /**
     * @return array{status: int, payload: array<string, mixed>}
     */
    private function applyVipGrant(
        string $targetEmail,
        string $planName,
        int $months,
        ?string $referenceKey = null,
    ): array {
        return app(\App\Services\Vip\VipGrantService::class)->grant(
            $targetEmail,
            $planName,
            $months,
            $referenceKey,
        );
    }

    /**
     * @param  callable(int): string  $referenceKeyFor  Builds the idempotency
     *                                                    reference key from the
     *                                                    resolved trading_account_id
     *                                                    — callers key it differently
     *                                                    (a clientRequestId for the
     *                                                    manual admin action vs. a
     *                                                    merchant_cashins row id).
     * @return array{status: int, payload: array<string, mixed>}
     */
    private function applyWalletCredit(
        string $targetEmail,
        string $amount,
        callable $referenceKeyFor,
        string $description,
    ): array {
        return DB::transaction(function () use ($targetEmail, $amount, $referenceKeyFor, $description): array {
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
                ->where('account_type', 'PAPER')
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

            $referenceKey = $referenceKeyFor((int) $account->id);

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

            $amountDecimal = $this->decimal($amount);
            $walletBefore = $this->decimal($target->wallet_balance);
            $walletAfter = $walletBefore->plus($amountDecimal)->toScale(8, RoundingMode::Down);

            $availableBefore = $this->decimal($balance->available_balance);
            $availableAfter = $availableBefore->plus($amountDecimal)->toScale(8, RoundingMode::Down);

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
                'amount' => (string) $amountDecimal,
                'wallet_balance_before' => (string) $walletBefore,
                'wallet_balance_after' => (string) $walletAfter,
                'available_balance_before' => (string) $availableBefore,
                'available_balance_after' => (string) $availableAfter,
                'strategy_locked_before' => (string) $strategyLocked,
                'strategy_locked_after' => (string) $strategyLocked,
                'ai_credits_before' => (int) $target->ai_credits,
                'ai_credits_after' => (int) $target->ai_credits,
                'reference_key' => $referenceKey,
                'description' => $description,
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
        $amount = (string) $validated['amount'];
        $clientRequestId = strtolower(trim((string) $validated['clientRequestId']));
        $note = trim((string) ($validated['note'] ?? ''));

        try {
            $result = $this->applyWalletCredit(
                $targetEmail,
                $amount,
                fn (int $accountId): string => 'admin-manual-credit:'.$accountId.':'.$clientRequestId,
                $note !== '' ? $note : 'Manual admin wallet credit.',
            );

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
                'cp.wallet_top_up_amount',
                'cp.billing_cycle',
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
                'walletTopUpAmount' => (float) ($row->wallet_top_up_amount ?? 0),
                'billingCycle' => (string) ($row->billing_cycle ?? 'monthly'),
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

    public function merchantCashins(Request $request): JsonResponse
    {
        $guard = $this->authorize($request);

        if ($guard !== null) {
            return $guard;
        }

        [$page, $perPage] = $this->pagination($request);

        $status = trim((string) $request->query('status', ''));

        $query = DB::table('merchant_cashins as mc')
            ->leftJoin('users as u', 'u.id', '=', 'mc.user_id')
            ->leftJoin('users as reviewer', 'reviewer.id', '=', 'mc.reviewed_by')
            ->select(
                'mc.id',
                'mc.purpose',
                'mc.plan_name',
                'mc.amount',
                'mc.wallet_top_up_amount',
                'mc.billing_cycle',
                'mc.proof_image',
                'mc.status',
                'mc.admin_note',
                'mc.reviewed_at',
                'mc.created_at',
                'u.email as user_email',
                'reviewer.email as reviewer_email',
            );

        if ($status !== '') {
            $query->where('mc.status', $status);
        }

        $total = (clone $query)->count();

        $rows = $query
            ->orderByDesc('mc.created_at')
            ->forPage($page, $perPage)
            ->get()
            ->map(fn (object $row): array => [
                'id' => (int) $row->id,
                'userEmail' => $row->user_email,
                'purpose' => (string) $row->purpose,
                'planName' => $row->plan_name,
                'amount' => (float) $row->amount,
                'walletTopUpAmount' => (float) ($row->wallet_top_up_amount ?? 0),
                'billingCycle' => (string) ($row->billing_cycle ?? 'monthly'),
                'hasProofImage' => $row->proof_image !== null,
                'proofImage' => $row->proof_image,
                'status' => (string) $row->status,
                'adminNote' => $row->admin_note,
                'reviewerEmail' => $row->reviewer_email,
                'reviewedAt' => $row->reviewed_at,
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
                'cashins' => $rows,
            ])
            ->header('Cache-Control', 'no-store');
    }

    public function approveMerchantCashin(Request $request, string $id): JsonResponse
    {
        [$guard, $admin] = $this->authorizeWithActor($request);

        if ($guard !== null) {
            return $guard;
        }

        $cashin = DB::table('merchant_cashins')->where('id', (int) $id)->first();

        if ($cashin === null) {
            return $this->error(404, 'MERCHANT_CASHIN_NOT_FOUND', 'That cash-in submission was not found.');
        }

        if ($cashin->status !== 'pending') {
            return $this->error(
                409,
                'MERCHANT_CASHIN_ALREADY_REVIEWED',
                'That cash-in submission was already reviewed.',
            );
        }

        if ($cashin->user_id === null) {
            return $this->error(
                409,
                'MERCHANT_CASHIN_USER_NOT_LINKED',
                'That cash-in submission has no linked user.',
            );
        }

        $targetUser = DB::table('users')->where('id', $cashin->user_id)->first();

        if ($targetUser === null) {
            return $this->error(404, 'TARGET_USER_NOT_FOUND', 'No user was found for that submission.');
        }

        $targetEmail = strtolower((string) $targetUser->email);

        try {
            if ($cashin->purpose === 'subscription') {
                return $this->approveSubscriptionCashin($cashin, $admin, $targetEmail, (int) $targetUser->id);
            }

            $result = $this->applyWalletCredit(
                $targetEmail,
                (string) $cashin->amount,
                fn (int $accountId): string => 'merchant-cashin:'.$cashin->id,
                'Approved GoTyme merchant cash-in #'.$cashin->id,
            );

            if ($result['status'] >= 400) {
                return response()
                    ->json($result['payload'], $result['status'])
                    ->header('Cache-Control', 'no-store');
            }

            DB::table('merchant_cashins')
                ->where('id', $cashin->id)
                ->update([
                    'status' => 'approved',
                    'reviewed_by' => $admin?->id,
                    'reviewed_at' => now(),
                    'updated_at' => now(),
                ]);

            return response()
                ->json($result['payload'], $result['status'])
                ->header('Cache-Control', 'no-store');
        } catch (Throwable $exception) {
            report($exception);

            return $this->error(500, 'MERCHANT_CASHIN_APPROVE_FAILED', 'The cash-in could not be approved.');
        }
    }

    /**
     * A "subscription" cash-in bundles a VIP plan with an optional extra
     * wallet top-up amount, all in one approved payment (see
     * MerchantCashinController::store()). Approving it in one click now:
     *   1. Grants the VIP tier directly (this is the one deliberate,
     *      admin-driven exception to "VIP is only ganap via strategy
     *      activation" — the strategies page still governs repeat
     *      activation and its own referral income, untouched).
     *   2. Credits the wallet with only the top-up portion, not the
     *      subscription price itself.
     *   3. Pays the direct inviter 10% of the top-up portion (same
     *      mechanism/rate as strategy-activation referral income).
     *   4. Pays the 3-level unilevel referral (25%/15%/5%) on the
     *      subscription price portion via the existing generic
     *      ReferralRewardService, under the SUBSCRIPTION_PURCHASE source
     *      type it was already whitelisted for but never used.
     */
    private function approveSubscriptionCashin(
        object $cashin,
        ?object $admin,
        string $targetEmail,
        int $targetUserId,
    ): JsonResponse {
        $walletTopUpAmount = round((float) ($cashin->wallet_top_up_amount ?? 0), 2);
        $subscriptionAmount = round(((float) $cashin->amount) - $walletTopUpAmount, 2);
        $cleanTierName = trim(str_replace('(Annual)', '', (string) $cashin->plan_name));
        $months = ((string) ($cashin->billing_cycle ?? 'monthly')) === 'annual' ? 12 : 1;

        $vipResult = $this->applyVipGrant(
            $targetEmail,
            $cleanTierName,
            $months,
            'merchant-cashin-vip:'.$cashin->id,
        );

        if ($vipResult['status'] >= 400) {
            return response()
                ->json($vipResult['payload'], $vipResult['status'])
                ->header('Cache-Control', 'no-store');
        }

        $walletResult = null;

        if ($walletTopUpAmount > 0) {
            $walletResult = $this->applyWalletCredit(
                $targetEmail,
                (string) $walletTopUpAmount,
                fn (int $accountId): string => 'merchant-cashin-topup:'.$cashin->id,
                sprintf(
                    'Wallet top-up bundled with GoTyme merchant cash-in #%d (%s plan).',
                    $cashin->id,
                    $cleanTierName,
                ),
            );

            if ($walletResult['status'] >= 400) {
                return response()
                    ->json($walletResult['payload'], $walletResult['status'])
                    ->header('Cache-Control', 'no-store');
            }

            app(CashinReferralIncomeService::class)->credit(
                $targetUserId,
                'merchant-cashin',
                (int) $cashin->id,
                $walletTopUpAmount,
            );
        }

        if ($subscriptionAmount > 0) {
            app(ReferralRewardService::class)->distribute(
                $targetUserId,
                'SUBSCRIPTION_PURCHASE',
                'merchant-cashin:'.$cashin->id,
                $subscriptionAmount,
            );
        }

        DB::table('merchant_cashins')
            ->where('id', $cashin->id)
            ->update([
                'status' => 'approved',
                'reviewed_by' => $admin?->id,
                'reviewed_at' => now(),
                'updated_at' => now(),
            ]);

        return response()
            ->json([
                'ok' => true,
                'vip' => $vipResult['payload'],
                'walletCredit' => $walletResult['payload'] ?? null,
            ])
            ->header('Cache-Control', 'no-store');
    }

    public function rejectMerchantCashin(Request $request, string $id): JsonResponse
    {
        [$guard, $admin] = $this->authorizeWithActor($request);

        if ($guard !== null) {
            return $guard;
        }

        $validator = Validator::make($request->all(), [
            'note' => ['nullable', 'string', 'max:255'],
        ]);

        if ($validator->fails()) {
            return $this->error(422, 'INVALID_REJECT_REQUEST', $validator->errors()->first());
        }

        $note = trim((string) ($validator->validated()['note'] ?? ''));

        $cashin = DB::table('merchant_cashins')->where('id', (int) $id)->first();

        if ($cashin === null) {
            return $this->error(404, 'MERCHANT_CASHIN_NOT_FOUND', 'That cash-in submission was not found.');
        }

        if ($cashin->status !== 'pending') {
            return $this->error(
                409,
                'MERCHANT_CASHIN_ALREADY_REVIEWED',
                'That cash-in submission was already reviewed.',
            );
        }

        DB::table('merchant_cashins')
            ->where('id', $cashin->id)
            ->update([
                'status' => 'rejected',
                'admin_note' => $note !== '' ? $note : null,
                'reviewed_by' => $admin?->id,
                'reviewed_at' => now(),
                'updated_at' => now(),
            ]);

        return response()
            ->json(['ok' => true])
            ->header('Cache-Control', 'no-store');
    }

    public function cashoutRequests(Request $request): JsonResponse
    {
        $guard = $this->authorize($request);

        if ($guard !== null) {
            return $guard;
        }

        [$page, $perPage] = $this->pagination($request);

        $status = trim((string) $request->query('status', ''));

        $query = DB::table('cashout_requests as cr')
            ->leftJoin('users as u', 'u.id', '=', 'cr.user_id')
            ->leftJoin('users as reviewer', 'reviewer.id', '=', 'cr.reviewed_by')
            ->select(
                'cr.id',
                'cr.amount',
                'cr.destination_note',
                'cr.status',
                'cr.admin_note',
                'cr.reviewed_at',
                'cr.created_at',
                'u.email as user_email',
                'reviewer.email as reviewer_email',
            );

        if ($status !== '') {
            $query->where('cr.status', $status);
        }

        $total = (clone $query)->count();

        $rows = $query
            ->orderByDesc('cr.created_at')
            ->forPage($page, $perPage)
            ->get()
            ->map(fn (object $row): array => [
                'id' => (int) $row->id,
                'userEmail' => $row->user_email,
                'amount' => (float) $row->amount,
                'destinationNote' => $row->destination_note,
                'status' => (string) $row->status,
                'adminNote' => $row->admin_note,
                'reviewerEmail' => $row->reviewer_email,
                'reviewedAt' => $row->reviewed_at,
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
                'cashouts' => $rows,
            ])
            ->header('Cache-Control', 'no-store');
    }

    public function approveCashoutRequest(Request $request, string $id): JsonResponse
    {
        [$guard, $admin] = $this->authorizeWithActor($request);

        if ($guard !== null) {
            return $guard;
        }

        $validator = Validator::make($request->all(), [
            'note' => ['nullable', 'string', 'max:255'],
        ]);

        if ($validator->fails()) {
            return $this->error(422, 'INVALID_APPROVE_REQUEST', $validator->errors()->first());
        }

        $note = trim((string) ($validator->validated()['note'] ?? ''));

        try {
            $result = DB::transaction(function () use ($id, $admin, $note): array {
                $cashout = DB::table('cashout_requests')
                    ->where('id', (int) $id)
                    ->lockForUpdate()
                    ->first();

                if ($cashout === null) {
                    return [
                        'status' => 404,
                        'payload' => $this->errorPayload(
                            'CASHOUT_REQUEST_NOT_FOUND',
                            'That cashout request was not found.',
                        ),
                    ];
                }

                if ($cashout->status !== 'pending') {
                    return [
                        'status' => 409,
                        'payload' => $this->errorPayload(
                            'CASHOUT_REQUEST_ALREADY_REVIEWED',
                            'That cashout request was already reviewed.',
                        ),
                    ];
                }

                if ($cashout->trading_account_id === null || $cashout->user_id === null) {
                    return [
                        'status' => 409,
                        'payload' => $this->errorPayload(
                            'CASHOUT_REQUEST_NOT_LINKED',
                            'That cashout request has no linked account.',
                        ),
                    ];
                }

                $user = DB::table('users')
                    ->where('id', $cashout->user_id)
                    ->lockForUpdate()
                    ->first();

                $balance = DB::table('trading_balances')
                    ->where('trading_account_id', $cashout->trading_account_id)
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

                $amount = $this->decimal($cashout->amount);
                $walletBefore = $this->decimal($user->wallet_balance);
                $walletAfter = $walletBefore->minus($amount)->toScale(8, RoundingMode::Down);

                $available = $this->decimal($balance->available_balance);
                $cashoutLocked = $this->decimal($balance->cashout_locked_balance);
                $newCashoutLocked = $cashoutLocked->minus($amount)->toScale(8, RoundingMode::Down);

                if ($newCashoutLocked->isLessThan(BigDecimal::of('0'))) {
                    $newCashoutLocked = $this->decimal('0');
                }

                $occurredAt = now();

                DB::table('users')
                    ->where('id', $user->id)
                    ->update([
                        'wallet_balance' => (string) $walletAfter,
                        'updated_at' => $occurredAt,
                    ]);

                DB::table('trading_balances')
                    ->where('id', $balance->id)
                    ->update([
                        'cashout_locked_balance' => (string) $newCashoutLocked,
                        'updated_at' => $occurredAt,
                    ]);

                DB::table('cashout_requests')
                    ->where('id', $cashout->id)
                    ->update([
                        'status' => 'approved',
                        'admin_note' => $note !== '' ? $note : null,
                        'reviewed_by' => $admin?->id,
                        'reviewed_at' => $occurredAt,
                        'updated_at' => $occurredAt,
                    ]);

                DB::table('wallet_transactions')->insert([
                    'trading_account_id' => $cashout->trading_account_id,
                    'user_id' => $user->id,
                    'strategy_activation_id' => null,
                    'event_type' => 'CASHOUT_APPROVED',
                    'direction' => 'DEBIT',
                    'asset' => self::ASSET,
                    'amount' => (string) $amount,
                    'wallet_balance_before' => (string) $walletBefore,
                    'wallet_balance_after' => (string) $walletAfter,
                    'available_balance_before' => (string) $available,
                    'available_balance_after' => (string) $available,
                    'strategy_locked_before' => (string) $balance->strategy_locked_balance,
                    'strategy_locked_after' => (string) $balance->strategy_locked_balance,
                    'ai_credits_before' => (int) $user->ai_credits,
                    'ai_credits_after' => (int) $user->ai_credits,
                    'reference_key' => 'cashout-approved:'.$cashout->id,
                    'description' => 'Cashout approved #'.$cashout->id.' — sent outside ZAINEX manually.',
                    'metadata' => json_encode([
                        'cashoutRequestId' => $cashout->id,
                        'destinationNote' => $cashout->destination_note,
                    ], JSON_THROW_ON_ERROR),
                    'occurred_at' => $occurredAt,
                    'created_at' => $occurredAt,
                ]);

                return [
                    'status' => 200,
                    'payload' => ['ok' => true],
                ];
            }, 5);

            return response()
                ->json($result['payload'], $result['status'])
                ->header('Cache-Control', 'no-store');
        } catch (Throwable $exception) {
            report($exception);

            return $this->error(500, 'CASHOUT_APPROVE_FAILED', 'The cashout could not be approved.');
        }
    }

    public function rejectCashoutRequest(Request $request, string $id): JsonResponse
    {
        [$guard, $admin] = $this->authorizeWithActor($request);

        if ($guard !== null) {
            return $guard;
        }

        $validator = Validator::make($request->all(), [
            'note' => ['nullable', 'string', 'max:255'],
        ]);

        if ($validator->fails()) {
            return $this->error(422, 'INVALID_REJECT_REQUEST', $validator->errors()->first());
        }

        $note = trim((string) ($validator->validated()['note'] ?? ''));

        try {
            $result = DB::transaction(function () use ($id, $admin, $note): array {
                $cashout = DB::table('cashout_requests')
                    ->where('id', (int) $id)
                    ->lockForUpdate()
                    ->first();

                if ($cashout === null) {
                    return [
                        'status' => 404,
                        'payload' => $this->errorPayload(
                            'CASHOUT_REQUEST_NOT_FOUND',
                            'That cashout request was not found.',
                        ),
                    ];
                }

                if ($cashout->status !== 'pending') {
                    return [
                        'status' => 409,
                        'payload' => $this->errorPayload(
                            'CASHOUT_REQUEST_ALREADY_REVIEWED',
                            'That cashout request was already reviewed.',
                        ),
                    ];
                }

                if ($cashout->trading_account_id === null) {
                    DB::table('cashout_requests')
                        ->where('id', $cashout->id)
                        ->update([
                            'status' => 'rejected',
                            'admin_note' => $note !== '' ? $note : null,
                            'reviewed_by' => $admin?->id,
                            'reviewed_at' => now(),
                            'updated_at' => now(),
                        ]);

                    return ['status' => 200, 'payload' => ['ok' => true]];
                }

                $balance = DB::table('trading_balances')
                    ->where('trading_account_id', $cashout->trading_account_id)
                    ->where('asset', self::ASSET)
                    ->lockForUpdate()
                    ->first();

                if ($balance === null) {
                    return [
                        'status' => 409,
                        'payload' => $this->errorPayload(
                            'WALLET_STATE_NOT_AVAILABLE',
                            'The linked wallet state is unavailable.',
                        ),
                    ];
                }

                $amount = $this->decimal($cashout->amount);
                $available = $this->decimal($balance->available_balance);
                $newAvailable = $available->plus($amount)->toScale(8, RoundingMode::Down);

                $cashoutLocked = $this->decimal($balance->cashout_locked_balance);
                $newCashoutLocked = $cashoutLocked->minus($amount)->toScale(8, RoundingMode::Down);

                if ($newCashoutLocked->isLessThan(BigDecimal::of('0'))) {
                    $newCashoutLocked = $this->decimal('0');
                }

                $occurredAt = now();

                DB::table('trading_balances')
                    ->where('id', $balance->id)
                    ->update([
                        'available_balance' => (string) $newAvailable,
                        'cashout_locked_balance' => (string) $newCashoutLocked,
                        'updated_at' => $occurredAt,
                    ]);

                DB::table('cashout_requests')
                    ->where('id', $cashout->id)
                    ->update([
                        'status' => 'rejected',
                        'admin_note' => $note !== '' ? $note : null,
                        'reviewed_by' => $admin?->id,
                        'reviewed_at' => $occurredAt,
                        'updated_at' => $occurredAt,
                    ]);

                if ($cashout->user_id !== null) {
                    $user = DB::table('users')->where('id', $cashout->user_id)->first();

                    DB::table('wallet_transactions')->insert([
                        'trading_account_id' => $cashout->trading_account_id,
                        'user_id' => $cashout->user_id,
                        'strategy_activation_id' => null,
                        'event_type' => 'CASHOUT_REJECTED',
                        'direction' => 'UNLOCK',
                        'asset' => self::ASSET,
                        'amount' => (string) $amount,
                        'wallet_balance_before' => (string) $user->wallet_balance,
                        'wallet_balance_after' => (string) $user->wallet_balance,
                        'available_balance_before' => (string) $available,
                        'available_balance_after' => (string) $newAvailable,
                        'strategy_locked_before' => (string) $balance->strategy_locked_balance,
                        'strategy_locked_after' => (string) $balance->strategy_locked_balance,
                        'ai_credits_before' => (int) $user->ai_credits,
                        'ai_credits_after' => (int) $user->ai_credits,
                        'reference_key' => 'cashout-rejected:'.$cashout->id,
                        'description' => $note !== ''
                            ? 'Cashout request rejected — '.$note
                            : 'Cashout request rejected — funds released back to available balance.',
                        'metadata' => json_encode([
                            'cashoutRequestId' => $cashout->id,
                        ], JSON_THROW_ON_ERROR),
                        'occurred_at' => $occurredAt,
                        'created_at' => $occurredAt,
                    ]);
                }

                return ['status' => 200, 'payload' => ['ok' => true]];
            }, 5);

            return response()
                ->json($result['payload'], $result['status'])
                ->header('Cache-Control', 'no-store');
        } catch (Throwable $exception) {
            report($exception);

            return $this->error(500, 'CASHOUT_REJECT_FAILED', 'The cashout could not be rejected.');
        }
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
        [$guard] = $this->authorizeWithActor($request);

        return $guard;
    }

    /**
     * @return array{0: ?JsonResponse, 1: ?object}
     */
    private function authorizeWithActor(Request $request): array
    {
        $guard = $this->guard($request);

        if ($guard !== null) {
            return [$guard, null];
        }

        $sessionId = trim((string) $request->header('X-Zainex-Session-Id', ''));

        $this->linkAccountToUser(
            $sessionId,
            $request->header('X-Zainex-User-Email'),
        );

        $actor = $this->actor($sessionId);

        if ($actor === null) {
            return [
                $this->error(
                    404,
                    'ADMIN_ACCOUNT_NOT_FOUND',
                    'The active admin account was not found.',
                ),
                null,
            ];
        }

        [, $user] = $actor;

        if (! $this->isAdmin($user)) {
            return [
                $this->error(
                    403,
                    'ADMIN_PERMISSION_REQUIRED',
                    'Root administrator permission is required.',
                ),
                null,
            ];
        }

        return [null, $user];
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
