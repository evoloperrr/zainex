<?php

// ZAINEX_LIVE_OKX_TRADING_V1
// Live trading flips the identity model the paper flow uses: an
// anonymous demo session is primary there and a real user is an
// optional, self-healing link (see LinksTradingAccountToUser). Here a
// verified real user is mandatory from the first request — there is no
// such thing as an anonymous live OKX account.

namespace App\Http\Controllers\Api\Concerns;

use App\Exceptions\FuturesTradingException;
use App\Models\ExchangeConnection;
use App\Models\TradingAccount;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

trait RequiresLiveTradingIdentity
{
    /**
     * @return array{0: User, 1: TradingAccount, 2: ExchangeConnection}
     */
    private function resolveLiveTradingIdentity(Request $request): array
    {
        $email = trim((string) $request->header('X-Zainex-User-Email', ''));

        if ($email === '') {
            throw new FuturesTradingException(
                'LIVE_TRADING_USER_REQUIRED',
                'A verified ZAINEX account is required for live trading.',
                401,
            );
        }

        $user = User::query()
            ->whereRaw('LOWER(email) = ?', [strtolower($email)])
            ->first();

        if ($user === null) {
            throw new FuturesTradingException(
                'LIVE_TRADING_USER_REQUIRED',
                'A verified ZAINEX account is required for live trading.',
                401,
            );
        }

        $connection = ExchangeConnection::query()
            ->where('user_id', $user->id)
            ->where('exchange', 'OKX')
            ->where('status', 'ACTIVE')
            ->first();

        if ($connection === null) {
            throw new FuturesTradingException(
                'LIVE_TRADING_NOT_CONNECTED',
                'Connect an active OKX API key before placing live trades.',
                409,
            );
        }

        $account = TradingAccount::query()->firstOrCreate(
            [
                'user_id' => $user->id,
                'account_type' => 'LIVE_OKX',
            ],
            [
                'external_session_id' => 'live-okx-'.Str::uuid(),
                'exchange_connection_id' => $connection->id,
                'mode' => 'LIVE_OKX_FUTURES',
                'base_asset' => 'USDT',
                'status' => 'ACTIVE',
                'starting_balance' => '0.00000000',
            ],
        );

        if ($account->exchange_connection_id !== $connection->id) {
            $account->update(['exchange_connection_id' => $connection->id]);
        }

        return [$user, $account, $connection];
    }
}
