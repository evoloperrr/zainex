<?php

// ZAINEX_SPOT_DB_PERSISTENCE_V1

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

final class SpotPosition extends Model
{
    use HasFactory;
    use HasUuids;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'id',
        'trading_account_id',
        'asset_class',
        'symbol',
        'status',
        'open_slot',
        'quantity',
        'average_entry_price',
        'mark_price',
        'stop_loss',
        'take_profit',
        'unrealized_pnl',
        'realized_pnl',
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
            'quantity' => 'decimal:12',
            'average_entry_price' => 'decimal:8',
            'mark_price' => 'decimal:8',
            'stop_loss' => 'decimal:8',
            'take_profit' => 'decimal:8',
            'unrealized_pnl' => 'decimal:8',
            'realized_pnl' => 'decimal:8',
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
        return $this->hasMany(SpotExecution::class, 'position_id');
    }
}
