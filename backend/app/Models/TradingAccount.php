<?php

// ZAINEX_DB_PHASE1_CORE_FOUNDATION_V1_2

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

final class TradingAccount extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'exchange_connection_id',
        'external_session_id',
        'account_type',
        'mode',
        'base_asset',
        'status',
        'starting_balance',
    ];

    protected function casts(): array
    {
        return [
            'starting_balance' => 'decimal:8',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function balances(): HasMany
    {
        return $this->hasMany(TradingBalance::class);
    }

    public function idempotencyRecords(): HasMany
    {
        return $this->hasMany(IdempotencyRecord::class);
    }

    public function auditLogs(): HasMany
    {
        return $this->hasMany(TradingAuditLog::class);
    }
}