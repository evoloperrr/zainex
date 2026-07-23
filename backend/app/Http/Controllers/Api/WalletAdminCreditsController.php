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
// Surfaces a user's own ADMIN_MANUAL_CREDIT wallet_transactions rows —
// written by AdminController::applyWalletCredit() for both a direct
// admin wallet credit and an approved merchant cash-in (GoTyme) — so
// they show up in the user-facing wallet activity feed. That feed
// previously only combined WALLET_TO_CREDITS conversions and credit
// transfers, so an approved cash-in was invisible to the user even
// though it was already recorded in the admin-only Wallet ledger tab.

final class WalletAdminCreditsController extends Controller
{
    use LinksTradingAccountToUser;

    private const EVENT_TYPE = 'ADMIN_MANUAL_CREDIT';

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
            ->where('event_type', self::EVENT_TYPE)
            ->orderByDesc('occurred_at')
            ->orderByDesc('id')
            ->limit(10)
            ->get()
            ->map(fn (object $row): array => [
                'id' => (int) $row->id,
                'amountUsd' => (float) $row->amount,
                'walletBalanceBefore' => (float) $row->wallet_balance_before,
                'walletBalanceAfter' => (float) $row->wallet_balance_after,
                'description' => $row->description,
                'referenceKey' => $row->reference_key,
                'occurredAt' => $row->occurred_at,
            ])
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
