<?php

// ZAINEX_LIVE_OKX_TRADING_V1
// Lifecycle management for a user's own OKX API credentials. Never
// logs the raw secret/passphrase; the model's `encrypted` casts keep
// them at rest, and every write here goes through TradingAuditLog for
// a permanent record of connect/verify/disconnect actions.

namespace App\Services\Trading\Okx;

use App\Exceptions\ExchangeConnectionException;
use App\Exceptions\OkxApiException;
use App\Models\ExchangeConnection;
use App\Models\FuturesPosition;
use App\Models\TradingAccount;
use App\Models\TradingAuditLog;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

final class ExchangeConnectionService
{
    public function connect(
        User $user,
        string $apiKey,
        string $apiSecret,
        string $passphrase,
        bool $isDemo,
        ?string $label,
        ?string $requestId = null,
    ): ExchangeConnection {
        $apiKey = trim($apiKey);
        $apiSecret = trim($apiSecret);
        $passphrase = trim($passphrase);

        if ($apiKey === '' || $apiSecret === '' || $passphrase === '') {
            throw new ExchangeConnectionException(
                'INVALID_OKX_CREDENTIALS',
                'API key, secret, and passphrase are all required.',
                422,
            );
        }

        $connection = ExchangeConnection::query()
            ->firstOrNew([
                'user_id' => $user->id,
                'exchange' => 'OKX',
            ]);

        $connection->fill([
            'label' => $label,
            'is_demo' => $isDemo,
            'api_key' => $apiKey,
            'api_secret' => $apiSecret,
            'passphrase' => $passphrase,
            'status' => 'PENDING',
            'revoked_at' => null,
        ]);
        $connection->save();

        $this->verify($connection, $requestId);

        return $connection->fresh() ?? $connection;
    }

    public function verify(
        ExchangeConnection $connection,
        ?string $requestId = null,
    ): void {
        $client = new OkxApiClient(
            apiKey: (string) $connection->api_key,
            apiSecret: (string) $connection->api_secret,
            passphrase: (string) $connection->passphrase,
            isDemo: (bool) $connection->is_demo,
            rateLimitKey: 'connection:'.$connection->id,
        );

        try {
            $client->get('/api/v5/account/config');

            $connection->update([
                'status' => 'ACTIVE',
                'last_verified_at' => now(),
                'last_error_code' => null,
                'last_error_message' => null,
            ]);

            $this->audit(
                $connection,
                'okx_connection_verified',
                $requestId,
            );
        } catch (OkxApiException $exception) {
            $connection->update([
                'status' => 'INVALID',
                'last_error_code' => $exception->sCode,
                'last_error_message' => $exception->sMsg ?? $exception->getMessage(),
            ]);

            $this->audit(
                $connection,
                'okx_connection_verify_failed',
                $requestId,
                [
                    'sCode' => $exception->sCode,
                    'sMsg' => $exception->sMsg,
                ],
            );

            throw new ExchangeConnectionException(
                'OKX_VERIFICATION_FAILED',
                $exception->sMsg ?? $exception->getMessage(),
                422,
                ['sCode' => $exception->sCode],
            );
        }
    }

    public function disconnect(
        User $user,
        bool $force = false,
        ?string $requestId = null,
    ): void {
        $connection = ExchangeConnection::query()
            ->where('user_id', $user->id)
            ->where('exchange', 'OKX')
            ->first();

        if ($connection === null) {
            throw new ExchangeConnectionException(
                'OKX_NOT_CONNECTED',
                'No OKX connection exists for this account.',
                404,
            );
        }

        $liveAccount = TradingAccount::query()
            ->where('user_id', $user->id)
            ->where('account_type', 'LIVE_OKX')
            ->first();

        if ($liveAccount !== null && ! $force) {
            $hasOpenPosition = FuturesPosition::query()
                ->where('trading_account_id', $liveAccount->id)
                ->where('status', 'OPEN')
                ->exists();

            if ($hasOpenPosition) {
                throw new ExchangeConnectionException(
                    'ACTIVE_LIVE_POSITIONS_EXIST',
                    'You have an open live position. Close it first, or pass force=true — the position will remain open on OKX itself and will no longer be manageable through ZAINEX once disconnected.',
                    409,
                );
            }
        }

        DB::transaction(function () use ($connection, $requestId): void {
            $connection->update([
                'status' => 'REVOKED',
                'api_key' => null,
                'api_secret' => null,
                'passphrase' => null,
                'revoked_at' => now(),
            ]);

            $this->audit(
                $connection,
                'okx_connection_disconnected',
                $requestId,
            );
        });
    }

    /**
     * @param array<string, mixed> $metadata
     */
    private function audit(
        ExchangeConnection $connection,
        string $event,
        ?string $requestId,
        array $metadata = [],
    ): void {
        TradingAuditLog::query()->create([
            'trading_account_id' => null,
            'actor_type' => 'LIVE_USER',
            'actor_id' => (string) $connection->user_id,
            'event' => $event,
            'request_id' => $requestId ?? (string) Str::uuid(),
            'client_order_id' => null,
            'ip_address' => null,
            'user_agent' => null,
            'payload_hash' => hash('sha256', $event.$connection->id),
            'metadata' => $metadata,
            'created_at' => now(),
        ]);
    }
}
