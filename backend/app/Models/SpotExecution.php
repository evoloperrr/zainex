<?php

// ZAINEX_SPOT_DB_PERSISTENCE_V1

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

final class SpotExecution extends Model
{
    use HasFactory;
    use HasUuids;

    public const UPDATED_AT = null;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'id',
        'trading_account_id',
        'order_id',
        'position_id',
        'asset_class',
        'symbol',
        'side',
        'quantity',
        'price',
        'notional',
        'fee',
        'realized_pnl',
        'reason',
        'quote_provider',
        'metadata',
        'executed_at',
        'created_at',
    ];

    protected function casts(): array
    {
        return [
            'quantity' => 'decimal:12',
            'price' => 'decimal:8',
            'notional' => 'decimal:8',
            'fee' => 'decimal:8',
            'realized_pnl' => 'decimal:8',
            'metadata' => 'array',
            'executed_at' => 'datetime',
            'created_at' => 'datetime',
        ];
    }

    public function tradingAccount(): BelongsTo
    {
        return $this->belongsTo(TradingAccount::class);
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(SpotOrder::class, 'order_id');
    }

    public function position(): BelongsTo
    {
        return $this->belongsTo(SpotPosition::class, 'position_id');
    }
}
