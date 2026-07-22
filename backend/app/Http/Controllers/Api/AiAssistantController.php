<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\LinksTradingAccountToUser;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use RuntimeException;
use Throwable;

// ZAINEX_GENERAL_AI_ASSISTANT_V1
// General-purpose "how do I use ZAINEX" assistant — distinct from the
// trading-signal AI controllers (FuturesAiSignalController etc.), which
// are constrained to structured BUY/SELL/WAIT output. This one just
// holds a plain conversation, grounded in a system prompt describing the
// platform, and explicitly refuses to give financial advice.

final class AiAssistantController extends Controller
{
    use LinksTradingAccountToUser;

    private const MAX_MESSAGES = 20;

    private const MAX_MESSAGE_LENGTH = 4000;

    public function chat(Request $request): JsonResponse
    {
        $guard = $this->guard($request);

        if ($guard !== null) {
            return $guard;
        }

        $validator = Validator::make($request->all(), [
            'messages' => ['required', 'array', 'min:1', 'max:'.self::MAX_MESSAGES],
            'messages.*.role' => ['required', 'string', 'in:user,assistant'],
            'messages.*.content' => ['required', 'string', 'max:'.self::MAX_MESSAGE_LENGTH],
        ]);

        if ($validator->fails()) {
            return $this->error(422, 'INVALID_ASSISTANT_REQUEST', $validator->errors()->first());
        }

        $sessionId = trim((string) $request->header('X-Zainex-Session-Id', ''));

        $this->linkAccountToUser($sessionId, $request->header('X-Zainex-User-Email'));

        $apiKey = trim((string) Config::get('intelibrain.openai_api_key', ''));
        $model = trim((string) Config::get('intelibrain.openai_model', ''));
        $baseUrl = rtrim((string) Config::get('intelibrain.openai_base_url', ''), '/');

        if ($apiKey === '' || $model === '' || $baseUrl === '') {
            return $this->error(503, 'ASSISTANT_NOT_CONFIGURED', 'The assistant is not configured yet.');
        }

        /** @var array<int, array{role: string, content: string}> $messages */
        $messages = $validator->validated()['messages'];

        $input = [
            [
                'role' => 'system',
                'content' => $this->systemPrompt(),
            ],
        ];

        foreach ($messages as $message) {
            $input[] = [
                'role' => $message['role'] === 'assistant' ? 'assistant' : 'user',
                'content' => $message['content'],
            ];
        }

        try {
            $response = Http::withToken($apiKey)
                ->acceptJson()
                ->asJson()
                ->timeout((int) Config::get('intelibrain.openai_timeout_seconds', 75))
                ->post($baseUrl.'/responses', [
                    'model' => $model,
                    'store' => false,
                    'max_output_tokens' => 900,
                    'reasoning' => [
                        'effort' => 'low',
                    ],
                    'input' => $input,
                ]);
        } catch (Throwable $exception) {
            report($exception);

            return $this->error(502, 'ASSISTANT_REQUEST_FAILED', 'Could not reach the assistant.');
        }

        if ($response->failed()) {
            report(new RuntimeException('AiAssistantController OpenAI request failed: '.$response->body()));

            return $this->error(502, 'ASSISTANT_REQUEST_FAILED', 'Could not reach the assistant.');
        }

        $reply = $this->extractOutputText((array) $response->json());

        if ($reply === '') {
            return $this->error(502, 'ASSISTANT_EMPTY_REPLY', 'The assistant returned an empty reply.');
        }

        return response()
            ->json([
                'ok' => true,
                'reply' => $reply,
            ])
            ->header('Cache-Control', 'no-store');
    }

    private function systemPrompt(): string
    {
        return implode("\n", [
            'You are the ZAINEX assistant, a helpful guide for the ZAINEX AI Intelitrade platform.',
            'ZAINEX is a trading terminal covering Crypto, Forex, and Stocks, with AI-assisted signals (InteliBrain),',
            'a wallet and AI-credits system, a referral program, and VIP subscription tiers (VIP 1 $5/mo, VIP 2 $15/mo, VIP 3 $45/mo)',
            'that unlock more AI models, higher signal limits, and priority features.',
            'Users can fund their wallet or subscribe via a GoTyme merchant transfer (manually verified) or an automated USDT crypto payment.',
            'The platform is moving toward live OKX exchange trading; be honest that some features are still being rolled out if asked directly, without volunteering internal implementation detail.',
            'Answer questions about how to use the platform: billing, wallet, strategies, referrals, signals, and account settings.',
            'You are not a financial advisor. Never recommend specific trades, price targets, or "buy/sell now" calls.',
            'If asked for financial advice, explain you can only help with using the platform, not trading decisions.',
            'Keep replies concise, friendly, and specific. Use plain text, no markdown headers.',
        ]);
    }

    /**
     * @param  array<string, mixed>  $payload
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

    private function guard(Request $request): ?JsonResponse
    {
        $expected = trim((string) Config::get('intelibrain.internal_token', ''));
        $provided = trim((string) $request->header('X-Zainex-Internal-Token', ''));

        if (
            $expected === '' ||
            $provided === '' ||
            ! hash_equals($expected, $provided)
        ) {
            return $this->error(401, 'FUTURES_BACKEND_UNAUTHORIZED', 'The Laravel Futures request is unauthorized.');
        }

        $sessionId = trim((string) $request->header('X-Zainex-Session-Id', ''));

        if (! Str::isUuid($sessionId)) {
            return $this->error(422, 'INVALID_DEMO_SESSION', 'A valid ZAINEX demo session is required.');
        }

        return null;
    }

    private function errorPayload(string $code, string $message): array
    {
        return [
            'ok' => false,
            'error' => [
                'code' => $code,
                'message' => $message,
            ],
        ];
    }

    private function error(int $status, string $code, string $message): JsonResponse
    {
        return response()
            ->json($this->errorPayload($code, $message), $status)
            ->header('Cache-Control', 'no-store');
    }
}
