<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    // ZAINEX_NOWPAYMENTS_CONFIG_V1_1
    'nowpayments' => [
        'api_key' => env('NOWPAYMENTS_API_KEY', ''),
        'ipn_secret' => env('NOWPAYMENTS_IPN_SECRET', ''),
        'base_url' => rtrim(
            env('NOWPAYMENTS_BASE_URL', 'https://api.nowpayments.io/v1'),
            '/',
        ),
        'pay_currency' => env('NOWPAYMENTS_PAY_CURRENCY', 'usdttrc20'),
        // Public URL NOWPayments calls with payment status updates. Must be
        // reachable from the internet — point it at the Laravel backend's
        // own public URL (e.g. the Render deployment), not the Next.js app.
        'ipn_callback_url' => env('NOWPAYMENTS_IPN_CALLBACK_URL', ''),
    ],

];
