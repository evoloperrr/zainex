<?php

// ZAINEX_DB_PHASE2A_COMBINED_USER_WALLET_INVITER_FUTURES_V2_4

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

final class TradingExecution extends Model
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
        'exchange_fill_id',
        'position_id',
        'market_type',
        'symbol',
        'direction',
        'action',
        'execution_type',
        'quantity',
        'price',
        'entry_price',
        'notional',
        'fee',
        'fee_currency',
        'realized_pnl',
        'close_reason',
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
            'entry_price' => 'decimal:8',
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
        return $this->belongsTo(FuturesOrder::class, 'order_id');
    }

    public function position(): BelongsTo
    {
        return $this->belongsTo(FuturesPosition::class, 'position_id');
    }
}