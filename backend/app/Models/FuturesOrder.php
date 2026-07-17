<?php

// ZAINEX_DB_PHASE2A_COMBINED_USER_WALLET_INVITER_FUTURES_V2_4

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

final class FuturesOrder extends Model
{
    use HasFactory;
    use HasUuids;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'id',
        'trading_account_id',
        'client_order_id',
        'symbol',
        'direction',
        'action',
        'order_type',
        'margin_mode',
        'position_mode',
        'leverage',
        'margin',
        'quantity',
        'requested_price',
        'executed_price',
        'notional',
        'fee',
        'fee_rate',
        'stop_loss',
        'take_profit',
        'reduce_only',
        'quote_provider',
        'status',
        'rejection_code',
        'filled_at',
        'cancelled_at',
    ];

    protected function casts(): array
    {
        return [
            'leverage' => 'integer',
            'margin' => 'decimal:8',
            'quantity' => 'decimal:12',
            'requested_price' => 'decimal:8',
            'executed_price' => 'decimal:8',
            'notional' => 'decimal:8',
            'fee' => 'decimal:8',
            'fee_rate' => 'decimal:10',
            'stop_loss' => 'decimal:8',
            'take_profit' => 'decimal:8',
            'reduce_only' => 'boolean',
            'filled_at' => 'datetime',
            'cancelled_at' => 'datetime',
        ];
    }

    public function tradingAccount(): BelongsTo
    {
        return $this->belongsTo(TradingAccount::class);
    }

    public function executions(): HasMany
    {
        return $this->hasMany(TradingExecution::class, 'order_id');
    }
}