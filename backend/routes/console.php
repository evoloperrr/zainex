<?php

use App\Services\Referral\StrategyReferralIncomeBackfillService;
use App\Services\Referral\StrategyReferralCreditReconciliationService;
use App\Services\Trading\Okx\ReconcileOkxOrdersService;
use App\Services\Trading\StrategyAccrualService;
use Brick\Math\BigDecimal;
use Brick\Math\RoundingMode;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schedule;
use Illuminate\Support\Str;

// ZAINEX_STRATEGY_DAILY_ACCRUAL_ENGINE_C1_V1

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Artisan::command(
    'strategy:reconcile-referral-credits',
    function (): int {
        $summary = app(
            StrategyReferralCreditReconciliationService::class,
        )->run();

        $this->line(
            json_encode(
                $summary,
                JSON_THROW_ON_ERROR |
                JSON_PRETTY_PRINT,
            ),
        );

        return 0;
    },
)->purpose(
    'Reverse legacy conversion rewards and credit activation-based referral credits.',
);

Artisan::command(
    'strategy:backfill-referral-income',
    function (): int {
        $summary = app(
            StrategyReferralIncomeBackfillService::class,
        )->run();

        $this->line(
            json_encode(
                $summary,
                JSON_THROW_ON_ERROR |
                JSON_PRETTY_PRINT,
            ),
        );

        return 0;
    },
)->purpose(
    'Credit missing direct-inviter income for previous strategy activations.',
);

Artisan::command(
    'strategy:accrue-due',
    function (): int {
        $summary = app(
            StrategyAccrualService::class,
        )->accrueDue();

        $this->line(
            json_encode(
                $summary,
                JSON_THROW_ON_ERROR |
                JSON_PRETTY_PRINT,
            ),
        );

        return 0;
    },
)->purpose(
    'Credit all due paper-strategy daily profits and release matured principals.',
);

Schedule::command(
    'strategy:accrue-due',
)
    ->everyMinute()
    ->withoutOverlapping();

// ZAINEX_LIVE_OKX_TRADING_V1
Artisan::command(
    'okx:reconcile-orders',
    function (): int {
        $summary = app(
            ReconcileOkxOrdersService::class,
        )->run();

        $this->line(
            json_encode(
                $summary,
                JSON_THROW_ON_ERROR |
                JSON_PRETTY_PRINT,
            ),
        );

        return 0;
    },
)->purpose(
    'Resolve live OKX futures orders stuck in SUBMITTING by checking their real state on OKX.',
);

Schedule::command(
    'okx:reconcile-orders',
)
    ->everyMinute()
    ->withoutOverlapping();

// ZAINEX_WALLET_ADMIN_CREDIT_ACTIVITY_V1
// One-off, interactive backfill for a single user whose past cash-in
// approval never wrote a wallet_transactions row (e.g. an old
// subscription cash-in approved back when it only called
// applyVipGrant(), which never touched wallet_balance at all). Mirrors
// AdminController::applyWalletCredit()'s exact accounting so the ledger
// stays internally consistent. Scoped to exactly one email per run,
// requires interactive confirmation, and is idempotent on
// --reference-key so re-running it after a mistake never double-credits.
Artisan::command(
    'zainex:backfill-admin-credit {email} {amount} {description} {--reference-key=}',
    function (string $email, string $amount, string $description): int {
        $email = strtolower(trim($email));
        $referenceKey = $this->option('reference-key') ?: 'backfill:'.Str::uuid();

        $target = DB::table('users')
            ->whereRaw('LOWER(email) = ?', [$email])
            ->first();

        if ($target === null) {
            $this->error("No user found with email {$email}.");

            return 1;
        }

        $account = DB::table('trading_accounts')
            ->where('user_id', $target->id)
            ->where('account_type', 'PAPER')
            ->where('status', 'ACTIVE')
            ->first();

        if ($account === null) {
            $this->error("No active PAPER trading account found for {$email}.");

            return 1;
        }

        $existing = DB::table('wallet_transactions')
            ->where('reference_key', $referenceKey)
            ->first();

        if ($existing !== null) {
            $this->warn(
                "A wallet_transactions row with reference_key '{$referenceKey}' already exists ".
                "(id {$existing->id}) — skipping to avoid a duplicate credit.",
            );

            return 0;
        }

        $amountDecimal = BigDecimal::of($amount)->toScale(8, RoundingMode::Down);

        $this->line("About to credit exactly one user ({$email}):");
        $this->line('  Amount: $'.(string) $amountDecimal);
        $this->line("  Description: {$description}");
        $this->line("  Reference key: {$referenceKey}");
        $this->line('  Nothing else (no other user, no other table) will be touched.');

        if (! $this->confirm('Proceed with this wallet credit?', false)) {
            $this->line('Aborted — no changes made.');

            return 0;
        }

        DB::transaction(function () use ($target, $account, $amountDecimal, $referenceKey, $description): void {
            $user = DB::table('users')->where('id', $target->id)->lockForUpdate()->first();
            $balance = DB::table('trading_balances')
                ->where('trading_account_id', $account->id)
                ->where('asset', 'USDT')
                ->lockForUpdate()
                ->first();

            $walletBefore = BigDecimal::of((string) $user->wallet_balance)->toScale(8, RoundingMode::Down);
            $walletAfter = $walletBefore->plus($amountDecimal)->toScale(8, RoundingMode::Down);
            $availableBefore = BigDecimal::of((string) $balance->available_balance)->toScale(8, RoundingMode::Down);
            $availableAfter = $availableBefore->plus($amountDecimal)->toScale(8, RoundingMode::Down);
            $strategyLocked = BigDecimal::of((string) ($balance->strategy_locked_balance ?? '0'))
                ->toScale(8, RoundingMode::Down);
            $occurredAt = now();

            DB::table('users')->where('id', $user->id)->update([
                'wallet_balance' => (string) $walletAfter,
                'updated_at' => $occurredAt,
            ]);

            DB::table('trading_balances')->where('id', $balance->id)->update([
                'available_balance' => (string) $availableAfter,
                'updated_at' => $occurredAt,
            ]);

            DB::table('wallet_transactions')->insert([
                'trading_account_id' => $account->id,
                'user_id' => $user->id,
                'strategy_activation_id' => null,
                'event_type' => 'ADMIN_MANUAL_CREDIT',
                'direction' => 'CREDIT',
                'asset' => 'USDT',
                'amount' => (string) $amountDecimal,
                'wallet_balance_before' => (string) $walletBefore,
                'wallet_balance_after' => (string) $walletAfter,
                'available_balance_before' => (string) $availableBefore,
                'available_balance_after' => (string) $availableAfter,
                'strategy_locked_before' => (string) $strategyLocked,
                'strategy_locked_after' => (string) $strategyLocked,
                'ai_credits_before' => (int) $user->ai_credits,
                'ai_credits_after' => (int) $user->ai_credits,
                'reference_key' => $referenceKey,
                'description' => $description,
                'metadata' => json_encode(['backfilled' => true], JSON_THROW_ON_ERROR),
                'occurred_at' => $occurredAt,
                'created_at' => $occurredAt,
            ]);
        }, 5);

        $this->info("Credited {$email} successfully. Wallet updated and logged in wallet_transactions.");

        return 0;
    },
)->purpose(
    'One-off backfill: credit exactly one user\'s wallet and log it, for cash-ins approved before ledger logging existed.',
);
