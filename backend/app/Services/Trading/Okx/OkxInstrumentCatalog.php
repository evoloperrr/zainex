<?php

// ZAINEX_LIVE_OKX_TRADING_V1
// Perpetual-swap instrument metadata from OKX's PUBLIC (unauthenticated)
// endpoint. Deliberately separate from FuturesMarketPriceService's
// spot-format "BTC-USDT" ticker mapping — swaps use "BTC-USDT-SWAP" and
// are sized in contracts (ctVal/lotSz/minSz), never assumed to be 1:1
// with base-asset quantity.

namespace App\Services\Trading\Okx;

use App\Exceptions\OkxApiException;
use App\Services\Trading\FuturesMarketPriceService;
use Brick\Math\BigDecimal;
use Brick\Math\RoundingMode;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Throwable;

final class OkxInstrumentCatalog
{
    private const CACHE_KEY = 'okx:instruments:swap';

    public function toInstrumentId(string $symbol): string
    {
        $symbol = strtoupper(trim($symbol));

        if (! in_array($symbol, FuturesMarketPriceService::SUPPORTED_SYMBOLS, true)) {
            throw new OkxApiException(
                "Unsupported symbol for live trading: {$symbol}.",
                httpStatus: 422,
            );
        }

        // Every supported symbol today is a "<BASE>USDT" pair.
        $base = substr($symbol, 0, -4);

        return "{$base}-USDT-SWAP";
    }

    /**
     * @return array{ctVal: string, lotSz: string, minSz: string, tickSz: string, lever: string}
     */
    public function instrument(string $instId): array
    {
        $all = $this->allInstruments();

        if (! isset($all[$instId])) {
            throw new OkxApiException(
                "OKX instrument metadata not found for {$instId}.",
                httpStatus: 502,
            );
        }

        return $all[$instId];
    }

    public function contractsForQuantity(
        string $instId,
        BigDecimal $baseQty,
    ): BigDecimal {
        $meta = $this->instrument($instId);

        $ctVal = BigDecimal::of($meta['ctVal']);
        $lotSz = BigDecimal::of($meta['lotSz']);
        $minSz = BigDecimal::of($meta['minSz']);

        $rawContracts = $baseQty->dividedBy(
            $ctVal,
            8,
            RoundingMode::Down,
        );

        $lots = $rawContracts
            ->dividedBy($lotSz, 0, RoundingMode::Down)
            ->multipliedBy($lotSz);

        return $lots->isLessThan($minSz) ? $minSz : $lots;
    }

    /**
     * @return array<string, array{ctVal: string, lotSz: string, minSz: string, tickSz: string, lever: string}>
     */
    private function allInstruments(): array
    {
        return Cache::remember(
            self::CACHE_KEY,
            (int) config('okx.instrument_cache_ttl_seconds', 3600),
            function (): array {
                try {
                    $response = $this->client()->get(
                        config('okx.base_url').'/api/v5/public/instruments',
                        ['instType' => 'SWAP'],
                    );
                } catch (Throwable $exception) {
                    throw new OkxApiException(
                        'Could not reach OKX public instruments endpoint: '.$exception->getMessage(),
                        httpStatus: 502,
                    );
                }

                $payload = $response->json();

                if (
                    ! is_array($payload)
                    || (string) ($payload['code'] ?? '') !== '0'
                    || ! is_array($payload['data'] ?? null)
                ) {
                    throw new OkxApiException(
                        'Unexpected response from OKX public instruments endpoint.',
                        httpStatus: 502,
                    );
                }

                $map = [];

                foreach ($payload['data'] as $entry) {
                    if (! is_array($entry) || ! isset($entry['instId'])) {
                        continue;
                    }

                    $map[(string) $entry['instId']] = [
                        'ctVal' => (string) ($entry['ctVal'] ?? '1'),
                        'lotSz' => (string) ($entry['lotSz'] ?? '1'),
                        'minSz' => (string) ($entry['minSz'] ?? '1'),
                        'tickSz' => (string) ($entry['tickSz'] ?? '0.1'),
                        'lever' => (string) ($entry['lever'] ?? '1'),
                    ];
                }

                return $map;
            },
        );
    }

    private function client(): PendingRequest
    {
        return Http::acceptJson()
            ->withHeaders([
                'User-Agent' => 'ZAINEX-InteliTrader/1.0',
            ])
            ->timeout((int) config('okx.timeout_seconds', 10))
            ->retry(1, 150, throw: false);
    }
}
