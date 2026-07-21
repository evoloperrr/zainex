<?php

use Illuminate\Support\Facades\Route;

// TEMP_DIAGNOSTIC_DB_PROBE_REMOVE_ME
Route::get('/debug/db-probe', function () {
    $steps = [];

    try {
        $steps['select_1'] = \Illuminate\Support\Facades\DB::select('select 1 as one');
    } catch (\Throwable $e) {
        $steps['select_1_error'] = $e->getMessage();
    }

    try {
        $steps['cache_table_exists'] = \Illuminate\Support\Facades\Schema::hasTable('cache');
        $steps['cache_locks_table_exists'] = \Illuminate\Support\Facades\Schema::hasTable('cache_locks');
        $steps['users_table_exists'] = \Illuminate\Support\Facades\Schema::hasTable('users');
    } catch (\Throwable $e) {
        $steps['schema_check_error'] = $e->getMessage();
    }

    try {
        $steps['cache_put'] = \Illuminate\Support\Facades\Cache::put('db_probe_key', 'v1', 5);
        $steps['cache_get'] = \Illuminate\Support\Facades\Cache::get('db_probe_key');
    } catch (\Throwable $e) {
        $steps['cache_put_error'] = $e->getMessage();
    }

    try {
        \Illuminate\Support\Facades\DB::transaction(function () {
            \Illuminate\Support\Facades\DB::table('cache')
                ->where('key', 'db_probe_manual_txn')
                ->lockForUpdate()
                ->first();
        });
        $steps['manual_txn'] = 'ok';
    } catch (\Throwable $e) {
        $steps['manual_txn_error'] = $e->getMessage();
    }

    return response()->json($steps);
});

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
