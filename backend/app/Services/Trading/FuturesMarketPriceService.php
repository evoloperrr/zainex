<?php

// ZAINEX_DB_PHASE2B1_LARAVEL_FUTURES_ENGINE_V1_1

namespace App\Services\Trading;

use App\Exceptions\FuturesTradingException;
use Brick\Math\BigDecimal;
use Brick\Math\RoundingMode;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Facades\Http;
use Throwable;

final class FuturesMarketPriceService
{
    private const TIMEOUT_SECONDS = 7;

    /**
     * @return array{price: string, provider: string}
     */
    public function btcUsdt(): array
    {
        $providers = [
            fn (): array => $this->fromBinance(),
            fn (): array => $this->fromOkx(),
            fn (): array => $this->fromBybit(),
        ];

        $failures = [];

        foreach ($providers as $provider) {
            try {
                return $provider();
            } catch (Throwable $exception) {
                $failures[] = $exception->getMessage();
            }
        }

        throw new FuturesTradingException(
            'PRICE_PROVIDER_UNAVAILABLE',
            'All configured BTCUSDT market-price providers are unavailable.',
            502,
            ['providersTried' => 3, 'failures' => $failures],
        );
    }

    /**
     * @return array{price: string, provider: string}
     */
    private function fromBinance(): array
    {
        $payload = $this->client()
            ->get(
                'https://data-api.binance.vision/api/v3/ticker/price',
                ['symbol' => 'BTCUSDT'],
            )
            ->throw()
            ->json();

        return [
            'price' => $this->normalizePrice(
                is_array($payload) ? ($payload['price'] ?? null) : null,
                'Binance',
            ),
            'provider' => 'binance-public',
        ];
    }

    /**
     * @return array{price: string, provider: string}
     */
    private function fromOkx(): array
    {
        $payload = $this->client()
            ->get(
                'https://www.okx.com/api/v5/market/ticker',
                ['instId' => 'BTC-USDT'],
            )
            ->throw()
            ->json();

        $price = is_array($payload)
            ? data_get($payload, 'data.0.last')
            : null;

        return [
            'price' => $this->normalizePrice($price, 'OKX'),
            'provider' => 'okx-public',
        ];
    }

    /**
     * @return array{price: string, provider: string}
     */
    private function fromBybit(): array
    {
        $payload = $this->client()
            ->get(
                'https://api.bybit.com/v5/market/tickers',
                [
                    'category' => 'spot',
                    'symbol' => 'BTCUSDT',
                ],
            )
            ->throw()
            ->json();

        $price = is_array($payload)
            ? data_get($payload, 'result.list.0.lastPrice')
            : null;

        return [
            'price' => $this->normalizePrice($price, 'Bybit'),
            'provider' => 'bybit-public',
        ];
    }

    private function client(): PendingRequest
    {
        return Http::acceptJson()
            ->withHeaders([
                'User-Agent' => 'ZAINEX-InteliTrader/1.0',
            ])
            ->timeout(self::TIMEOUT_SECONDS)
            ->retry(1, 150, throw: false);
    }

    private function normalizePrice(mixed $value, string $provider): string
    {
        if (! is_string($value) && ! is_int($value) && ! is_float($value)) {
            throw new FuturesTradingException(
                'INVALID_MARKET_PRICE',
                "{$provider} returned an invalid BTCUSDT market price.",
                502,
                ['provider' => $provider],
            );
        }

        try {
            $price = BigDecimal::of((string) $value)
                ->toScale(8, RoundingMode::HalfUp);
        } catch (Throwable) {
            throw new FuturesTradingException(
                'INVALID_MARKET_PRICE',
                "{$provider} returned an invalid BTCUSDT market price.",
                502,
                ['provider' => $provider],
            );
        }

        if ($price->isLessThanOrEqualTo(BigDecimal::of('0'))) {
            throw new FuturesTradingException(
                'INVALID_MARKET_PRICE',
                "{$provider} returned a non-positive BTCUSDT market price.",
                502,
                ['provider' => $provider],
            );
        }

        return (string) $price;
    }
}
