<?php

use Illuminate\Support\Facades\Route;

Route::get('/health', function () {
    return response()->json([
        'ok' => true,
        'service' => 'ZAINEX Laravel API',
        'status' => 'online',
        'timestamp' => now()->toIso8601String(),
    ]);
});

Route::get('/markets', function () {
    return response()->json([
        'data' => [
            [
                'id' => 'crypto',
                'name' => 'Crypto',
                'symbols' => ['BTC/USDT', 'ETH/USDT', 'SOL/USDT'],
            ],
            [
                'id' => 'forex',
                'name' => 'Forex',
                'symbols' => ['EUR/USD', 'GBP/USD', 'USD/JPY'],
            ],
            [
                'id' => 'stocks',
                'name' => 'Stocks',
                'symbols' => ['NVDA', 'AAPL', 'TSLA'],
            ],
        ],
    ]);
});

\Illuminate\Support\Facades\Route::post(
    '/trading/futures/ai/analyze',
    \App\Http\Controllers\Api\FuturesAiSignalController::class,
)->middleware('throttle:6,1');

// ZAINEX_DB_PHASE2B1_LARAVEL_FUTURES_ENGINE_V1_1
Route::controller(
    \App\Http\Controllers\Api\FuturesPaperTradingController::class
)->prefix('/trading/futures')->group(function (): void {
    Route::get('/account', 'account');
    Route::get('/orders', 'orders');
    Route::post('/orders', 'open')
        ->middleware('throttle:20,1');
    Route::post('/close', 'close')
        ->middleware('throttle:20,1');
    Route::get('/positions', 'positions');
});
// ZAINEX_SPOT_DB_PERSISTENCE_V1
Route::controller(
    \App\Http\Controllers\Api\SpotPaperTradingController::class
)->prefix('/trading/spot')->group(function (): void {
    Route::get('/account', 'account');
    Route::get('/orders', 'orders');
    Route::post('/buy', 'buy')
        ->middleware('throttle:20,1');
    Route::post('/sell', 'sell')
        ->middleware('throttle:20,1');
    Route::get('/positions', 'positions');
});

// ZAINEX_STRATEGY_ACTIVATION_BACKEND_V2_2
Route::post(
    '/trading/futures/strategies/activate',
    \App\Http\Controllers\Api\FuturesStrategyActivationController::class,
)->middleware('throttle:20,1');
// ZAINEX_CURRENT_ACTIVE_STRATEGY_BORDER_V1
Route::get(
    '/trading/futures/strategies/current',
    \App\Http\Controllers\Api\FuturesStrategyStatusController::class,
)->middleware('throttle:60,1');

// ZAINEX_WALLET_TO_CREDITS_CONVERTER_V1
Route::get(
    '/trading/futures/wallet/convert',
    [
        \App\Http\Controllers\Api\WalletToCreditsController::class,
        'index',
    ],
)->middleware('throttle:60,1');

Route::post(
    '/trading/futures/wallet/convert',
    [
        \App\Http\Controllers\Api\WalletToCreditsController::class,
        'store',
    ],
)->middleware('throttle:20,1');
// ZAINEX_USER_CREDIT_TRANSFER_V1
Route::get(
    '/trading/futures/wallet/transfers',
    [
        \App\Http\Controllers\Api\CreditTransferController::class,
        'index',
    ],
)->middleware('throttle:60,1');

Route::post(
    '/trading/futures/wallet/transfers',
    [
        \App\Http\Controllers\Api\CreditTransferController::class,
        'store',
    ],
)->middleware('throttle:20,1');

// ZAINEX_ROOT_ADMIN_WALLET_TRANSFER_V1
Route::get(
    '/trading/futures/wallet/admin-transfers',
    [
        \App\Http\Controllers\Api\AdminWalletTransferController::class,
        'index',
    ],
)->middleware('throttle:60,1');

Route::post(
    '/trading/futures/wallet/admin-transfers',
    [
        \App\Http\Controllers\Api\AdminWalletTransferController::class,
        'store',
    ],
)->middleware('throttle:20,1');

// ZAINEX_MULTI_USER_GOOGLE_AUTH_V1
Route::post(
    '/auth/google-link',
    \App\Http\Controllers\Api\GoogleAuthLinkController::class,
)->middleware('throttle:30,1');

// ZAINEX_THREE_LEVEL_REFERRALS_V1
Route::get(
    '/referrals/network',
    \App\Http\Controllers\Api\ReferralNetworkController::class,
)->middleware('throttle:60,1');

// ZAINEX_SPOT_INTELIBRAIN_V1
Route::post(
    '/trading/spot/ai/analyze',
    \App\Http\Controllers\Api\SpotAiSignalController::class,
)->middleware('throttle:20,1');

// ZAINEX_NOWPAYMENTS_CRYPTO_CHECKOUT_V1
Route::post(
    '/trading/futures/wallet/crypto/invoice',
    [
        \App\Http\Controllers\Api\NowPaymentsController::class,
        'store',
    ],
)->middleware('throttle:20,1');

Route::get(
    '/trading/futures/wallet/crypto/status/{paymentId}',
    [
        \App\Http\Controllers\Api\NowPaymentsController::class,
        'status',
    ],
)->middleware('throttle:60,1');

// Public IPN endpoint — NOWPayments calls this directly, authenticated by
// HMAC signature (see NowPaymentsController::webhook), not the internal
// token every other route here requires.
Route::post(
    '/webhooks/nowpayments',
    [
        \App\Http\Controllers\Api\NowPaymentsController::class,
        'webhook',
    ],
)->middleware('throttle:30,1');

// ZAINEX_ADMIN_CONSOLE_V1
Route::controller(
    \App\Http\Controllers\Api\AdminController::class
)->prefix('/admin')->group(function (): void {
    Route::get('/overview', 'overview')
        ->middleware('throttle:60,1');
    Route::get('/users', 'users')
        ->middleware('throttle:60,1');
    Route::post('/users/grant-vip', 'grantVip')
        ->middleware('throttle:20,1');
    Route::post('/users/credit-wallet', 'creditWallet')
        ->middleware('throttle:20,1');
    Route::get('/crypto-payments', 'cryptoPayments')
        ->middleware('throttle:60,1');
    Route::get('/wallet-ledger', 'walletLedger')
        ->middleware('throttle:60,1');
    Route::get('/admin-wallet-transfers', 'adminWalletTransfers')
        ->middleware('throttle:60,1');
    Route::get('/credit-transfers', 'creditTransfers')
        ->middleware('throttle:60,1');
});
