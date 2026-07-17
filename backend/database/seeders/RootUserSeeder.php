<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\TradingAccount;
use App\Models\TradingBalance;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

// ZAINEX_ROOT_USER_LINKED_WALLET_AVATAR_V1
// ZAINEX_ROOT_ADMIN_WALLET_TRANSFER_V1

final class RootUserSeeder extends Seeder
{
    public const EMAIL = 'evoloperr@gmail.com';

    public const TRADING_SESSION_ID =
        'cd8ba970-c750-4970-9a45-66e947e95fef';

    public const WALLET =
        '100000.00000000';

    public function run(): void
    {
        DB::transaction(
            function (): void {
                $user = User::query()
                    ->whereRaw(
                        'LOWER(email) = ?',
                        [self::EMAIL],
                    )
                    ->first();

                if ($user === null) {
                    $user = new User();
                    $user->name =
                        'Erdie Barela';

                    $user->email =
                        self::EMAIL;

                    $user->password =
                        Hash::make(
                            Str::random(64),
                        );
                }

                $user->email_verified_at ??=
                    now();

                $user->role =
                    'ROOT';

                $user->is_admin =
                    true;

                $user->avatar_url =
                    '/avatars/root-eb.svg';

                $user->wallet_balance =
                    self::WALLET;

                $user->ai_credits =
                    0;

                $user->referral_credit_balance =
                    '0.00000000';

                $user->inviter_id =
                    null;

                $user->referred_at =
                    null;

                $user->save();

                $account =
                    TradingAccount::query()
                        ->updateOrCreate(
                            [
                                'external_session_id' =>
                                    self::TRADING_SESSION_ID,
                            ],
                            [
                                'user_id' =>
                                    $user->id,

                                'account_type' =>
                                    'PAPER',

                                'mode' =>
                                    'UNIFIED_PAPER',

                                'base_asset' =>
                                    'USDT',

                                'status' =>
                                    'ACTIVE',

                                'starting_balance' =>
                                    self::WALLET,
                            ],
                        );

                TradingBalance::query()
                    ->updateOrCreate(
                        [
                            'trading_account_id' =>
                                $account->id,

                            'asset' =>
                                'USDT',
                        ],
                        [
                            'available_balance' =>
                                self::WALLET,

                            'locked_balance' =>
                                '0.00000000',

                            'strategy_locked_balance' =>
                                '0.00000000',

                            'realized_pnl' =>
                                '0.00000000',
                        ],
                    );
            },
            5,
        );
    }
}