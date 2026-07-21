<?php

// ZAINEX_SPOT_DB_PERSISTENCE_V1

namespace App\Http\Controllers\Api;

use App\Exceptions\SpotTradingException;
use App\Http\Controllers\Api\Concerns\LinksTradingAccountToUser;
use App\Http\Controllers\Controller;
use App\Services\Trading\SpotPaperTradingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Throwable;

final class SpotPaperTradingController extends Controller
{
    use LinksTradingAccountToUser;

    public function __construct(
        private readonly SpotPaperTradingService $service,
    ) {}

    public function account(Request $request): JsonResponse
    {
        return $this->handle(
            $request,
            fn (string $sessionId, string $requestId): array => [
                'ok' => true,
                'mode' => 'paper',
                'liveTrading' => false,
                'account' => $this->service->account(
                    $sessionId,
                    $requestId,
                ),
            ],
        );
    }

    public function orders(Request $request): JsonResponse
    {
        return $this->handle(
            $request,
            fn (string $sessionId, string $requestId): array => [
                'ok' => true,
                'mode' => 'paper',
                'liveTrading' => false,
                'orders' => $this->service->orders(
                    $sessionId,
                    $requestId,
                ),
            ],
        );
    }

    public function positions(Request $request): JsonResponse
    {
        return $this->handle(
            $request,
            fn (string $sessionId, string $requestId): array => [
                'ok' => true,
                'mode' => 'paper',
                'liveTrading' => false,
                'positions' => $this->service->positions(
                    $sessionId,
                    $requestId,
                ),
            ],
        );
    }

    public function buy(Request $request): JsonResponse
    {
        return $this->handle(
            $request,
            function (
                string $sessionId,
                string $requestId,
            ) use ($request): array {
                $body = $this->jsonBody($request);
                $result = $this->service->buy(
                    $sessionId,
                    $requestId,
                    $body,
                    $request->ip(),
                    $request->userAgent(),
                );

                return [
                    'ok' => true,
                    'mode' => 'paper',
                    'liveTrading' => false,
                    'result' => $result,
                    '_status' => $result['idempotentReplay']
                        ? 200
                        : 201,
                ];
            },
        );
    }

    public function sell(Request $request): JsonResponse
    {
        return $this->handle(
            $request,
            function (
                string $sessionId,
                string $requestId,
            ) use ($request): array {
                $body = $this->jsonBody($request);
                $result = $this->service->sell(
                    $sessionId,
                    $requestId,
                    $body,
                    $request->ip(),
                    $request->userAgent(),
                );

                return [
                    'ok' => true,
                    'mode' => 'paper',
                    'liveTrading' => false,
                    'result' => $result,
                    '_status' => $result['idempotentReplay']
                        ? 200
                        : 201,
                ];
            },
        );
    }

    /**
     * @param callable(string, string): array<string, mixed> $operation
     */
    private function handle(
        Request $request,
        callable $operation,
    ): JsonResponse {
        try {
            $this->authorizeInternalRequest($request);

            $sessionId = trim(
                (string) $request->header(
                    'X-Zainex-Session-Id',
                    '',
                ),
            );

            if (! Str::isUuid($sessionId)) {
                throw new SpotTradingException(
                    'INVALID_DEMO_SESSION',
                    'A valid ZAINEX demo session is required.',
                    400,
                );
            }

            $requestId = trim(
                (string) $request->header(
                    'X-Zainex-Request-Id',
                    '',
                ),
            );

            if (! Str::isUuid($requestId)) {
                $requestId = (string) Str::uuid();
            }

            $this->linkAccountToUser(
                $sessionId,
                $request->header('X-Zainex-User-Email'),
            );

            $payload = $operation($sessionId, $requestId);
            $status = (int) ($payload['_status'] ?? 200);
            unset($payload['_status']);

            return response()
                ->json($payload, $status)
                ->header('Cache-Control', 'no-store');
        } catch (SpotTradingException $exception) {
            $error = [
                'code' => $exception->errorCode,
                'message' => $exception->getMessage(),
            ];

            if ($exception->details !== []) {
                $error['details'] = $exception->details;
            }

            return response()
                ->json(
                    [
                        'ok' => false,
                        'error' => $error,
                    ],
                    $exception->httpStatus,
                )
                ->header('Cache-Control', 'no-store');
        } catch (Throwable $exception) {
            if (app()->environment('testing')) {
                throw $exception;
            }

            Log::error(
                'Laravel Spot paper trading request failed.',
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
                            'code' => 'INTERNAL_TRADING_ERROR',
                            'message' => 'The Spot trading service could not complete the request.',
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
            throw new SpotTradingException(
                'INVALID_CONTENT_TYPE',
                'The Spot request must use application/json.',
                415,
            );
        }

        $body = $request->json()->all();

        if (! is_array($body)) {
            throw new SpotTradingException(
                'INVALID_REQUEST_BODY',
                'The Spot request must be a JSON object.',
                400,
            );
        }

        return $body;
    }

    private function authorizeInternalRequest(Request $request): void
    {
        $configuredToken = trim(
            (string) config(
                'intelibrain.internal_token',
                '',
            ),
        );

        if ($configuredToken === '') {
            throw new SpotTradingException(
                'SPOT_BACKEND_NOT_CONFIGURED',
                'The Laravel Spot trading backend is not configured.',
                503,
            );
        }

        $providedToken = trim(
            (string) $request->header(
                'X-Zainex-Internal-Token',
                '',
            ),
        );

        if (
            $providedToken === '' ||
            ! hash_equals(
                $configuredToken,
                $providedToken,
            )
        ) {
            throw new SpotTradingException(
                'SPOT_BACKEND_UNAUTHORIZED',
                'The Laravel Spot trading request is unauthorized.',
                401,
            );
        }
    }
}
