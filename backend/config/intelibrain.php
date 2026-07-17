<?php

declare(strict_types=1);

return [
    'enabled' => filter_var(
        env('INTELIBRAIN_ENABLED', true),
        FILTER_VALIDATE_BOOL,
    ),

    /*
     * Permanent V1 safety lock:
     * GPT is an analyst only and cannot execute orders.
     */
    'auto_trade' => false,

    'internal_token' => env(
        'INTELIBRAIN_INTERNAL_TOKEN',
        '',
    ),

    'openai_api_key' => env(
        'OPENAI_API_KEY',
        '',
    ),

    'openai_model' => env(
        'OPENAI_MODEL',
        '',
    ),

    'openai_base_url' => rtrim(
        env(
            'OPENAI_BASE_URL',
            'https://api.openai.com/v1',
        ),
        '/',
    ),

    'binance_futures_base_url' => rtrim(
        env(
            'INTELIBRAIN_BINANCE_FUTURES_BASE_URL',
            'https://fapi.binance.com',
        ),
        '/',
    ),

    'default_timeframe' => env(
        'INTELIBRAIN_DEFAULT_TIMEFRAME',
        '15m',
    ),

    'openai_timeout_seconds' => 75,
    'binance_timeout_seconds' => 15,
];