<?php

// ZAINEX_LIVE_OKX_TRADING_V1

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

final class ExchangeConnection extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'exchange',
        'label',
        'is_demo',
        'api_key',
        'api_secret',
        'passphrase',
        'status',
        'last_verified_at',
        'last_error_code',
        'last_error_message',
        'revoked_at',
    ];

    protected function casts(): array
    {
        return [
            'is_demo' => 'boolean',
            'api_key' => 'encrypted',
            'api_secret' => 'encrypted',
            'passphrase' => 'encrypted',
            'last_verified_at' => 'datetime',
            'revoked_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function isActive(): bool
    {
        return $this->status === 'ACTIVE';
    }

    public function maskedApiKey(): string
    {
        $key = (string) $this->api_key;

        if ($key === '') {
            return '';
        }

        $tail = substr($key, -4);

        return str_repeat('•', max(0, strlen($key) - 4)).$tail;
    }
}
