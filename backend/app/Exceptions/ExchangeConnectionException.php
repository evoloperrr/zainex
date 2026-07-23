<?php

// ZAINEX_LIVE_OKX_TRADING_V1

namespace App\Exceptions;

use RuntimeException;

final class ExchangeConnectionException extends RuntimeException
{
    /**
     * @param array<string, mixed> $details
     */
    public function __construct(
        public readonly string $errorCode,
        string $message,
        public readonly int $httpStatus = 400,
        public readonly array $details = [],
    ) {
        parent::__construct($message);
    }
}
