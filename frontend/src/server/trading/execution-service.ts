import type {
  PaperAccountSnapshot,
  Position,
  TradingContext,
  TradingOrder,
} from "./contracts";
import { TradingAdapterRegistry } from "./adapter-registry";
import { writeTradingAudit } from "./audit";
import { PaperTradingAdapter } from "./adapters/paper-trading-adapter";
import { BinancePublicPriceProvider } from "./providers/binance-public-price-provider";
import { OkxPublicPriceProvider } from "./providers/okx-public-price-provider";
import { BybitPublicPriceProvider } from "./providers/bybit-public-price-provider";
import {
  MarketPriceProviderRegistry,
} from "./market-price-provider";
import { assertOrderRateLimit } from "./rate-limit";
import { parseOrderRequest } from "./validation";

const priceProviders = new MarketPriceProviderRegistry([
  new BinancePublicPriceProvider(),
  new OkxPublicPriceProvider(),
  new BybitPublicPriceProvider(),
]);

const adapterRegistry = new TradingAdapterRegistry([
  new PaperTradingAdapter(priceProviders),
]);

class TradingExecutionService {
  async executeOrder(
    context: TradingContext,
    input: unknown,
  ) {
    assertOrderRateLimit(context.sessionId);

    const request = parseOrderRequest(input);
    const adapter = adapterRegistry.get(request.adapter);

    await adapter.connect(context);

    try {
      const result = await adapter.placeOrder(
        context,
        request,
      );

      writeTradingAudit("paper_order_filled", {
        requestId: context.requestId,
        sessionId: context.sessionId,
        adapter: request.adapter,
        assetClass: request.assetClass,
        symbol: request.symbol,
        side: request.side,
        quantity: request.quantity,
        orderId: result.order.id,
        price: result.order.executedPrice,
        quoteProvider: result.quoteProvider,
        idempotentReplay: result.idempotentReplay,
      });

      return result;
    } catch (error) {
      writeTradingAudit("paper_order_failed", {
        requestId: context.requestId,
        sessionId: context.sessionId,
        adapter: request.adapter,
        assetClass: request.assetClass,
        symbol: request.symbol,
        side: request.side,
        quantity: request.quantity,
        reason:
          error instanceof Error
            ? error.message
            : "Unknown error",
      });

      throw error;
    }
  }

  async getAccount(
    context: TradingContext,
  ): Promise<PaperAccountSnapshot> {
    const adapter = adapterRegistry.get("paper");
    await adapter.connect(context);

    return adapter.getBalance(context);
  }

  async getPositions(
    context: TradingContext,
  ): Promise<readonly Position[]> {
    const adapter = adapterRegistry.get("paper");
    await adapter.connect(context);

    return adapter.getPositions(context);
  }

  async getOrders(
    context: TradingContext,
  ): Promise<readonly TradingOrder[]> {
    const account = await this.getAccount(context);
    return account.orders;
  }

  getEnabledAdapters(): string[] {
    return adapterRegistry.list();
  }
}

export const tradingExecutionService =
  new TradingExecutionService();
