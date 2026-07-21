<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Throwable;

final class SpotAiSignalController extends Controller
{
    private const ASSET_LABELS = [
        'crypto' => 'BTC/USDT',
        'forex' => 'EUR/USD',
        'stocks' => 'NVDA',
    ];

    public function __invoke(Request $request): JsonResponse
    {
        $expectedToken = (string) config('intelibrain.internal_token', '');

        $providedToken = (string) $request->header(
            'X-Zainex-Internal-Token',
            '',
        );

        if (
            $expectedToken === '' ||
            $providedToken === '' ||
            ! hash_equals($expectedToken, $providedToken)
        ) {
            return $this->error(
                'INTELIBRAIN_UNAUTHORIZED',
                'InteliBrain request is unauthorized.',
                401,
            );
        }

        $validated = $request->validate([
            'assetClass' => ['required', 'string', 'in:crypto,forex,stocks'],
            'timeframe' => ['nullable', 'string'],
            'candles' => ['required', 'array', 'min:100'],
            'candles.*.time' => ['required', 'numeric'],
            'candles.*.open' => ['required', 'numeric'],
            'candles.*.high' => ['required', 'numeric'],
            'candles.*.low' => ['required', 'numeric'],
            'candles.*.close' => ['required', 'numeric'],
        ]);

        $assetClass = (string) $validated['assetClass'];
        $timeframe = (string) ($validated['timeframe'] ?? '1h');
        $label = self::ASSET_LABELS[$assetClass] ?? $assetClass;

        try {
            $candles = array_map(
                static fn (array $row): array => [
                    'time' => (int) $row['time'],
                    'open' => (float) $row['open'],
                    'high' => (float) $row['high'],
                    'low' => (float) $row['low'],
                    'close' => (float) $row['close'],
                ],
                $validated['candles'],
            );

            $snapshot = $this->calculateSnapshot(
                $candles,
                $assetClass,
                $timeframe,
            );

            $ai = $this->requestOpenAI(
                $snapshot,
                $label,
            );

            $recommendation = (string) $ai['recommendation'];

            return response()->json([
                'ok' => true,
                'analysis' => [
                    'assetClass' => $assetClass,
                    'symbol' => $label,
                    'timeframe' => $timeframe,
                    'recommendation' => $recommendation,
                    'trend' => $snapshot['trend'],
                    'confidence' => $ai['confidence'],
                    'price' => $snapshot['price'],
                    'entry' => $ai['entry'],
                    'stopLoss' => $ai['stopLoss'],
                    'takeProfit' => $ai['takeProfit'],
                    'riskLevel' => $snapshot['riskLevel'],
                    'signalScore' => $snapshot['signalScore'],
                    'reasons' => $ai['reasons'],
                    'warnings' => $ai['warnings'],
                    'indicators' => $snapshot['indicators'],
                    'candleCount' => $snapshot['candleCount'],
                    'model' => (string) config('intelibrain.openai_model'),
                    'source' => $ai['source'],
                    'generatedAt' => now()->toIso8601String(),
                    'autoExecute' => false,
                    'userApprovalRequired' => true,
                    'disclaimer' =>
                        'AI signal only. The user decides whether to place a paper spot order.',
                ],
            ]);
        }
        catch (Throwable $error) {
            Log::warning(
                'Spot InteliBrain analysis failed.',
                [
                    'assetClass' => $assetClass,
                    'exception' => $error::class,
                    'message' => mb_substr($error->getMessage(), 0, 240),
                ],
            );

            return $this->error(
                'INTELIBRAIN_ANALYSIS_FAILED',
                'Spot AI analysis is temporarily unavailable.',
                503,
            );
        }
    }

    /**
     * @param array<int, array{time:int,open:float,high:float,low:float,close:float}> $candles
     * @return array<string, mixed>
     */
    private function calculateSnapshot(
        array $candles,
        string $assetClass,
        string $timeframe,
    ): array {
        $closes = array_map(
            static fn (array $candle): float => $candle['close'],
            $candles,
        );

        $highs = array_map(
            static fn (array $candle): float => $candle['high'],
            $candles,
        );

        $lows = array_map(
            static fn (array $candle): float => $candle['low'],
            $candles,
        );

        $ema9Series = $this->emaSeries($closes, 9);
        $ema21Series = $this->emaSeries($closes, 21);
        $ema12Series = $this->emaSeries($closes, 12);
        $ema26Series = $this->emaSeries($closes, 26);

        $macdSeries = [];

        foreach ($ema12Series as $index => $ema12) {
            $macdSeries[] = $ema12 - $ema26Series[$index];
        }

        $macdSignalSeries = $this->emaSeries($macdSeries, 9);

        $price = (float) end($closes);
        $ema9 = (float) end($ema9Series);
        $ema21 = (float) end($ema21Series);
        $macd = (float) end($macdSeries);
        $macdSignal = (float) end($macdSignalSeries);
        $macdHistogram = $macd - $macdSignal;
        $rsi = $this->rsi($closes, 14);
        $atr = $this->atr($candles, 14);

        $support = min(array_slice($lows, -50));
        $resistance = max(array_slice($highs, -50));

        $trend = match (true) {
            $price > $ema21 && $ema9 > $ema21 => 'BULLISH',
            $price < $ema21 && $ema9 < $ema21 => 'BEARISH',
            default => 'SIDEWAYS',
        };

        $score = 0;

        $score += match ($trend) {
            'BULLISH' => 30,
            'BEARISH' => -30,
            default => 0,
        };

        $score += match (true) {
            $ema9 > $ema21 => 20,
            $ema9 < $ema21 => -20,
            default => 0,
        };

        $score += match (true) {
            $rsi >= 52 && $rsi <= 68 => 15,
            $rsi >= 32 && $rsi <= 48 => -15,
            $rsi > 72 => -8,
            $rsi < 28 => 8,
            default => 0,
        };

        $score += match (true) {
            $macdHistogram > 0 => 20,
            $macdHistogram < 0 => -20,
            default => 0,
        };

        $score = max(-100, min(100, $score));

        $allowed = match (true) {
            $score >= 25 => ['BUY', 'WAIT'],
            $score <= -25 => ['SELL', 'WAIT'],
            default => ['WAIT'],
        };

        $confidence = max(
            50,
            min(95, (int) round(50 + abs($score) * 0.45)),
        );

        $atrPercent = $price > 0 ? ($atr / $price) * 100 : 0.0;

        $riskLevel = match (true) {
            $atrPercent < ($assetClass === 'forex' ? 0.3 : 1.0) => 'LOW',
            $atrPercent < ($assetClass === 'forex' ? 0.6 : 2.0) => 'MEDIUM',
            default => 'HIGH',
        };

        $stopDistance = max($atr * 1.5, $price * 0.003);

        $longStop = max($support, $price - $stopDistance);

        $longRisk = max(0.01, $price - $longStop);

        return [
            'assetClass' => $assetClass,
            'timeframe' => $timeframe,
            'price' => round($price, 5),
            'trend' => $trend,
            'signalScore' => $score,
            'deterministicConfidence' => $confidence,
            'allowedRecommendations' => $allowed,
            'riskLevel' => $riskLevel,
            'candleCount' => count($candles),
            'indicators' => [
                'ema9' => round($ema9, 5),
                'ema21' => round($ema21, 5),
                'rsi14' => round($rsi, 2),
                'macdHistogram' => round($macdHistogram, 6),
                'atr14' => round($atr, 5),
                'support' => round($support, 5),
                'resistance' => round($resistance, 5),
            ],
            'levels' => [
                'entry' => round($price, 5),
                'stopLoss' => round($longStop, 5),
                'takeProfit' => round($price + $longRisk * 2, 5),
            ],
        ];
    }

    /**
     * @param array<string, mixed> $snapshot
     * @return array<string, mixed>
     */
    private function requestOpenAI(array $snapshot, string $label): array
    {
        if (! (bool) config('intelibrain.enabled', true)) {
            return $this->fallback($snapshot, 'InteliBrain is disabled.');
        }

        $apiKey = (string) config('intelibrain.openai_api_key', '');
        $model = (string) config('intelibrain.openai_model', '');

        if ($apiKey === '' || $model === '') {
            return $this->fallback($snapshot, 'OpenAI configuration is incomplete.');
        }

        $schema = [
            'type' => 'object',
            'additionalProperties' => false,
            'properties' => [
                'recommendation' => [
                    'type' => 'string',
                    'enum' => ['BUY', 'SELL', 'WAIT'],
                ],
                'confidence' => [
                    'type' => 'integer',
                    'minimum' => 0,
                    'maximum' => 100,
                ],
                'reasons' => [
                    'type' => 'array',
                    'minItems' => 2,
                    'maxItems' => 5,
                    'items' => ['type' => 'string'],
                ],
                'warnings' => [
                    'type' => 'array',
                    'maxItems' => 5,
                    'items' => ['type' => 'string'],
                ],
            ],
            'required' => ['recommendation', 'confidence', 'reasons', 'warnings'],
        ];

        $response = Http::withToken($apiKey)
            ->acceptJson()
            ->asJson()
            ->timeout((int) config('intelibrain.openai_timeout_seconds', 75))
            ->post(
                (string) config('intelibrain.openai_base_url').'/responses',
                [
                    'model' => $model,
                    'store' => false,
                    'max_output_tokens' => 2000,
                    'reasoning' => ['effort' => 'low'],
                    'input' => [
                        [
                            'role' => 'system',
                            'content' => implode("\n", [
                                'You are InteliBrain Spot V1, a conservative spot market analyst for '.$label.'.',
                                'Interpret only the backend-computed indicators.',
                                'Never calculate missing indicators.',
                                'Never invent market facts.',
                                'Never execute or request an order.',
                                'BUY means accumulate/open a spot position.',
                                'SELL means reduce or exit an existing spot position.',
                                'WAIT means no trade.',
                                'You may always choose WAIT.',
                                'Never choose outside allowedRecommendations.',
                                'Return concise structured output only.',
                            ]),
                        ],
                        [
                            'role' => 'user',
                            'content' => json_encode(
                                $snapshot,
                                JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES,
                            ),
                        ],
                    ],
                    'text' => [
                        'format' => [
                            'type' => 'json_schema',
                            'name' => 'intelibrain_spot_signal',
                            'strict' => true,
                            'schema' => $schema,
                        ],
                    ],
                ],
            );

        if (! $response->successful()) {
            Log::warning(
                'OpenAI Spot signal request failed.',
                ['status' => $response->status()],
            );

            return $this->fallback($snapshot, 'GPT analysis is unavailable. WAIT enforced.');
        }

        $payload = $response->json();

        if (! is_array($payload)) {
            return $this->fallback($snapshot, 'GPT returned an invalid payload.');
        }

        $outputText = $this->extractOutputText($payload);

        if ($outputText === '') {
            return $this->fallback($snapshot, 'GPT returned no structured signal.');
        }

        $decoded = json_decode($outputText, true, 512, JSON_THROW_ON_ERROR);

        if (! is_array($decoded)) {
            return $this->fallback($snapshot, 'GPT returned invalid structured data.');
        }

        $recommendation = strtoupper((string) ($decoded['recommendation'] ?? 'WAIT'));

        $allowed = $snapshot['allowedRecommendations'] ?? ['WAIT'];

        $warnings = $this->stringList($decoded['warnings'] ?? [], 5);

        if (! is_array($allowed) || ! in_array($recommendation, $allowed, true)) {
            $recommendation = 'WAIT';
            $warnings[] = 'GPT signal was blocked by the deterministic safety gate.';
        }

        $backendConfidence = (int) ($snapshot['deterministicConfidence'] ?? 50);

        $modelConfidence = max(0, min(100, (int) ($decoded['confidence'] ?? 50)));

        $confidence = max(
            $backendConfidence - 5,
            min($backendConfidence + 5, (int) round(($backendConfidence + $modelConfidence) / 2)),
        );

        $levels = $snapshot['levels'];

        $reasons = $this->stringList($decoded['reasons'] ?? [], 5);

        if (count($reasons) < 2) {
            return $this->fallback($snapshot, 'GPT reasoning was incomplete.');
        }

        return [
            'recommendation' => $recommendation,
            'confidence' => $confidence,
            'entry' => (float) $levels['entry'],
            'stopLoss' => $recommendation === 'WAIT' ? 0.0 : (float) $levels['stopLoss'],
            'takeProfit' => $recommendation === 'WAIT' ? 0.0 : (float) $levels['takeProfit'],
            'reasons' => $reasons,
            'warnings' => array_values(array_unique($warnings)),
            'source' => 'openai',
        ];
    }

    /**
     * @param array<string, mixed> $payload
     */
    private function extractOutputText(array $payload): string
    {
        if (isset($payload['output_text']) && is_string($payload['output_text'])) {
            return trim($payload['output_text']);
        }

        $output = $payload['output'] ?? [];

        if (! is_array($output)) {
            return '';
        }

        foreach ($output as $item) {
            if (! is_array($item)) {
                continue;
            }

            $content = $item['content'] ?? [];

            if (! is_array($content)) {
                continue;
            }

            foreach ($content as $part) {
                if (
                    is_array($part) &&
                    ($part['type'] ?? null) === 'output_text' &&
                    isset($part['text']) &&
                    is_string($part['text'])
                ) {
                    return trim($part['text']);
                }
            }
        }

        return '';
    }

    /**
     * @param array<string, mixed> $snapshot
     * @return array<string, mixed>
     */
    private function fallback(array $snapshot, string $warning): array
    {
        return [
            'recommendation' => 'WAIT',
            'confidence' => (int) ($snapshot['deterministicConfidence'] ?? 50),
            'entry' => (float) ($snapshot['price'] ?? 0),
            'stopLoss' => 0.0,
            'takeProfit' => 0.0,
            'reasons' => [
                'The deterministic Spot engine completed its analysis.',
                'A conservative WAIT signal was enforced for safety.',
            ],
            'warnings' => [$warning],
            'source' => 'fallback',
        ];
    }

    /**
     * @return array<int, string>
     */
    private function stringList(mixed $value, int $maximum): array
    {
        if (! is_array($value)) {
            return [];
        }

        $items = [];

        foreach ($value as $item) {
            if (! is_string($item)) {
                continue;
            }

            $item = trim($item);

            if ($item === '') {
                continue;
            }

            $items[] = mb_substr($item, 0, 240);

            if (count($items) >= $maximum) {
                break;
            }
        }

        return $items;
    }

    /**
     * @param array<int, float|int> $values
     * @return array<int, float>
     */
    private function emaSeries(array $values, int $period): array
    {
        $multiplier = 2 / ($period + 1);

        $ema = (float) $values[0];
        $result = [$ema];

        for ($index = 1; $index < count($values); $index++) {
            $value = (float) $values[$index];

            $ema = (($value - $ema) * $multiplier) + $ema;

            $result[] = $ema;
        }

        return $result;
    }

    /**
     * @param array<int, float|int> $closes
     */
    private function rsi(array $closes, int $period): float
    {
        $sample = array_slice($closes, -($period + 1));

        $gains = 0.0;
        $losses = 0.0;

        for ($index = 1; $index < count($sample); $index++) {
            $change = (float) $sample[$index] - (float) $sample[$index - 1];

            if ($change > 0) {
                $gains += $change;
            }
            else {
                $losses += abs($change);
            }
        }

        $averageGain = $gains / $period;
        $averageLoss = $losses / $period;

        if ($averageLoss === 0.0) {
            return 100.0;
        }

        $relativeStrength = $averageGain / $averageLoss;

        return 100 - (100 / (1 + $relativeStrength));
    }

    /**
     * @param array<int, array{time:int,open:float,high:float,low:float,close:float}> $candles
     */
    private function atr(array $candles, int $period): float
    {
        $ranges = [];

        for ($index = 1; $index < count($candles); $index++) {
            $current = $candles[$index];
            $previous = $candles[$index - 1];

            $high = $current['high'];
            $low = $current['low'];
            $previousClose = $previous['close'];

            $ranges[] = max(
                $high - $low,
                abs($high - $previousClose),
                abs($low - $previousClose),
            );
        }

        $sample = array_slice($ranges, -$period);

        return array_sum($sample) / max(1, count($sample));
    }

    private function error(string $code, string $message, int $status): JsonResponse
    {
        return response()->json(
            [
                'ok' => false,
                'error' => [
                    'code' => $code,
                    'message' => $message,
                ],
            ],
            $status,
        );
    }
}
