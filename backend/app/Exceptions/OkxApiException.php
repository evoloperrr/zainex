<?php

// ZAINEX_LIVE_OKX_TRADING_V1

namespace App\Exceptions;

use RuntimeException;

final class OkxApiException extends RuntimeException
{
    /**
     * @param array<string, mixed> $details
     */
    public function __construct(
        string $message,
        public readonly ?string $sCode = null,
        public readonly ?string $sMsg = null,
        public readonly int $httpStatus = 502,
        public readonly array $details = [],
        /*
         * True when we never got a response from OKX at all (timeout,
         * connection reset, DNS failure) — as opposed to OKX responding
         * with an explicit rejection (non-"0" code). A transport failure
         * on an order-placement call is ambiguous: the order may have
         * actually gone through on OKX's side. Callers that place real
         * orders must NOT treat this the same as a confirmed rejection —
         * see LiveFuturesTradingService::open()/close().
         */
        public readonly bool $isTransportFailure = false,
    ) {
        parent::__construct($message);
    }
}
