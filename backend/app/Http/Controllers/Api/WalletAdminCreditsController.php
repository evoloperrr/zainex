<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\LinksTradingAccountToUser;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

// ZAINEX_WALLET_ADMIN_CREDIT_ACTIVITY_V1
// Surfaces a user's own admin-driven wallet_transactions rows — written
// by AdminController::applyWalletCredit() (direct admin wallet credit or
// an approved merchant cash-in) and AdminController::applyVipGrant()
// (direct VIP grant or a cash-in-approved subscription) — so they show
// up in the user-facing wallet activity feed. That feed previously only
// combined WALLET_TO_CREDITS conversions and credit transfers, so an
// approved cash-in was invisible to the user even though it was already
// recorded in the admin-only Wallet ledger tab.

final class WalletAdminCreditsController extends Controller
{
    use LinksTradingAccountToUser;

    /** @var list<string> */
    private const EVENT_TYPES = ['ADMIN_MANUAL_CREDIT', 'ADMIN_VIP_GRANT'];

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

        return response()
            ->json([
                'ok' => true,
                'logs' => $this->logs((int) $account->id),
            ])
            ->header('Cache-Control', 'no-store');
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

    private function accountForSession(string $sessionId): ?object
    {
        return DB::table('trading_accounts')
            ->where('external_session_id', $sessionId)
            ->where('status', 'ACTIVE')
            ->first();
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function logs(int $accountId): array
    {
        return DB::table('wallet_transactions')
            ->where('trading_account_id', $accountId)
            ->whereIn('event_type', self::EVENT_TYPES)
            ->orderByDesc('occurred_at')
            ->orderByDesc('id')
            ->limit(10)
            ->get()
            ->map(function (object $row): array {
                $metadata = is_string($row->metadata)
                    ? (json_decode($row->metadata, true) ?: [])
                    : [];

                return [
                    'id' => (int) $row->id,
                    'eventType' => (string) $row->event_type,
                    'amountUsd' => (float) $row->amount,
                    'walletBalanceBefore' => (float) $row->wallet_balance_before,
                    'walletBalanceAfter' => (float) $row->wallet_balance_after,
                    'description' => $row->description,
                    'referenceKey' => $row->reference_key,
                    'occurredAt' => $row->occurred_at,
                    'vipTier' => $metadata['vipTier'] ?? null,
                    'vipMonths' => $metadata['months'] ?? null,
                    'vipExpiresAt' => $metadata['expiresAt'] ?? null,
                ];
            })
            ->values()
            ->all();
    }

    private function error(int $status, string $code, string $message): JsonResponse
    {
        return response()
            ->json([
                'ok' => false,
                'error' => [
                    'code' => $code,
                    'message' => $message,
                ],
            ], $status)
            ->header('Cache-Control', 'no-store');
    }
}
