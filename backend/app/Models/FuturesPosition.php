<?php

// ZAINEX_DB_PHASE2A_COMBINED_USER_WALLET_INVITER_FUTURES_V2_4

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

final class FuturesPosition extends Model
{
    use HasFactory;
    use HasUuids;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'id',
        'trading_account_id',
        'symbol',
        'exchange_instrument_id',
        'direction',
        'status',
        'open_slot',
        'position_mode',
        'margin_mode',
        'leverage',
        'margin',
        'quantity',
        'entry_price',
        'mark_price',
        'liquidation_price',
        'stop_loss',
        'take_profit',
        'maintenance_margin_rate',
        'entry_notional',
        'current_notional',
        'unrealized_pnl',
        'realized_pnl',
        'entry_fee',
        'close_fee',
        'funding_fee',
        'net_pnl',
        'mark_provider',
        'close_reason',
        'version',
        'opened_at',
        'closed_at',
    ];

    protected function casts(): array
    {
        return [
            'open_slot' => 'integer',
            'leverage' => 'integer',
            'margin' => 'decimal:8',
            'quantity' => 'decimal:12',
            'entry_price' => 'decimal:8',
            'mark_price' => 'decimal:8',
            'liquidation_price' => 'decimal:8',
            'stop_loss' => 'decimal:8',
            'take_profit' => 'decimal:8',
            'maintenance_margin_rate' => 'decimal:10',
            'entry_notional' => 'decimal:8',
            'current_notional' => 'decimal:8',
            'unrealized_pnl' => 'decimal:8',
            'realized_pnl' => 'decimal:8',
            'entry_fee' => 'decimal:8',
            'close_fee' => 'decimal:8',
            'funding_fee' => 'decimal:8',
            'net_pnl' => 'decimal:8',
            'version' => 'integer',
            'opened_at' => 'datetime',
            'closed_at' => 'datetime',
        ];
    }

    public function tradingAccount(): BelongsTo
    {
        return $this->belongsTo(TradingAccount::class);
    }

    public function executions(): HasMany
    {
        return $this->hasMany(TradingExecution::class, 'position_id');
    }
}