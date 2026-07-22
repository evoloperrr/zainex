FROM php:8.4-apache-bookworm

ENV APP_ENV=production \
    APP_DEBUG=false \
    PORT=10000 \
    APACHE_DOCUMENT_ROOT=/var/www/html/public

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        git \
        unzip \
        libcurl4-openssl-dev \
        libicu-dev \
        libonig-dev \
        libpq-dev \
        libzip-dev \
    && docker-php-ext-install -j"$(nproc)" \
        bcmath \
        curl \
        intl \
        mbstring \
        opcache \
        pcntl \
        pdo_pgsql \
        zip \
    && a2enmod rewrite headers \
    && sed -ri 's!Listen 80!Listen 10000!g' \
        /etc/apache2/ports.conf \
    && sed -ri 's!<VirtualHost \*:80>!<VirtualHost *:10000>!g' \
        /etc/apache2/sites-available/000-default.conf \
    && sed -ri 's!/var/www/html!/var/www/html/public!g' \
        /etc/apache2/sites-available/000-default.conf \
    && printf '%s\n' \
        '<Directory /var/www/html/public>' \
        '    AllowOverride All' \
        '    Options FollowSymLinks' \
        '    Require all granted' \
        '</Directory>' \
        > /etc/apache2/conf-available/zainex-laravel.conf \
    && a2enconf zainex-laravel \
    && echo 'ServerName 0.0.0.0' \
        > /etc/apache2/conf-available/servername.conf \
    && a2enconf servername \
    && rm -rf /var/lib/apt/lists/*

COPY --from=composer:2 /usr/bin/composer /usr/local/bin/composer

WORKDIR /var/www/html

COPY composer.json composer.lock ./

RUN composer install \
        --no-dev \
        --prefer-dist \
        --no-interaction \
        --no-progress \
        --no-scripts \
        --optimize-autoloader

COPY . .

RUN rm -f bootstrap/cache/*.php \
    && composer dump-autoload \
        --no-dev \
        --optimize \
        --classmap-authoritative \
        --no-scripts \
    && mkdir -p \
        storage/app \
        storage/framework/cache \
        storage/framework/sessions \
        storage/framework/views \
        storage/logs \
        bootstrap/cache \
    && chown -R www-data:www-data \
        storage \
        bootstrap/cache \
    && chmod -R ug+rwX \
        storage \
        bootstrap/cache \
    && chmod +x docker-entrypoint.sh

EXPOSE 10000

CMD ["./docker-entrypoint.sh"]
