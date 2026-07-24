<?php

declare(strict_types=1);

namespace App\Services\Vip;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

// ZAINEX_UNIFIED_BILLING_V1
// Shared by AdminController's direct "Grant VIP" admin action and the
// approved-subscription-cashin / crypto-subscription-confirmed paths.
// Extends vip_expires_at from "now" or from the current expiry
// (whichever is later) — stacking on top of unexpired time rather than
// resetting it.

final class VipGrantService
{
    private const ASSET = 'USDT';

    /**
     * @return array{status: int, payload: array<string, mixed>}
     */
    public function grant(
        string $targetEmail,
        string $planName,
        int $months,
        ?string $referenceKey = null,
    ): array {
        return DB::transaction(function () use ($targetEmail, $planName, $months, $referenceKey): array {
            $target = DB::table('users')
                ->whereRaw('LOWER(email) = ?', [strtolower(trim($targetEmail))])
                ->lockForUpdate()
                ->first();

            if ($target === null) {
                return [
                    'status' => 404,
                    'payload' => [
                        'ok' => false,
                        'error' => [
                            'code' => 'TARGET_USER_NOT_FOUND',
                            'message' => 'No user was found with that email.',
                        ],
                    ],
                ];
            }

            $currentExpiry = $target->vip_expires_at !== null
                ? Carbon::parse($target->vip_expires_at)
                : null;

            $base = ($currentExpiry !== null && $currentExpiry->isFuture())
                ? $currentExpiry
                : now();

            $expiresAt = $base->copy()->addMonths($months);
            $occurredAt = now();

            DB::table('users')
                ->where('id', $target->id)
                ->update([
                    'vip_tier' => $planName,
                    'vip_expires_at' => $expiresAt,
                    'updated_at' => $occurredAt,
                ]);

            $account = DB::table('trading_accounts')
                ->where('user_id', $target->id)
                ->where('account_type', 'PAPER')
                ->where('status', 'ACTIVE')
                ->first();

            $balance = $account !== null
                ? DB::table('trading_balances')
                    ->where('trading_account_id', $account->id)
                    ->where('asset', self::ASSET)
                    ->first()
                : null;

            if ($account !== null && $balance !== null) {
                DB::table('wallet_transactions')->insert([
                    'trading_account_id' => $account->id,
                    'user_id' => $target->id,
                    'strategy_activation_id' => null,
                    'event_type' => 'ADMIN_VIP_GRANT',
                    'direction' => 'CREDIT',
                    'asset' => 'VIP',
                    'amount' => '0.00000000',
                    'wallet_balance_before' => (string) $target->wallet_balance,
                    'wallet_balance_after' => (string) $target->wallet_balance,
                    'available_balance_before' => (string) $balance->available_balance,
                    'available_balance_after' => (string) $balance->available_balance,
                    'strategy_locked_before' => (string) ($balance->strategy_locked_balance ?? '0'),
                    'strategy_locked_after' => (string) ($balance->strategy_locked_balance ?? '0'),
                    'ai_credits_before' => (int) $target->ai_credits,
                    'ai_credits_after' => (int) $target->ai_credits,
                    'reference_key' => $referenceKey ?? 'vip-grant:manual:'.Str::uuid(),
                    'description' => "Granted {$planName} for {$months} month(s).",
                    'metadata' => json_encode([
                        'vipTier' => $planName,
                        'months' => $months,
                        'expiresAt' => (string) $expiresAt,
                    ], JSON_THROW_ON_ERROR),
                    'occurred_at' => $occurredAt,
                    'created_at' => $occurredAt,
                ]);
            }

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
    }
}
