<?php

declare(strict_types=1);

// ZAINEX_LIVE_OKX_TRADING_V1

return [
    'base_url' => env(
        'OKX_BASE_URL',
        'https://www.okx.com',
    ),

    'timeout_seconds' => (int) env(
        'OKX_TIMEOUT_SECONDS',
        10,
    ),

    /*
     * Conservative client-side ceiling independent of whatever OKX's
     * published per-endpoint limits currently are — re-verify against
     * OKX's live docs before raising this. Requests per window, per
     * exchange_connection_id.
     */
    'rate_limit' => [
        'max_requests' => (int) env(
            'OKX_RATE_LIMIT_MAX_REQUESTS',
            15,
        ),
        'window_seconds' => (int) env(
            'OKX_RATE_LIMIT_WINDOW_SECONDS',
            2,
        ),
    ],

    'instrument_cache_ttl_seconds' => (int) env(
        'OKX_INSTRUMENT_CACHE_TTL_SECONDS',
        3600,
    ),

    /*
     * Minutes an order may sit in SUBMITTING before the reconciliation
     * command treats it as needing a manual GET /trade/order lookup.
     */
    'reconcile_stuck_after_minutes' => (int) env(
        'OKX_RECONCILE_STUCK_AFTER_MINUTES',
        2,
    ),
];
