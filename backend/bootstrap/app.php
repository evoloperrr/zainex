<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        /*
         * The app only ever receives traffic through Render's edge proxy,
         * which doesn't publish a fixed set of inbound proxy IPs — trust
         * it unconditionally so $request->ip() resolves the real client
         * IP from X-Forwarded-For instead of Render's internal LB IP.
         * Without this, every per-IP rate limit (throttle:...) and every
         * $request->ip() audit-log entry is keyed to the same shared
         * value across all callers.
         */
        $middleware->trustProxies(at: '*');
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        //
    })->create();
