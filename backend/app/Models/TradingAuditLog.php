<?php

// ZAINEX_DB_PHASE1_CORE_FOUNDATION_V1_2

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

final class TradingAuditLog extends Model
{
    use HasFactory;

    public const UPDATED_AT = null;

    protected $fillable = [
        'trading_account_id',
        'actor_type',
        'actor_id',
        'event',
        'request_id',
        'client_order_id',
        'ip_address',
        'user_agent',
        'payload_hash',
        'metadata',
        'created_at',
    ];

    protected function casts(): array
    {
        return [
            'metadata' => 'array',
            'created_at' => 'datetime',
        ];
    }

    public function tradingAccount(): BelongsTo
    {
        return $this->belongsTo(TradingAccount::class);
    }
}