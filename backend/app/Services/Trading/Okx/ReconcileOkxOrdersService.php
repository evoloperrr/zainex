<?php

// ZAINEX_LIVE_OKX_TRADING_V1
// Finds futures_orders rows stuck in SUBMITTING — a crash between the
// OKX order call and our own commit — past a configurable grace period,
// and resolves each via LiveFuturesTradingService::reconcileSubmittingOrder().

namespace App\Services\Trading\Okx;

use App\Models\FuturesOrder;
use App\Services\Trading\LiveFuturesTradingService;
use Illuminate\Support\Facades\Log;
use Throwable;

final class ReconcileOkxOrdersService
{
    public function __construct(
        private readonly LiveFuturesTradingService $liveTrading,
    ) {}

    /**
     * @return array<string, int>
     */
    public function run(): array
    {
        $staleBefore = now()->subMinutes(
            (int) config('okx.reconcile_stuck_after_minutes', 2),
        );

        $stuckOrders = FuturesOrder::query()
            ->whereHas('tradingAccount', function ($query): void {
                $query->where('account_type', 'LIVE_OKX');
            })
            ->where('status', 'SUBMITTING')
            ->where('created_at', '<=', $staleBefore)
            ->get();

        $summary = [
            'checked' => $stuckOrders->count(),
            'errors' => 0,
        ];

        foreach ($stuckOrders as $order) {
            try {
                $this->liveTrading->reconcileSubmittingOrder($order);
            } catch (Throwable $exception) {
                $summary['errors']++;

                Log::error(
                    'OKX order reconciliation failed.',
                    [
                        'orderId' => $order->id,
                        'exception' => $exception::class,
                        'message' => $exception->getMessage(),
                    ],
                );
            }
        }

        return $summary;
    }
}
