<?php

declare(strict_types=1);

// ZAINEX_REFERRAL_REWARD_PERCENTAGES_V1

return [
    // Direct inviter wallet income on every new strategy activation.
    'strategy_trading_amount_rate_bps' => 1000,

    'max_depth' => 3,

    'level_rates_bps' => [
        1 => 2500,
        2 => 1500,
        3 => 500,
    ],

    'total_rate_bps' => 4500,

    'allowed_source_types' => [
        'STRATEGY_ACTIVATION',
        'SUBSCRIPTION_PURCHASE',
    ],
];
