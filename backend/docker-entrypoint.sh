#!/bin/sh

set -e

php artisan package:discover --ansi
php artisan migrate --force
php artisan config:cache

# Render's web container does not run Laravel's scheduler automatically.
# Catch up due credits immediately after a cold start/deploy, then keep the
# scheduler alive beside Apache. The accrual command is idempotent per day.
(
    php artisan strategy:accrue-due || true
    exec php artisan schedule:work --no-interaction
) &

exec apache2-foreground
