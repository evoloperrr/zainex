<?php

declare(strict_types=1);

namespace App\Services\Payments;

use Illuminate\Support\Facades\Http;
use RuntimeException;

// ZAINEX_NOWPAYMENTS_SERVICE_V1

final class NowPaymentsService
{
    public function __construct(
        private readonly string $apiKey,
        private readonly string $baseUrl,
    ) {
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    public function createPayment(array $payload): array
    {
        $response = Http::withHeaders([
            'x-api-key' => $this->apiKey,
        ])
            ->acceptJson()
            ->timeout(20)
            ->post($this->baseUrl.'/payment', $payload);

        if ($response->failed()) {
            throw new RuntimeException(
                'NOWPayments create-payment request failed: '.$response->body(),
            );
        }

        return (array) $response->json();
    }

    /**
     * @return array<string, mixed>
     */
    public function getPaymentStatus(string $paymentId): array
    {
        $response = Http::withHeaders([
            'x-api-key' => $this->apiKey,
        ])
            ->acceptJson()
            ->timeout(15)
            ->get($this->baseUrl.'/payment/'.$paymentId);

        if ($response->failed()) {
            throw new RuntimeException(
                'NOWPayments payment-status request failed: '.$response->body(),
            );
        }

        return (array) $response->json();
    }

    /**
     * NOWPayments signs IPN callbacks with HMAC-SHA512 over the JSON
     * encoding of the payload with its keys sorted alphabetically at
     * every nesting level. The signature never covers the raw request
     * body as received (key order in the wire body is not guaranteed to
     * be sorted), so the payload must be decoded and re-sorted before
     * hashing rather than hashed as raw bytes.
     *
     * @param  array<string, mixed>  $payload
     */
    public static function verifyIpnSignature(
        array $payload,
        string $signature,
        string $ipnSecret,
    ): bool {
        if ($ipnSecret === '' || $signature === '') {
            return false;
        }

        $sorted = self::sortRecursively($payload);
        $encoded = json_encode($sorted, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

        if ($encoded === false) {
            return false;
        }

        $expected = hash_hmac('sha512', $encoded, $ipnSecret);

        return hash_equals($expected, $signature);
    }

    private static function sortRecursively(mixed $value): mixed
    {
        if (is_array($value)) {
            ksort($value);

            foreach ($value as $key => $item) {
                $value[$key] = self::sortRecursively($item);
            }
        }

        return $value;
    }
}
