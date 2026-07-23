<?php

// ZAINEX_LIVE_OKX_TRADING_V1

namespace App\Http\Controllers\Api;

use App\Exceptions\ExchangeConnectionException;
use App\Exceptions\FuturesTradingException;
use App\Http\Controllers\Controller;
use App\Models\ExchangeConnection;
use App\Models\User;
use App\Services\Trading\Okx\ExchangeConnectionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Throwable;

final class ExchangeConnectionController extends Controller
{
    public function __construct(
        private readonly ExchangeConnectionService $service,
    ) {}

    public function connect(Request $request): JsonResponse
    {
        return $this->handle($request, function (User $user, string $requestId) use ($request): array {
            $body = $this->jsonBody($request);

            $connection = $this->service->connect(
                $user,
                (string) ($body['apiKey'] ?? ''),
                (string) ($body['apiSecret'] ?? ''),
                (string) ($body['passphrase'] ?? ''),
                (bool) ($body['isDemo'] ?? false),
                isset($body['label']) ? (string) $body['label'] : null,
                $requestId,
            );

            return [
                'ok' => true,
                'connection' => $this->connectionResource($connection),
            ];
        });
    }

    public function status(Request $request): JsonResponse
    {
        return $this->handle($request, function (User $user) use ($request): array {
            $connection = ExchangeConnection::query()
                ->where('user_id', $user->id)
                ->where('exchange', 'OKX')
                ->first();

            return [
                'ok' => true,
                'connection' => $connection === null ? null : $this->connectionResource($connection),
            ];
        });
    }

    public function disconnect(Request $request): JsonResponse
    {
        return $this->handle($request, function (User $user, string $requestId) use ($request): array {
            $body = $this->jsonBody($request);

            $this->service->disconnect(
                $user,
                (bool) ($body['force'] ?? false),
                $requestId,
            );

            return ['ok' => true];
        });
    }

    /**
     * @return array<string, mixed>
     */
    private function connectionResource(ExchangeConnection $connection): array
    {
        return [
            'exchange' => $connection->exchange,
            'label' => $connection->label,
            'isDemo' => (bool) $connection->is_demo,
            'status' => $connection->status,
            'maskedApiKey' => $connection->maskedApiKey(),
            'lastVerifiedAt' => $connection->last_verified_at?->toIso8601String(),
            'lastErrorCode' => $connection->last_error_code,
            'lastErrorMessage' => $connection->last_error_message,
        ];
    }

    /**
     * @param callable(User, string): array<string, mixed> $operation
     */
    private function handle(
        Request $request,
        callable $operation,
    ): JsonResponse {
        try {
            $this->authorizeInternalRequest($request);

            $email = trim((string) $request->header('X-Zainex-User-Email', ''));

            if ($email === '') {
                throw new FuturesTradingException(
                    'LIVE_TRADING_USER_REQUIRED',
                    'A verified ZAINEX account is required to manage an OKX connection.',
                    401,
                );
            }

            $user = User::query()
                ->whereRaw('LOWER(email) = ?', [strtolower($email)])
                ->first();

            if ($user === null) {
                throw new FuturesTradingException(
                    'LIVE_TRADING_USER_REQUIRED',
                    'A verified ZAINEX account is required to manage an OKX connection.',
                    401,
                );
            }

            $requestId = trim((string) $request->header('X-Zainex-Request-Id', ''));

            if (! Str::isUuid($requestId)) {
                $requestId = (string) Str::uuid();
            }

            $payload = $operation($user, $requestId);

            return response()
                ->json($payload)
                ->header('Cache-Control', 'no-store');
        } catch (FuturesTradingException|ExchangeConnectionException $exception) {
            $error = [
                'code' => $exception->errorCode,
                'message' => $exception->getMessage(),
            ];

            if ($exception->details !== []) {
                $error['details'] = $exception->details;
            }

            return response()
                ->json(['ok' => false, 'error' => $error], $exception->httpStatus)
                ->header('Cache-Control', 'no-store');
        } catch (Throwable $exception) {
            if (app()->environment('testing')) {
                throw $exception;
            }

            Log::error(
                'OKX exchange connection request failed.',
                [
                    'exception' => $exception::class,
                    'message' => $exception->getMessage(),
                    'path' => $request->path(),
                ],
            );

            return response()
                ->json(
                    [
                        'ok' => false,
                        'error' => [
                            'code' => 'INTERNAL_EXCHANGE_CONNECTION_ERROR',
                            'message' => 'The exchange connection service could not complete the request.',
                        ],
                    ],
                    500,
                )
                ->header('Cache-Control', 'no-store');
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function jsonBody(Request $request): array
    {
        if (! $request->isJson()) {
            throw new FuturesTradingException(
                'INVALID_CONTENT_TYPE',
                'The exchange connection request must use application/json.',
                415,
            );
        }

        $body = $request->json()->all();

        if (! is_array($body)) {
            throw new FuturesTradingException(
                'INVALID_REQUEST_BODY',
                'The exchange connection request must be a JSON object.',
                400,
            );
        }

        return $body;
    }

    private function authorizeInternalRequest(Request $request): void
    {
        $configuredToken = trim((string) config('intelibrain.internal_token', ''));

        if ($configuredToken === '') {
            throw new FuturesTradingException(
                'FUTURES_BACKEND_NOT_CONFIGURED',
                'The Laravel Futures trading backend is not configured.',
                503,
            );
        }

        $providedToken = trim((string) $request->header('X-Zainex-Internal-Token', ''));

        if ($providedToken === '' || ! hash_equals($configuredToken, $providedToken)) {
            throw new FuturesTradingException(
                'FUTURES_BACKEND_UNAUTHORIZED',
                'The Laravel Futures trading request is unauthorized.',
                401,
            );
        }
    }
}
