<?php

// ZAINEX_DB_PHASE2B1_LARAVEL_FUTURES_ENGINE_V1_1
// ZAINEX_MULTI_SYMBOL_TRADING_V1

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

    /** @var list<string> */
    public const SUPPORTED_SYMBOLS = [
        'BTCUSDT',
        'ETHUSDT',
        'SOLUSDT',
        'BNBUSDT',
        'XRPUSDT',
        'ADAUSDT',
        'DOGEUSDT',
    ];

    /**
     * @return array{price: string, provider: string}
     */
    public function price(string $symbol): array
    {
        $symbol = strtoupper(trim($symbol));

        if (! in_array($symbol, self::SUPPORTED_SYMBOLS, true)) {
            throw new FuturesTradingException(
                'SYMBOL_NOT_SUPPORTED',
                "{$symbol} is not a supported trading symbol.",
                400,
                ['supportedSymbols' => self::SUPPORTED_SYMBOLS],
            );
        }

        $providers = [
            fn (): array => $this->fromBinance($symbol),
            fn (): array => $this->fromOkx($symbol),
            fn (): array => $this->fromBybit($symbol),
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
            "All configured {$symbol} market-price providers are unavailable.",
            502,
            ['providersTried' => 3, 'failures' => $failures],
        );
    }

    /**
     * @deprecated Use price('BTCUSDT') instead.
     * @return array{price: string, provider: string}
     */
    public function btcUsdt(): array
    {
        return $this->price('BTCUSDT');
    }

    private function toOkxInstrumentId(string $symbol): string
    {
        foreach (['USDT', 'USDC', 'USD', 'BTC', 'ETH'] as $quote) {
            if (
                str_ends_with($symbol, $quote) &&
                strlen($symbol) > strlen($quote)
            ) {
                $base = substr($symbol, 0, -strlen($quote));

                return "{$base}-{$quote}";
            }
        }

        return $symbol;
    }

    /**
     * @return array{price: string, provider: string}
     */
    private function fromBinance(string $symbol): array
    {
        $payload = $this->client()
            ->get(
                'https://data-api.binance.vision/api/v3/ticker/price',
                ['symbol' => $symbol],
            )
            ->throw()
            ->json();

        return [
            'price' => $this->normalizePrice(
                is_array($payload) ? ($payload['price'] ?? null) : null,
                'Binance',
                $symbol,
            ),
            'provider' => 'binance-public',
        ];
    }

    /**
     * @return array{price: string, provider: string}
     */
    private function fromOkx(string $symbol): array
    {
        $payload = $this->client()
            ->get(
                'https://www.okx.com/api/v5/market/ticker',
                ['instId' => $this->toOkxInstrumentId($symbol)],
            )
            ->throw()
            ->json();

        $price = is_array($payload)
            ? data_get($payload, 'data.0.last')
            : null;

        return [
            'price' => $this->normalizePrice($price, 'OKX', $symbol),
            'provider' => 'okx-public',
        ];
    }

    /**
     * @return array{price: string, provider: string}
     */
    private function fromBybit(string $symbol): array
    {
        $payload = $this->client()
            ->get(
                'https://api.bybit.com/v5/market/tickers',
                [
                    'category' => 'spot',
                    'symbol' => $symbol,
                ],
            )
            ->throw()
            ->json();

        $price = is_array($payload)
            ? data_get($payload, 'result.list.0.lastPrice')
            : null;

        return [
            'price' => $this->normalizePrice($price, 'Bybit', $symbol),
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

    private function normalizePrice(mixed $value, string $provider, string $symbol): string
    {
        if (! is_string($value) && ! is_int($value) && ! is_float($value)) {
            throw new FuturesTradingException(
                'INVALID_MARKET_PRICE',
                "{$provider} returned an invalid {$symbol} market price.",
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
                "{$provider} returned an invalid {$symbol} market price.",
                502,
                ['provider' => $provider],
            );
        }

        if ($price->isLessThanOrEqualTo(BigDecimal::of('0'))) {
            throw new FuturesTradingException(
                'INVALID_MARKET_PRICE',
                "{$provider} returned a non-positive {$symbol} market price.",
                502,
                ['provider' => $provider],
            );
        }

        return (string) $price;
    }
}
