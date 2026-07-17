<?php

// ZAINEX_DB_PHASE1_CORE_FOUNDATION_V1_2

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

final class IdempotencyRecord extends Model
{
    use HasFactory;

    protected $fillable = [
        'trading_account_id',
        'idempotency_key',
        'route',
        'request_hash',
        'response_status',
        'response_body',
        'expires_at',
    ];

    protected function casts(): array
    {
        return [
            'response_body' => 'array',
            'expires_at' => 'datetime',
        ];
    }

    public function tradingAccount(): BelongsTo
    {
        return $this->belongsTo(TradingAccount::class);
    }
}