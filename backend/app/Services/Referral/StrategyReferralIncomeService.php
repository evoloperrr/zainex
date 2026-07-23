<?php

declare(strict_types=1);

namespace App\Services\Referral;

use Brick\Math\BigDecimal;
use Brick\Math\RoundingMode;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

// ZAINEX_STRATEGY_DIRECT_INVITER_INCOME_V1

final class StrategyReferralIncomeService
{
    /**
     * Credits the direct inviter once for a strategy activation.
     *
     * @return array<string, mixed>|null
     */
    public function credit(
        int $sourceUserId,
        int $strategyActivationId,
        string|int|float $tradingAmount,
        ?CarbonInterface $occurredAt = null,
    ): ?array {
        $baseAmount = BigDecimal::of((string) $tradingAmount)
            ->toScale(8, RoundingMode::Down);

        if ($baseAmount->isLessThanOrEqualTo(0)) {
            return null;
        }

        $rateBps = max(
            0,
            (int) config(
                'referral_rewards.strategy_trading_amount_rate_bps',
                1000,
            ),
        );

        if ($rateBps === 0) {
            return null;
        }

        $sourceUser = DB::table('users')
            ->where('id', $sourceUserId)
            ->first(['id', 'inviter_id']);

        if (
            $sourceUser === null ||
            $sourceUser->inviter_id === null ||
            (int) $sourceUser->inviter_id === $sourceUserId
        ) {
            return null;
        }

        $inviterId = (int) $sourceUser->inviter_id;
        $referenceKey = sprintf(
            'strategy:%d:direct-inviter:%d',
            $strategyActivationId,
            $inviterId,
        );
        $timestamp = $occurredAt ?? now();

        $existing = DB::table('wallet_transactions')
            ->where('reference_key', $referenceKey)
            ->first();

        if ($existing !== null) {
            return $this->resource($existing, true);
        }

        $inviter = DB::table('users')
            ->where('id', $inviterId)
            ->lockForUpdate()
            ->first();

        if ($inviter === null) {
            return null;
        }

        $account = DB::table('trading_accounts')
            ->where('user_id', $inviterId)
            ->where('account_type', 'PAPER')
            ->where('status', 'ACTIVE')
            ->orderBy('id')
            ->lockForUpdate()
            ->first();

        if ($account === null) {
            $accountId = DB::table('trading_accounts')->insertGetId([
                'user_id' => $inviterId,
                'external_session_id' => (string) Str::uuid(),
                'account_type' => 'PAPER',
                'mode' => 'UNIFIED_PAPER',
                'base_asset' => 'USDT',
                'status' => 'ACTIVE',
                'starting_balance' => '0.00000000',
                'created_at' => $timestamp,
                'updated_at' => $timestamp,
            ]);

            DB::table('trading_balances')->insert([
                'trading_account_id' => $accountId,
                'asset' => 'USDT',
                'available_balance' => '0.00000000',
                'locked_balance' => '0.00000000',
                'realized_pnl' => '0.00000000',
                'strategy_locked_balance' => '0.00000000',
                'created_at' => $timestamp,
                'updated_at' => $timestamp,
            ]);

            $account = DB::table('trading_accounts')
                ->where('id', $accountId)
                ->firstOrFail();
        }

        $balance = DB::table('trading_balances')
            ->where('trading_account_id', $account->id)
            ->where('asset', $account->base_asset)
            ->lockForUpdate()
            ->first();

        if ($balance === null) {
            $balanceId = DB::table('trading_balances')->insertGetId([
                'trading_account_id' => $account->id,
                'asset' => $account->base_asset,
                'available_balance' => '0.00000000',
                'locked_balance' => '0.00000000',
                'realized_pnl' => '0.00000000',
                'strategy_locked_balance' => '0.00000000',
                'created_at' => $timestamp,
                'updated_at' => $timestamp,
            ]);

            $balance = DB::table('trading_balances')
                ->where('id', $balanceId)
                ->firstOrFail();
        }

        $income = $baseAmount
            ->multipliedBy($rateBps)
            ->dividedBy(10_000, 8, RoundingMode::Down);

        $walletBefore = BigDecimal::of((string) $inviter->wallet_balance)
            ->toScale(8, RoundingMode::Down);
        $walletAfter = $walletBefore
            ->plus($income)
            ->toScale(8, RoundingMode::Down);
        $availableBefore = BigDecimal::of((string) $balance->available_balance)
            ->toScale(8, RoundingMode::Down);
        $availableAfter = $availableBefore
            ->plus($income)
            ->toScale(8, RoundingMode::Down);
        $strategyLocked = BigDecimal::of(
            (string) $balance->strategy_locked_balance,
        )->toScale(8, RoundingMode::Down);

        DB::table('users')
            ->where('id', $inviterId)
            ->update([
                'wallet_balance' => (string) $walletAfter,
                'updated_at' => $timestamp,
            ]);

        DB::table('trading_balances')
            ->where('id', $balance->id)
            ->update([
                'available_balance' => (string) $availableAfter,
                'updated_at' => $timestamp,
            ]);

        $transactionId = DB::table('wallet_transactions')->insertGetId([
            'trading_account_id' => $account->id,
            'user_id' => $inviterId,
            'strategy_activation_id' => $strategyActivationId,
            'event_type' => 'STRATEGY_REFERRAL_INCOME',
            'direction' => 'CREDIT',
            'asset' => $account->base_asset,
            'amount' => (string) $income,
            'wallet_balance_before' => (string) $walletBefore,
            'wallet_balance_after' => (string) $walletAfter,
            'available_balance_before' => (string) $availableBefore,
            'available_balance_after' => (string) $availableAfter,
            'strategy_locked_before' => (string) $strategyLocked,
            'strategy_locked_after' => (string) $strategyLocked,
            'ai_credits_before' => (int) $inviter->ai_credits,
            'ai_credits_after' => (int) $inviter->ai_credits,
            'reference_key' => $referenceKey,
            'description' => 'Direct inviter income credited from a referral strategy activation.',
            'metadata' => json_encode([
                'paper' => true,
                'sourceUserId' => $sourceUserId,
                'strategyActivationId' => $strategyActivationId,
                'level' => 1,
                'rateBps' => $rateBps,
                'percentage' => $rateBps / 100,
                'tradingAmount' => (string) $baseAmount,
            ], JSON_THROW_ON_ERROR),
            'occurred_at' => $timestamp,
            'created_at' => $timestamp,
        ]);

        return $this->resource(
            DB::table('wallet_transactions')
                ->where('id', $transactionId)
                ->firstOrFail(),
            false,
        );
    }

    /**
     * @return array<string, mixed>
     */
    private function resource(object $row, bool $idempotentReplay): array
    {
        return [
            'transactionId' => (int) $row->id,
            'inviterUserId' => (int) $row->user_id,
            'strategyActivationId' => (int) $row->strategy_activation_id,
            'amount' => (float) $row->amount,
            'walletBalanceAfter' => (float) $row->wallet_balance_after,
            'availableBalanceAfter' => (float) $row->available_balance_after,
            'idempotentReplay' => $idempotentReplay,
        ];
    }
}
