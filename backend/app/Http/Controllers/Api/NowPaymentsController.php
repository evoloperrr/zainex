<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\LinksTradingAccountToUser;
use App\Http\Controllers\Controller;
use App\Services\Payments\NowPaymentsService;
use Brick\Math\BigDecimal;
use Brick\Math\RoundingMode;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Throwable;

// ZAINEX_NOWPAYMENTS_CONTROLLER_V1
// Automated USDT crypto checkout via NOWPayments. Two guarded endpoints
// (invoice creation + status polling) mirror the auth/account-resolution
// pattern used by the other wallet controllers; the IPN webhook is public
// (NOWPayments calls it directly) and is authenticated by HMAC signature
// instead of the internal token.

final class NowPaymentsController extends Controller
{
    use LinksTradingAccountToUser;

    /**
     * Canonical USD prices. Never trust a client-supplied amount for a
     * subscription purchase — only the amount looked up here is sent to
     * NOWPayments, so a tampered request can't buy VIP 3 for a cent.
     *
     * @var array<string, float>
     */
    private const SUBSCRIPTION_PRICES_USD = [
        'VIP 1' => 5.0,
        'VIP 2' => 15.0,
        'VIP 3' => 45.0,
    ];

    // Annual billing pays for 12 months up front at a 10% discount off
    // 12x the monthly price.
    private const ANNUAL_DISCOUNT_RATE = 0.10;

    private const MIN_WALLET_FUNDING_USD = 1.0;

    private const MAX_WALLET_FUNDING_USD = 10_000.0;

    public function store(Request $request): JsonResponse
    {
        $guard = $this->guard($request);

        if ($guard !== null) {
            return $guard;
        }

        $service = $this->service();

        if ($service === null) {
            return $this->error(
                503,
                'NOWPAYMENTS_NOT_CONFIGURED',
                'Crypto payments are not configured yet.',
            );
        }

        $validator = Validator::make($request->all(), [
            'purpose' => ['required', 'string', 'in:subscription,wallet'],
            'planName' => ['required_if:purpose,subscription', 'string'],
            'billingCycle' => ['nullable', 'string', 'in:monthly,annual'],
            'amount' => ['required_if:purpose,wallet', 'numeric'],
        ]);

        if ($validator->fails()) {
            return $this->error(
                422,
                'INVALID_CRYPTO_INVOICE_REQUEST',
                $validator->errors()->first(),
            );
        }

        $validated = $validator->validated();
        $purpose = (string) $validated['purpose'];

        if ($purpose === 'subscription') {
            $tierName = (string) $validated['planName'];
            $monthlyPrice = self::SUBSCRIPTION_PRICES_USD[$tierName] ?? null;

            if ($monthlyPrice === null) {
                return $this->error(
                    422,
                    'UNKNOWN_VIP_PLAN',
                    'That plan is not recognized.',
                );
            }

            $billingCycle = (string) ($validated['billingCycle'] ?? 'monthly');

            if ($billingCycle === 'annual') {
                $priceAmount = round($monthlyPrice * 12 * (1 - self::ANNUAL_DISCOUNT_RATE), 2);
                $planName = "{$tierName} (Annual)";
            } else {
                $priceAmount = $monthlyPrice;
                $planName = $tierName;
            }
        } else {
            $planName = null;
            $priceAmount = (float) $validated['amount'];

            if (
                $priceAmount < self::MIN_WALLET_FUNDING_USD ||
                $priceAmount > self::MAX_WALLET_FUNDING_USD
            ) {
                return $this->error(
                    422,
                    'INVALID_WALLET_FUNDING_AMOUNT',
                    sprintf(
                        'Enter an amount between $%s and $%s.',
                        number_format(self::MIN_WALLET_FUNDING_USD, 2),
                        number_format(self::MAX_WALLET_FUNDING_USD, 2),
                    ),
                );
            }
        }

        $sessionId = trim((string) $request->header('X-Zainex-Session-Id', ''));

        $this->linkAccountToUser(
            $sessionId,
            $request->header('X-Zainex-User-Email'),
        );

        $account = $this->accountForSession($sessionId);

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

        $payCurrency = (string) Config::get(
            'services.nowpayments.pay_currency',
            'usdttrc20',
        );

        $orderId = sprintf(
            'zainex:%s:%s:%s',
            $purpose,
            $account->id,
            (string) Str::uuid(),
        );

        try {
            $callbackUrl = $this->ipnCallbackUrl($request);

            $response = $service->createPayment([
                'price_amount' => $priceAmount,
                'price_currency' => 'usd',
                'pay_currency' => $payCurrency,
                'order_id' => $orderId,
                'order_description' => $purpose === 'subscription'
                    ? "ZAINEX {$planName} subscription"
                    : 'ZAINEX trading wallet top-up',
                'ipn_callback_url' => $callbackUrl,
            ]);
        } catch (Throwable $exception) {
            report($exception);

            return $this->error(
                502,
                'NOWPAYMENTS_REQUEST_FAILED',
                'Could not reach the crypto payment provider.',
            );
        }

        $providerPaymentId = isset($response['payment_id'])
            ? (string) $response['payment_id']
            : null;

        $payAddress = isset($response['pay_address'])
            ? (string) $response['pay_address']
            : null;

        $payAmount = isset($response['pay_amount'])
            ? (string) $response['pay_amount']
            : null;

        if ($providerPaymentId === null || $payAddress === null) {
            report(new \RuntimeException(
                'NOWPayments create-payment response missing expected fields: '.
                json_encode($response),
            ));

            return $this->error(
                502,
                'NOWPAYMENTS_INVALID_RESPONSE',
                'The crypto payment provider returned an unexpected response.',
            );
        }

        DB::table('crypto_payments')->insert([
            'user_id' => $account->user_id,
            'trading_account_id' => $account->id,
            'purpose' => $purpose,
            'plan_name' => $planName,
            'price_amount' => (string) $priceAmount,
            'price_currency' => 'usd',
            'pay_currency' => $payCurrency,
            'order_id' => $orderId,
            'provider_payment_id' => $providerPaymentId,
            'pay_address' => $payAddress,
            'pay_amount' => $payAmount,
            'status' => (string) ($response['payment_status'] ?? 'waiting'),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return response()
            ->json([
                'ok' => true,
                'paymentId' => $providerPaymentId,
                'payAddress' => $payAddress,
                'payAmount' => $payAmount,
                'payCurrency' => $payCurrency,
                'priceAmount' => $priceAmount,
                'status' => (string) ($response['payment_status'] ?? 'waiting'),
            ])
            ->header('Cache-Control', 'no-store');
    }

    public function status(Request $request, string $paymentId): JsonResponse
    {
        $guard = $this->guard($request);

        if ($guard !== null) {
            return $guard;
        }

        $sessionId = trim((string) $request->header('X-Zainex-Session-Id', ''));
        $account = $this->accountForSession($sessionId);

        if ($account === null) {
            return $this->error(
                404,
                'FUTURES_ACCOUNT_NOT_FOUND',
                'No active Futures account was found.',
            );
        }

        $payment = DB::table('crypto_payments')
            ->where('provider_payment_id', $paymentId)
            ->where('trading_account_id', $account->id)
            ->first();

        if ($payment === null) {
            return $this->error(
                404,
                'CRYPTO_PAYMENT_NOT_FOUND',
                'That crypto payment was not found.',
            );
        }

        $service = $this->service();

        if ($service !== null && ! in_array($payment->status, ['finished', 'confirmed'], true)) {
            try {
                $live = $service->getPaymentStatus($paymentId);
                $liveStatus = isset($live['payment_status'])
                    ? (string) $live['payment_status']
                    : null;

                if ($liveStatus !== null && $liveStatus !== $payment->status) {
                    $this->applyStatus($payment, $liveStatus, $live);
                    $payment = DB::table('crypto_payments')
                        ->where('id', $payment->id)
                        ->first();
                }
            } catch (Throwable $exception) {
                report($exception);
                // Fall through and return the last known local status —
                // a transient provider error shouldn't break polling.
            }
        }

        return response()
            ->json([
                'ok' => true,
                'paymentId' => $payment->provider_payment_id,
                'status' => $payment->status,
                'payAddress' => $payment->pay_address,
                'payAmount' => $payment->pay_amount,
                'payCurrency' => $payment->pay_currency,
                'priceAmount' => (float) $payment->price_amount,
            ])
            ->header('Cache-Control', 'no-store');
    }

    public function webhook(Request $request): JsonResponse
    {
        $ipnSecret = trim((string) Config::get('services.nowpayments.ipn_secret', ''));
        $signature = trim((string) $request->header('x-nowpayments-sig', ''));

        /** @var array<string, mixed> $payload */
        $payload = (array) $request->all();

        if (! NowPaymentsService::verifyIpnSignature($payload, $signature, $ipnSecret)) {
            report(new \RuntimeException('NOWPayments IPN signature verification failed.'));

            return response()->json(['ok' => false], 401);
        }

        $providerPaymentId = isset($payload['payment_id'])
            ? (string) $payload['payment_id']
            : null;

        $status = isset($payload['payment_status'])
            ? (string) $payload['payment_status']
            : null;

        if ($providerPaymentId === null || $status === null) {
            return response()->json(['ok' => false], 422);
        }

        $payment = DB::table('crypto_payments')
            ->where('provider_payment_id', $providerPaymentId)
            ->first();

        if ($payment === null) {
            return response()->json(['ok' => false], 404);
        }

        try {
            $this->applyStatus($payment, $status, $payload);
        } catch (Throwable $exception) {
            report($exception);

            return response()->json(['ok' => false], 500);
        }

        return response()->json(['ok' => true]);
    }

    /**
     * @param  array<string, mixed>  $rawPayload
     */
    private function applyStatus(object $payment, string $status, array $rawPayload): void
    {
        $isFinished = in_array($status, ['finished', 'confirmed'], true);

        DB::transaction(function () use ($payment, $status, $rawPayload, $isFinished): void {
            $current = DB::table('crypto_payments')
                ->where('id', $payment->id)
                ->lockForUpdate()
                ->first();

            if ($current === null) {
                return;
            }

            DB::table('crypto_payments')
                ->where('id', $current->id)
                ->update([
                    'status' => $status,
                    'ipn_payload' => json_encode($rawPayload, JSON_THROW_ON_ERROR),
                    'updated_at' => now(),
                ]);

            if (! $isFinished || $current->credited_at !== null) {
                // Already credited (or not a completed state yet) — the
                // credited_at guard makes this handler safe to run more
                // than once for the same payment_id.
                return;
            }

            $this->credit($current);

            DB::table('crypto_payments')
                ->where('id', $current->id)
                ->update([
                    'credited_at' => now(),
                    'updated_at' => now(),
                ]);
        }, 5);
    }

    private function credit(object $payment): void
    {
        if ($payment->trading_account_id === null) {
            return;
        }

        $account = DB::table('trading_accounts')
            ->where('id', $payment->trading_account_id)
            ->lockForUpdate()
            ->first();

        if ($account === null || $account->user_id === null) {
            return;
        }

        $user = DB::table('users')
            ->where('id', $account->user_id)
            ->lockForUpdate()
            ->first();

        if ($user === null) {
            return;
        }

        $amount = BigDecimal::of((string) $payment->price_amount)
            ->toScale(8, RoundingMode::Down);

        // A "subscription" crypto payment is just payment confirmation for
        // a plan the user intends to fund — like merchant cash-ins, it
        // always credits the wallet. VIP tier itself is decided later on
        // the strategy page, when the user spends credits/wallet funds to
        // activate a VIP-tier strategy (see AdminController::
        // approveMerchantCashin() for the same reasoning).
        $description = $payment->purpose === 'subscription'
            ? "Trading wallet funded via NOWPayments crypto transfer ({$payment->plan_name} plan funding)."
            : 'Trading wallet funded via NOWPayments crypto transfer.';

        $balance = DB::table('trading_balances')
            ->where('trading_account_id', $account->id)
            ->where('asset', 'USDT')
            ->lockForUpdate()
            ->first();

        if ($balance === null) {
            return;
        }

        $walletBefore = BigDecimal::of((string) $user->wallet_balance)
            ->toScale(8, RoundingMode::Down);
        $walletAfter = $walletBefore->plus($amount)->toScale(8, RoundingMode::Down);

        $availableBefore = BigDecimal::of((string) $balance->available_balance)
            ->toScale(8, RoundingMode::Down);
        $availableAfter = $availableBefore->plus($amount)->toScale(8, RoundingMode::Down);

        $strategyLocked = BigDecimal::of((string) ($balance->strategy_locked_balance ?? '0'))
            ->toScale(8, RoundingMode::Down);

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
                'available_balance' => (string) $availableAfter,
                'updated_at' => $occurredAt,
            ]);

        DB::table('wallet_transactions')->insert([
            'trading_account_id' => $account->id,
            'user_id' => $user->id,
            'strategy_activation_id' => null,
            'event_type' => 'CRYPTO_WALLET_FUNDING',
            'direction' => 'CREDIT',
            'asset' => 'USDT',
            'amount' => (string) $amount,
            'wallet_balance_before' => (string) $walletBefore,
            'wallet_balance_after' => (string) $walletAfter,
            'available_balance_before' => (string) $availableBefore,
            'available_balance_after' => (string) $availableAfter,
            'strategy_locked_before' => (string) $strategyLocked,
            'strategy_locked_after' => (string) $strategyLocked,
            'ai_credits_before' => (int) $user->ai_credits,
            'ai_credits_after' => (int) $user->ai_credits,
            'reference_key' => 'crypto-payment:'.$payment->id,
            'description' => $description,
            'metadata' => json_encode([
                'provider' => 'nowpayments',
                'providerPaymentId' => $payment->provider_payment_id,
            ], JSON_THROW_ON_ERROR),
            'occurred_at' => $occurredAt,
            'created_at' => $occurredAt,
        ]);
    }

    private function ipnCallbackUrl(Request $request): string
    {
        $configured = trim((string) Config::get('services.nowpayments.ipn_callback_url', ''));

        if ($configured !== '') {
            return $configured;
        }

        return $request->getSchemeAndHttpHost().'/api/webhooks/nowpayments';
    }

    private function service(): ?NowPaymentsService
    {
        $apiKey = trim((string) Config::get('services.nowpayments.api_key', ''));
        $baseUrl = trim((string) Config::get('services.nowpayments.base_url', ''));

        if ($apiKey === '' || $baseUrl === '') {
            return null;
        }

        return new NowPaymentsService($apiKey, $baseUrl);
    }

    private function guard(Request $request): ?JsonResponse
    {
        $expected = trim((string) Config::get('intelibrain.internal_token', ''));
        $provided = trim((string) $request->header('X-Zainex-Internal-Token', ''));

        if (
            $expected === '' ||
            $provided === '' ||
            ! hash_equals($expected, $provided)
        ) {
            return $this->error(
                401,
                'FUTURES_BACKEND_UNAUTHORIZED',
                'The Laravel Futures request is unauthorized.',
            );
        }

        $sessionId = trim((string) $request->header('X-Zainex-Session-Id', ''));

        if (! Str::isUuid($sessionId)) {
            return $this->error(
                422,
                'INVALID_DEMO_SESSION',
                'A valid ZAINEX demo session is required.',
            );
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
