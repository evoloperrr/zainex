<?php

// ZAINEX_DB_PHASE2B1_LARAVEL_FUTURES_ENGINE_V1_1

namespace App\Exceptions;

use RuntimeException;

final class FuturesTradingException extends RuntimeException
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
