<?php

// ZAINEX_DB_PHASE2A_COMBINED_USER_WALLET_INVITER_FUTURES_V2_4

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

final class CombinedUserWalletInviterFuturesSchemaTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_wallet_inviter_and_futures_schema_exist(): void
    {
        foreach ([
            'id',
            'name',
            'email',
            'email_verified_at',
            'password',
            'remember_token',
            'created_at',
            'updated_at',
            'wallet_balance',
            'inviter_id',
        ] as $column) {
            self::assertTrue(
                Schema::hasColumn('users', $column),
                "Missing users column: {$column}"
            );
        }

        $expected = [
            'futures_orders' => [
                'id',
                'trading_account_id',
                'client_order_id',
                'symbol',
                'direction',
                'action',
                'leverage',
                'margin',
                'quantity',
                'executed_price',
                'notional',
                'fee',
                'stop_loss',
                'take_profit',
                'reduce_only',
                'quote_provider',
                'status',
                'filled_at',
            ],
            'futures_positions' => [
                'id',
                'trading_account_id',
                'symbol',
                'direction',
                'status',
                'open_slot',
                'leverage',
                'margin',
                'quantity',
                'entry_price',
                'mark_price',
                'liquidation_price',
                'stop_loss',
                'take_profit',
                'entry_notional',
                'current_notional',
                'unrealized_pnl',
                'realized_pnl',
                'entry_fee',
                'close_fee',
                'funding_fee',
                'net_pnl',
                'close_reason',
                'version',
                'opened_at',
                'closed_at',
            ],
            'trading_executions' => [
                'id',
                'trading_account_id',
                'order_id',
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
                'realized_pnl',
                'close_reason',
                'quote_provider',
                'metadata',
                'executed_at',
                'created_at',
            ],
        ];

        foreach ($expected as $table => $columns) {
            self::assertTrue(Schema::hasTable($table), "Missing table: {$table}");

            foreach ($columns as $column) {
                self::assertTrue(
                    Schema::hasColumn($table, $column),
                    "Missing column: {$table}.{$column}"
                );
            }
        }
    }
}