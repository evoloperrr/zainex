<?php

// ZAINEX_LIVE_OKX_TRADING_V1

namespace App\Http\Controllers\Api;

use App\Exceptions\ExchangeConnectionException;
use App\Exceptions\FuturesTradingException;
use App\Exceptions\OkxApiException;
use App\Http\Controllers\Api\Concerns\RequiresLiveTradingIdentity;
use App\Http\Controllers\Controller;
use App\Models\ExchangeConnection;
use App\Models\TradingAccount;
use App\Models\User;
use App\Services\Trading\LiveFuturesTradingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Throwable;

final class LiveFuturesTradingController extends Controller
{
    use RequiresLiveTradingIdentity;

    public function __construct(
        private readonly LiveFuturesTradingService $service,
    ) {}

    public function account(Request $request): JsonResponse
    {
        return $this->handle(
            $request,
            fn (User $user, TradingAccount $account, ExchangeConnection $connection, string $requestId): array => [
                'ok' => true,
                'mode' => 'live-okx-futures',
                'liveTrading' => true,
                'account' => $this->service->account($account, $connection, $requestId),
            ],
        );
    }

    public function orders(Request $request): JsonResponse
    {
        return $this->handle(
            $request,
            fn (User $user, TradingAccount $account, ExchangeConnection $connection, string $requestId): array => [
                'ok' => true,
                'mode' => 'live-okx-futures',
                'liveTrading' => true,
                'orders' => $this->service->orders($account, $connection, $requestId),
            ],
        );
    }

    public function positions(Request $request): JsonResponse
    {
        return $this->handle(
            $request,
            fn (User $user, TradingAccount $account, ExchangeConnection $connection, string $requestId): array => [
                'ok' => true,
                'mode' => 'live-okx-futures',
                'liveTrading' => true,
                'positions' => $this->service->positions($account, $connection, $requestId),
            ],
        );
    }

    public function open(Request $request): JsonResponse
    {
        return $this->handle(
            $request,
            function (
                User $user,
                TradingAccount $account,
                ExchangeConnection $connection,
                string $requestId,
            ) use ($request): array {
                $body = $this->jsonBody($request);
                $result = $this->service->open(
                    $account,
                    $connection,
                    $requestId,
                    $body,
                    $request->ip(),
                    $request->userAgent(),
                );

                return [
                    'ok' => true,
                    'mode' => 'live-okx-futures',
                    'liveTrading' => true,
                    'result' => $result,
                    '_status' => $result['idempotentReplay'] ? 200 : 201,
                ];
            },
        );
    }

    public function close(Request $request): JsonResponse
    {
        return $this->handle(
            $request,
            function (
                User $user,
                TradingAccount $account,
                ExchangeConnection $connection,
                string $requestId,
            ) use ($request): array {
                $body = $this->jsonBody($request);
                $result = $this->service->close(
                    $account,
                    $connection,
                    $requestId,
                    $body,
                    $request->ip(),
                    $request->userAgent(),
                );

                return [
                    'ok' => true,
                    'mode' => 'live-okx-futures',
                    'liveTrading' => true,
                    'result' => $result,
                    '_status' => $result['idempotentReplay'] ? 200 : 201,
                ];
            },
        );
    }

    /**
     * @param callable(User, TradingAccount, ExchangeConnection, string): array<string, mixed> $operation
     */
    private function handle(
        Request $request,
        callable $operation,
    ): JsonResponse {
        try {
            $this->authorizeInternalRequest($request);

            [$user, $account, $connection] = $this->resolveLiveTradingIdentity($request);

            $requestId = trim((string) $request->header('X-Zainex-Request-Id', ''));

            if (! Str::isUuid($requestId)) {
                $requestId = (string) Str::uuid();
            }

            $payload = $operation($user, $account, $connection, $requestId);
            $status = (int) ($payload['_status'] ?? 200);
            unset($payload['_status']);

            return response()
                ->json($payload, $status)
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
        } catch (OkxApiException $exception) {
            return response()
                ->json(
                    [
                        'ok' => false,
                        'error' => [
                            'code' => $exception->sCode ?? 'OKX_ERROR',
                            'message' => $exception->sMsg ?? $exception->getMessage(),
                        ],
                    ],
                    $exception->httpStatus,
                )
                ->header('Cache-Control', 'no-store');
        } catch (Throwable $exception) {
            if (app()->environment('testing')) {
                throw $exception;
            }

            Log::error(
                'Live OKX futures trading request failed.',
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
                            'code' => 'INTERNAL_LIVE_TRADING_ERROR',
                            'message' => 'The live trading service could not complete the request.',
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
                'The live trading request must use application/json.',
                415,
            );
        }

        $body = $request->json()->all();

        if (! is_array($body)) {
            throw new FuturesTradingException(
                'INVALID_REQUEST_BODY',
                'The live trading request must be a JSON object.',
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
