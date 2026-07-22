<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\LinksTradingAccountToUser;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;

// ZAINEX_MERCHANT_CASHIN_V1
// Records a "Pay via Merchant" (GoTyme) checkout submission so it shows up
// for admin review instead of disappearing into thin air the moment the
// user taps "I've sent it." Purely a pending claim — no funds move until
// an admin approves it via AdminController::approveMerchantCashin.

final class MerchantCashinController extends Controller
{
    use LinksTradingAccountToUser;

    /**
     * @var array<string, float>
     */
    private const SUBSCRIPTION_PRICES_USD = [
        'VIP 1' => 5.0,
        'VIP 2' => 15.0,
        'VIP 3' => 45.0,
    ];

    private const MIN_WALLET_FUNDING_USD = 1.0;

    private const MAX_WALLET_FUNDING_USD = 10_000.0;

    public function store(Request $request): JsonResponse
    {
        $guard = $this->guard($request);

        if ($guard !== null) {
            return $guard;
        }

        $validator = Validator::make($request->all(), [
            'purpose' => ['required', 'string', 'in:subscription,wallet'],
            'planName' => ['required_if:purpose,subscription', 'string'],
            'amount' => ['required_if:purpose,wallet', 'numeric'],
            'proofImage' => ['nullable', 'string', 'max:3000000'],
        ]);

        if ($validator->fails()) {
            return $this->error(422, 'INVALID_MERCHANT_CASHIN_REQUEST', $validator->errors()->first());
        }

        $validated = $validator->validated();
        $purpose = (string) $validated['purpose'];

        if ($purpose === 'subscription') {
            $planName = (string) $validated['planName'];
            $amount = self::SUBSCRIPTION_PRICES_USD[$planName] ?? null;

            if ($amount === null) {
                return $this->error(422, 'UNKNOWN_VIP_PLAN', 'That plan is not recognized.');
            }
        } else {
            $planName = null;
            $amount = (float) $validated['amount'];

            if ($amount < self::MIN_WALLET_FUNDING_USD || $amount > self::MAX_WALLET_FUNDING_USD) {
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

        $proofImage = isset($validated['proofImage']) ? (string) $validated['proofImage'] : null;

        $sessionId = trim((string) $request->header('X-Zainex-Session-Id', ''));

        $this->linkAccountToUser($sessionId, $request->header('X-Zainex-User-Email'));

        $account = DB::table('trading_accounts')
            ->where('external_session_id', $sessionId)
            ->where('status', 'ACTIVE')
            ->first();

        if ($account === null) {
            return $this->error(404, 'FUTURES_ACCOUNT_NOT_FOUND', 'No active Futures account was found.');
        }

        $cashinId = DB::table('merchant_cashins')->insertGetId([
            'user_id' => $account->user_id,
            'trading_account_id' => $account->id,
            'purpose' => $purpose,
            'plan_name' => $planName,
            'amount' => (string) $amount,
            'proof_image' => $proofImage,
            'status' => 'pending',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return response()
            ->json([
                'ok' => true,
                'cashinId' => $cashinId,
                'status' => 'pending',
            ], 201)
            ->header('Cache-Control', 'no-store');
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
            return $this->error(401, 'FUTURES_BACKEND_UNAUTHORIZED', 'The Laravel Futures request is unauthorized.');
        }

        $sessionId = trim((string) $request->header('X-Zainex-Session-Id', ''));

        if (! Str::isUuid($sessionId)) {
            return $this->error(422, 'INVALID_DEMO_SESSION', 'A valid ZAINEX demo session is required.');
        }

        return null;
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
