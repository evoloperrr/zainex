<?php

// ZAINEX_LIVE_OKX_TRADING_V1
// Low-level signed OKX v5 REST client. One instance per set of
// credentials — construct fresh for the connect/verify flow (raw,
// not-yet-persisted credentials) or from a stored ExchangeConnection.
//
// Deliberately does NOT retry POST requests on ambiguous network
// failure (timeout / connection reset): a retried order placement could
// double-submit a real trade. Ambiguous failures are left for the
// ReconcileOkxOrders command to resolve via GET /trade/order instead.

namespace App\Services\Trading\Okx;

use App\Exceptions\OkxApiException;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\RateLimiter;
use Throwable;

final class OkxApiClient
{
    private readonly OkxSigner $signer;

    public function __construct(
        private readonly string $apiKey,
        private readonly string $apiSecret,
        private readonly string $passphrase,
        private readonly bool $isDemo,
        private readonly string $rateLimitKey,
    ) {
        $this->signer = new OkxSigner();
    }

    /**
     * @param array<string, mixed> $query
     * @return array<string, mixed>
     */
    public function get(string $path, array $query = []): array
    {
        return $this->request('GET', $path, $query, []);
    }

    /**
     * @param array<string, mixed> $body
     * @return array<string, mixed>
     */
    public function post(string $path, array $body = []): array
    {
        return $this->request('POST', $path, [], $body);
    }

    /**
     * @param array<string, mixed> $query
     * @param array<string, mixed> $body
     * @return array<string, mixed>
     */
    private function request(
        string $method,
        string $path,
        array $query,
        array $body,
    ): array {
        $this->throttle();

        $queryString = $query === []
            ? ''
            : '?'.http_build_query($query);

        $requestPath = $path.$queryString;

        $bodyString = $body === []
            ? ''
            : json_encode($body, JSON_UNESCAPED_SLASHES);

        $timestamp = $this->signer->timestamp();

        $signature = $this->signer->sign(
            $this->apiSecret,
            $timestamp,
            $method,
            $requestPath,
            (string) $bodyString,
        );

        $headers = [
            'OK-ACCESS-KEY' => $this->apiKey,
            'OK-ACCESS-SIGN' => $signature,
            'OK-ACCESS-TIMESTAMP' => $timestamp,
            'OK-ACCESS-PASSPHRASE' => $this->passphrase,
        ];

        if ($this->isDemo) {
            $headers['x-simulated-trading'] = '1';
        }

        // Signed exactly what will be sent, byte-for-byte — using the
        // `json` request option here would let Guzzle re-encode the body
        // (e.g. differing slash-escaping), which would silently
        // desynchronize the signature from the transmitted bytes.
        $request = $this->client()->withHeaders($headers);

        if ($bodyString !== '') {
            $request = $request->withBody($bodyString, 'application/json');
        }

        try {
            $response = $request->send(
                $method,
                config('okx.base_url').$requestPath,
            );
        } catch (Throwable $exception) {
            throw new OkxApiException(
                'Could not reach OKX: '.$exception->getMessage(),
                httpStatus: 502,
            );
        }

        $payload = $response->json();

        if (! is_array($payload)) {
            throw new OkxApiException(
                'OKX returned a non-JSON response.',
                httpStatus: $response->status(),
            );
        }

        $code = (string) ($payload['code'] ?? '');

        if ($code !== '0') {
            $firstError = is_array($payload['data'] ?? null)
                ? ($payload['data'][0] ?? [])
                : [];

            $sCode = is_array($firstError)
                ? ($firstError['sCode'] ?? $code)
                : $code;

            $sMsg = is_array($firstError)
                ? ($firstError['sMsg'] ?? ($payload['msg'] ?? 'Unknown OKX error'))
                : ($payload['msg'] ?? 'Unknown OKX error');

            throw new OkxApiException(
                (string) $sMsg,
                sCode: (string) $sCode,
                sMsg: (string) $sMsg,
                httpStatus: $response->status() === 200 ? 422 : $response->status(),
                details: $payload,
            );
        }

        return $payload;
    }

    private function throttle(): void
    {
        $maxAttempts = (int) config('okx.rate_limit.max_requests', 15);
        $decaySeconds = (int) config('okx.rate_limit.window_seconds', 2);

        $allowed = RateLimiter::attempt(
            'okx-api:'.$this->rateLimitKey,
            $maxAttempts,
            static fn (): bool => true,
            $decaySeconds,
        );

        if (! $allowed) {
            throw new OkxApiException(
                'Local OKX request rate limit exceeded — slow down.',
                httpStatus: 429,
            );
        }
    }

    private function client(): PendingRequest
    {
        return Http::acceptJson()
            ->withHeaders([
                'Content-Type' => 'application/json',
                'User-Agent' => 'ZAINEX-InteliTrader/1.0',
            ])
            ->timeout((int) config('okx.timeout_seconds', 10));
    }
}
