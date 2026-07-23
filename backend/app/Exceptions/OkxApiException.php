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
    ) {
        parent::__construct($message);
    }
}
