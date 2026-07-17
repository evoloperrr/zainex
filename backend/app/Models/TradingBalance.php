<?php

// ZAINEX_DB_PHASE1_CORE_FOUNDATION_V1_2

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

final class TradingBalance extends Model
{
    use HasFactory;

    protected $fillable = [
        'trading_account_id',
        'asset',
        'available_balance',
        'locked_balance',
        'realized_pnl',
    ];

    protected function casts(): array
    {
        return [
            'available_balance' => 'decimal:8',
            'locked_balance' => 'decimal:8',
            'realized_pnl' => 'decimal:8',
        ];
    }

    public function tradingAccount(): BelongsTo
    {
        return $this->belongsTo(TradingAccount::class);
    }
}