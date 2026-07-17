<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Throwable;

// ZAINEX_MULTI_USER_GOOGLE_AUTH_V1
// ZAINEX_THREE_LEVEL_REFERRALS_V1

final class GoogleAuthLinkController extends Controller
{
    public function __invoke(
        Request $request,
    ): JsonResponse {
        $expectedToken = trim(
            (string)
                Config::get(
                    'intelibrain.internal_token',
                    '',
                ),
        );

        $providedToken = trim(
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
            return $this->fail(
                401,
                'GOOGLE_LINK_UNAUTHORIZED',
                'Unauthorized Google account link request.',
            );
        }

        $validator = Validator::make(
            $request->all(),
            [
                'email' => [
                    'required',
                    'string',
                    'email:rfc',
                    'max:255',
                ],
                'name' => [
                    'nullable',
                    'string',
                    'max:255',
                ],
                'referralCode' => [
                    'nullable',
                    'string',
                    'max:32',
                    'regex:/\A[A-Z0-9]{6,32}\z/i',
                ],
            ],
        );

        if ($validator->fails()) {
            return $this->fail(
                422,
                'INVALID_GOOGLE_IDENTITY',
                $validator
                    ->errors()
                    ->first(),
            );
        }

        $validated =
            $validator->validated();

        $email = strtolower(
            trim(
                (string)
                    $validated['email'],
            ),
        );

        $name = trim(
            (string)
                (
                    $validated['name'] ??
                    ''
                ),
        );

        if ($name === '') {
            $name =
                explode(
                    '@',
                    $email,
                    2,
                )[0] ??
                'ZAINEX User';
        }

        $referralCode = strtoupper(
            trim(
                (string)
                    (
                        $validated[
                            'referralCode'
                        ] ??
                        ''
                    ),
            ),
        );

        try {
            $result = DB::transaction(
                function () use (
                    $email,
                    $name,
                    $referralCode,
                ): array {
                    $now = now();

                    $user = DB::table('users')
                        ->whereRaw(
                            'LOWER(email) = ?',
                            [$email],
                        )
                        ->lockForUpdate()
                        ->first();

                    $created = false;
                    $attributed = false;
                    $inviter = null;

                    if ($user === null) {
                        if ($referralCode !== '') {
                            $inviter = DB::table(
                                'users',
                            )
                                ->whereRaw(
                                    'UPPER(referral_code) = ?',
                                    [$referralCode],
                                )
                                ->lockForUpdate()
                                ->first();
                        }

                        $userId = DB::table(
                            'users',
                        )->insertGetId([
                            'name' => $name,
                            'email' => $email,
                            'email_verified_at' =>
                                $now,
                            'password' => Hash::make(
                                Str::random(64),
                            ),
                            'remember_token' => null,
                            'wallet_balance' =>
                                '0.00000000',
                            'inviter_id' =>
                                $inviter?->id,
                            'referral_code' => null,
                            'referred_at' =>
                                $inviter === null
                                    ? null
                                    : $now,
                            'role' => 'USER',
                            'avatar_url' => null,
                            'ai_credits' => 0,
                            'created_at' => $now,
                            'updated_at' => $now,
                        ]);

                        DB::table('users')
                            ->where(
                                'id',
                                $userId,
                            )
                            ->update([
                                'referral_code' =>
                                    $this
                                        ->referralCode(
                                            (int)
                                                $userId,
                                            $email,
                                        ),
                                'updated_at' => $now,
                            ]);

                        $user = DB::table('users')
                            ->where(
                                'id',
                                $userId,
                            )
                            ->first();

                        $created = true;
                        $attributed =
                            $inviter !== null;
                    }
                    else {
                        $updates = [];

                        if (
                            $user
                                ->email_verified_at ===
                            null
                        ) {
                            $updates[
                                'email_verified_at'
                            ] = $now;
                        }

                        if (
                            (string) $user->role !==
                                'ROOT' &&
                            $name !== '' &&
                            (string) $user->name !==
                                $name
                        ) {
                            $updates['name'] = $name;
                        }

                        if (
                            trim(
                                (string)
                                    (
                                        $user
                                            ->referral_code ??
                                        ''
                                    ),
                            ) === ''
                        ) {
                            $updates[
                                'referral_code'
                            ] = $this
                                ->referralCode(
                                    (int)
                                        $user->id,
                                    $email,
                                );
                        }

                        /*
                         * Existing accounts never receive
                         * or replace inviter_id from a later
                         * referral link.
                         */

                        if ($updates !== []) {
                            $updates['updated_at'] =
                                $now;

                            DB::table('users')
                                ->where(
                                    'id',
                                    $user->id,
                                )
                                ->update(
                                    $updates,
                                );

                            $user = DB::table(
                                'users',
                            )
                                ->where(
                                    'id',
                                    $user->id,
                                )
                                ->first();
                        }
                    }

                    $account = DB::table(
                        'trading_accounts',
                    )
                        ->where(
                            'user_id',
                            $user->id,
                        )
                        ->where(
                            'status',
                            'ACTIVE',
                        )
                        ->orderBy('id')
                        ->lockForUpdate()
                        ->first();

                    if ($account === null) {
                        $accountId = DB::table(
                            'trading_accounts',
                        )->insertGetId([
                            'user_id' => $user->id,
                            'external_session_id' =>
                                (string) Str::uuid(),
                            'account_type' =>
                                'PAPER',
                            'mode' =>
                                'UNIFIED_PAPER',
                            'base_asset' => 'USDT',
                            'status' => 'ACTIVE',
                            'starting_balance' =>
                                '0.00000000',
                            'created_at' => $now,
                            'updated_at' => $now,
                        ]);

                        DB::table(
                            'trading_balances',
                        )->insert([
                            'trading_account_id' =>
                                $accountId,
                            'asset' => 'USDT',
                            'available_balance' =>
                                '0.00000000',
                            'locked_balance' =>
                                '0.00000000',
                            'realized_pnl' =>
                                '0.00000000',
                            'strategy_locked_balance' =>
                                '0.00000000',
                            'created_at' => $now,
                            'updated_at' => $now,
                        ]);

                        $account = DB::table(
                            'trading_accounts',
                        )
                            ->where(
                                'id',
                                $accountId,
                            )
                            ->first();
                    }
                    elseif (
                        ! DB::table(
                            'trading_balances',
                        )
                            ->where(
                                'trading_account_id',
                                $account->id,
                            )
                            ->where(
                                'asset',
                                'USDT',
                            )
                            ->exists()
                    ) {
                        DB::table(
                            'trading_balances',
                        )->insert([
                            'trading_account_id' =>
                                $account->id,
                            'asset' => 'USDT',
                            'available_balance' =>
                                '0.00000000',
                            'locked_balance' =>
                                '0.00000000',
                            'realized_pnl' =>
                                '0.00000000',
                            'strategy_locked_balance' =>
                                '0.00000000',
                            'created_at' => $now,
                            'updated_at' => $now,
                        ]);
                    }

                    return [
                        'created' => $created,
                        'attributed' =>
                            $attributed,
                        'user' => $user,
                        'account' => $account,
                        'inviter' => $inviter,
                    ];
                },
                5,
            );

            return response()
                ->json(
                    [
                        'ok' => true,
                        'created' =>
                            $result['created'],
                        'sessionId' =>
                            (string)
                                $result[
                                    'account'
                                ]
                                    ->external_session_id,
                        'user' => [
                            'id' =>
                                (int)
                                    $result[
                                        'user'
                                    ]->id,
                            'name' =>
                                (string)
                                    $result[
                                        'user'
                                    ]->name,
                            'email' =>
                                (string)
                                    $result[
                                        'user'
                                    ]->email,
                            'role' =>
                                (string)
                                    $result[
                                        'user'
                                    ]->role,
                            'walletBalance' =>
                                (float)
                                    $result[
                                        'user'
                                    ]->wallet_balance,
                            'credits' =>
                                (int)
                                    $result[
                                        'user'
                                    ]->ai_credits,
                        ],
                        'referral' => [
                            'code' =>
                                (string)
                                    $result[
                                        'user'
                                    ]->referral_code,
                            'attributed' =>
                                (bool)
                                    $result[
                                        'attributed'
                                    ],
                            'inviterId' =>
                                $result[
                                    'inviter'
                                ] === null
                                    ? null
                                    : (int)
                                        $result[
                                            'inviter'
                                        ]->id,
                        ],
                    ],
                    $result['created']
                        ? 201
                        : 200,
                )
                ->header(
                    'Cache-Control',
                    'no-store',
                );
        }
        catch (Throwable $error) {
            report($error);

            return $this->fail(
                500,
                'GOOGLE_ACCOUNT_LINK_FAILED',
                'The Google account could not be linked to ZAINEX.',
            );
        }
    }

    private function referralCode(
        int $userId,
        string $email,
    ): string {
        return
            'ZX' .
            strtoupper(
                base_convert(
                    (string) $userId,
                    10,
                    36,
                ),
            ) .
            strtoupper(
                substr(
                    hash(
                        'sha256',
                        strtolower(
                            trim($email),
                        ),
                    ),
                    0,
                    8,
                ),
            );
    }

    private function fail(
        int $status,
        string $code,
        string $message,
    ): JsonResponse {
        return response()
            ->json(
                [
                    'ok' => false,
                    'error' => [
                        'code' => $code,
                        'message' => $message,
                    ],
                ],
                $status,
            )
            ->header(
                'Cache-Control',
                'no-store',
            );
    }
}