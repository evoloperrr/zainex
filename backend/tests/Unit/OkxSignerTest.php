<?php

// ZAINEX_LIVE_OKX_TRADING_V1

namespace Tests\Unit;

use App\Services\Trading\Okx\OkxSigner;
use Tests\TestCase;

final class OkxSignerTest extends TestCase
{
    /**
     * Expected value computed independently of OkxSigner (plain
     * hash_hmac('sha256', ..., true) + base64_encode against the same
     * fixed inputs), per OKX's documented v5 REST signing scheme:
     * base64(hmac_sha256(secret, timestamp + METHOD + requestPath + body)).
     * https://www.okx.com/docs-v5/en/#overview-rest-authentication
     */
    public function test_sign_matches_independently_computed_hmac_sha256_base64(): void
    {
        $secret = 'E65791DD9A0EB1BCA45D10D1AF6EE423';
        $timestamp = '2021-01-01T00:00:00.000Z';
        $method = 'GET';
        $requestPath = '/api/v5/account/balance?ccy=USDT';

        $expected = base64_encode(
            hash_hmac(
                'sha256',
                $timestamp.$method.$requestPath,
                $secret,
                true,
            ),
        );

        self::assertSame(
            'RbvPCJBzo0G8p0H1ITfpsfH1E4ABTwfuTFzUnxToTGU=',
            $expected,
        );

        $signer = new OkxSigner();

        self::assertSame(
            $expected,
            $signer->sign($secret, $timestamp, $method, $requestPath),
        );
    }

    public function test_sign_uppercases_method_and_includes_body(): void
    {
        $secret = 'test-secret';
        $timestamp = '2021-01-01T00:00:00.000Z';
        $requestPath = '/api/v5/trade/order';
        $body = '{"instId":"BTC-USDT-SWAP"}';

        $signer = new OkxSigner();

        self::assertSame(
            $signer->sign($secret, $timestamp, 'POST', $requestPath, $body),
            $signer->sign($secret, $timestamp, 'post', $requestPath, $body),
        );

        self::assertNotSame(
            $signer->sign($secret, $timestamp, 'POST', $requestPath, ''),
            $signer->sign($secret, $timestamp, 'POST', $requestPath, $body),
        );
    }

    public function test_timestamp_is_iso8601_utc_with_milliseconds(): void
    {
        $signer = new OkxSigner();

        self::assertMatchesRegularExpression(
            '/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/',
            $signer->timestamp(),
        );
    }
}
