<?php

// ZAINEX_SPOT_DB_PERSISTENCE_V1

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

final class SpotOrder extends Model
{
    use HasFactory;
    use HasUuids;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'id',
        'trading_account_id',
        'client_order_id',
        'asset_class',
        'symbol',
        'side',
        'order_type',
        'quantity',
        'executed_price',
        'notional',
        'fee',
        'fee_rate',
        'stop_loss',
        'take_profit',
        'quote_provider',
        'status',
        'filled_at',
    ];

    protected function casts(): array
    {
        return [
            'quantity' => 'decimal:12',
            'executed_price' => 'decimal:8',
            'notional' => 'decimal:8',
            'fee' => 'decimal:8',
            'fee_rate' => 'decimal:10',
            'stop_loss' => 'decimal:8',
            'take_profit' => 'decimal:8',
            'filled_at' => 'datetime',
        ];
    }

    public function tradingAccount(): BelongsTo
    {
        return $this->belongsTo(TradingAccount::class);
    }

    public function executions(): HasMany
    {
        return $this->hasMany(SpotExecution::class, 'order_id');
    }
}
