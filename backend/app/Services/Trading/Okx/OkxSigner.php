<?php

// ZAINEX_LIVE_OKX_TRADING_V1
// Pure request-signing logic for OKX's v5 API — no network dependency,
// so the signature math itself is unit-testable without a real key.
// https://www.okx.com/docs-v5/en/#overview-rest-authentication

namespace App\Services\Trading\Okx;

use DateTimeImmutable;
use DateTimeZone;

final class OkxSigner
{
    public function timestamp(): string
    {
        return (new DateTimeImmutable('now', new DateTimeZone('UTC')))
            ->format('Y-m-d\TH:i:s.v\Z');
    }

    /**
     * Prehash = timestamp + METHOD + requestPath(+querystring) + body.
     * `requestPath` must include the leading "/api/v5/..." and, for GET
     * requests, the exact query string that will actually be sent — an
     * inconsistent query string here is the most common cause of OKX's
     * 401 / sCode 50113 "invalid signature" response.
     */
    public function sign(
        string $secret,
        string $timestamp,
        string $method,
        string $requestPath,
        string $body = '',
    ): string {
        $prehash = $timestamp.strtoupper($method).$requestPath.$body;

        return base64_encode(
            hash_hmac('sha256', $prehash, $secret, true),
        );
    }
}
