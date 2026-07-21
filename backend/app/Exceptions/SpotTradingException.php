<?php

// ZAINEX_SPOT_DB_PERSISTENCE_V1

namespace App\Exceptions;

use RuntimeException;

final class SpotTradingException extends RuntimeException
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
