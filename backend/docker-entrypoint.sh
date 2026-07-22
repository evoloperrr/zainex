#!/bin/sh

set -e

php artisan package:discover --ansi
php artisan migrate --force
php artisan config:cache

# Render's web container does not run Laravel's scheduler automatically.
# Catch up due credits immediately after a cold start/deploy, then keep the
# scheduler alive beside Apache. The accrual command is idempotent per day.
(
    # Referral credit rewards come from strategy activation credit costs,
    # not wallet-to-credit conversions. Reconcile historical records once.
    php artisan strategy:reconcile-referral-credits || true
    # Backfill previous qualifying activations. Unique ledger keys make this
    # safe on every restart and skip every referral income already credited.
    php artisan strategy:backfill-referral-income || true
    php artisan strategy:accrue-due || true
    exec php artisan schedule:work --no-interaction
) &

exec apache2-foreground
