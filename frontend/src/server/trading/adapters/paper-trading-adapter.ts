import { randomUUID } from "node:crypto";

import type {
  CandleRequest,
  ExchangeAdapter,
  MarketDescriptor,
  MarketLookup,
  MarketPriceQuote,
  OrderExecutionResult,
  PaperAccountSnapshot,
  PaperAccountState,
  Position,
  TradeRecord,
  TradingContext,
  TradingOrder,
  ValidatedOrderRequest,
} from "../contracts";
import {
  PAPER_SPOT_FEE_RATE,
} from "../contracts";
import { TradingError } from "../errors";
import {
  MarketPriceProviderRegistry,
} from "../market-price-provider";
import {
  paperAccountStore,
  type PaperAccountStore,
} from "../paper-account-store";

const MAX_HISTORY_ITEMS = 500;
const FLOAT_TOLERANCE = 1e-10;

function roundNumber(value: number, places = 8): number {
  const factor = 10 ** places;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function positionKey(assetClass: string, symbol: string): string {
  return `${assetClass}:${symbol}`;
}

export class PaperTradingAdapter implements ExchangeAdapter {
  readonly id = "paper";

  constructor(
    private readonly prices: MarketPriceProviderRegistry,
    private readonly store: PaperAccountStore = paperAccountStore,
  ) {}

  async connect(_context: TradingContext): Promise<void> {
    return;
  }

  async getBalance(
    context: TradingContext,
  ): Promise<PaperAccountSnapshot> {
    return this.refreshAccountMarks(context.sessionId);
  }

  async getMarkets(): Promise<readonly MarketDescriptor[]> {
    return [];
  }

  async getTicker(
    request: MarketLookup,
  ): Promise<MarketPriceQuote> {
    return this.prices.getPrice(
      request.assetClass,
      request.symbol,
    );
  }

  async getCandles(
    _request: CandleRequest,
  ): Promise<readonly unknown[]> {
    throw new TradingError(
      "ADAPTER_CANDLES_NOT_AVAILABLE",
      "Paper adapter candles are provided by the separate market-data engine.",
      501,
    );
  }

  async placeOrder(
    context: TradingContext,
    request: ValidatedOrderRequest,
  ): Promise<OrderExecutionResult> {
    const quote = await this.prices.getPrice(
      request.assetClass,
      request.symbol,
    );

    return this.store.withAccountLock(
      context.sessionId,
      async () => {
        const account = this.store.readOrCreate(context.sessionId);
        const clientOrderId =
          request.clientOrderId ?? context.requestId;

        const existingOrder = account.orders.find(
          (order) => order.clientOrderId === clientOrderId,
        );

        if (existingOrder) {
          const existingTrade = account.trades.find(
            (trade) => trade.orderId === existingOrder.id,
          );

          if (!existingTrade) {
            throw new TradingError(
              "IDEMPOTENCY_STATE_INVALID",
              "The prior paper order is missing its trade record.",
              500,
            );
          }

          return {
            order: existingOrder,
            trade: existingTrade,
            account: this.buildSnapshot(account),
            idempotentReplay: true,
            quoteProvider: quote.provider,
          };
        }

        const now = new Date().toISOString();
        const key = positionKey(
          request.assetClass,
          request.symbol,
        );

        const currentPosition = account.positions[key];
        const notional = roundNumber(
          request.quantity * quote.price,
        );

        const fee = roundNumber(
          notional * PAPER_SPOT_FEE_RATE,
        );

        let realizedPnl = 0;

        if (request.side === "BUY") {
          const totalDebit = roundNumber(notional + fee);

          if (
            totalDebit - account.cashBalance >
            FLOAT_TOLERANCE
          ) {
            throw new TradingError(
              "INSUFFICIENT_PAPER_BALANCE",
              "The virtual account does not have enough cash for this order.",
              409,
              {
                required: totalDebit,
                available: account.cashBalance,
                currency: account.currency,
              },
            );
          }

          const existingQuantity =
            currentPosition?.quantity ?? 0;

          const existingCost =
            existingQuantity *
            (currentPosition?.averageEntryPrice ?? 0);

          const newQuantity = roundNumber(
            existingQuantity + request.quantity,
          );

          const newCost = roundNumber(
            existingCost + notional + fee,
          );

          const averageEntryPrice = roundNumber(
            newCost / newQuantity,
          );

          account.cashBalance = roundNumber(
            account.cashBalance - totalDebit,
          );

          account.positions[key] = {
            id: currentPosition?.id ?? randomUUID(),
            assetClass: request.assetClass,
            symbol: request.symbol,
            quantity: newQuantity,
            averageEntryPrice,
            lastPrice: quote.price,
            marketValue: roundNumber(
              newQuantity * quote.price,
            ),
            unrealizedPnl: roundNumber(
              (quote.price - averageEntryPrice) *
                newQuantity,
            ),
            openedAt: currentPosition?.openedAt ?? now,
            updatedAt: now,
          };
        } else {
          if (
            !currentPosition ||
            currentPosition.quantity + FLOAT_TOLERANCE <
              request.quantity
          ) {
            throw new TradingError(
              "INSUFFICIENT_PAPER_POSITION",
              "The virtual account does not hold enough quantity to sell.",
              409,
              {
                requestedQuantity: request.quantity,
                availableQuantity:
                  currentPosition?.quantity ?? 0,
                symbol: request.symbol,
              },
            );
          }

          const netProceeds = roundNumber(notional - fee);

          realizedPnl = roundNumber(
            (quote.price -
              currentPosition.averageEntryPrice) *
              request.quantity -
              fee,
          );

          account.cashBalance = roundNumber(
            account.cashBalance + netProceeds,
          );

          account.realizedPnl = roundNumber(
            account.realizedPnl + realizedPnl,
          );

          const remainingQuantity = roundNumber(
            currentPosition.quantity - request.quantity,
          );

          if (remainingQuantity <= FLOAT_TOLERANCE) {
            delete account.positions[key];
          } else {
            account.positions[key] = {
              ...currentPosition,
              quantity: remainingQuantity,
              lastPrice: quote.price,
              marketValue: roundNumber(
                remainingQuantity * quote.price,
              ),
              unrealizedPnl: roundNumber(
                (quote.price -
                  currentPosition.averageEntryPrice) *
                  remainingQuantity,
              ),
              updatedAt: now,
            };
          }
        }

        const order: TradingOrder = {
          id: randomUUID(),
          clientOrderId,
          adapter: this.id,
          assetClass: request.assetClass,
          symbol: request.symbol,
          side: request.side,
          type: request.type,
          status: "FILLED",
          quantity: request.quantity,
          executedPrice: quote.price,
          notional,
          fee,
          feeRate: PAPER_SPOT_FEE_RATE,
          createdAt: now,
        };

        const trade: TradeRecord = {
          id: randomUUID(),
          orderId: order.id,
          assetClass: request.assetClass,
          symbol: request.symbol,
          side: request.side,
          quantity: request.quantity,
          price: quote.price,
          notional,
          fee,
          realizedPnl,
          executedAt: now,
        };

        account.orders.unshift(order);
        account.trades.unshift(trade);

        account.orders = account.orders.slice(
          0,
          MAX_HISTORY_ITEMS,
        );

        account.trades = account.trades.slice(
          0,
          MAX_HISTORY_ITEMS,
        );

        account.updatedAt = now;

        this.store.save(account);

        return {
          order,
          trade,
          account: this.buildSnapshot(account),
          idempotentReplay: false,
          quoteProvider: quote.provider,
        };
      },
    );
  }

  async cancelOrder(
    _context: TradingContext,
    _orderId: string,
  ): Promise<never> {
    throw new TradingError(
      "ORDER_NOT_CANCELLABLE",
      "Paper market orders execute immediately and cannot be cancelled.",
      409,
    );
  }

  async closePosition(
    context: TradingContext,
    positionId: string,
  ): Promise<OrderExecutionResult> {
    const account = this.store.readOrCreate(context.sessionId);

    const position = Object.values(account.positions).find(
      (candidate) => candidate.id === positionId,
    );

    if (!position) {
      throw new TradingError(
        "POSITION_NOT_FOUND",
        "The paper position was not found.",
        404,
      );
    }

    return this.placeOrder(context, {
      adapter: this.id,
      assetClass: position.assetClass,
      symbol: position.symbol,
      side: "SELL",
      type: "MARKET",
      quantity: position.quantity,
      clientOrderId: `${context.requestId}:close`,
    });
  }

  async getOpenOrders(
    _context: TradingContext,
  ): Promise<readonly TradingOrder[]> {
    return [];
  }

  async getPositions(
    context: TradingContext,
  ): Promise<readonly Position[]> {
    const account = await this.refreshAccountMarks(
      context.sessionId,
    );

    return account.positions;
  }

  private async refreshAccountMarks(
    sessionId: string,
  ): Promise<PaperAccountSnapshot> {
    return this.store.withAccountLock(
      sessionId,
      async () => {
        const account = this.store.readOrCreate(sessionId);
        const positions = Object.values(account.positions);

        await Promise.all(
          positions.map(async (position) => {
            try {
              const quote = await this.prices.getPrice(
                position.assetClass,
                position.symbol,
              );

              const key = positionKey(
                position.assetClass,
                position.symbol,
              );

              account.positions[key] = {
                ...position,
                lastPrice: quote.price,
                marketValue: roundNumber(
                  position.quantity * quote.price,
                ),
                unrealizedPnl: roundNumber(
                  (quote.price -
                    position.averageEntryPrice) *
                    position.quantity,
                ),
                updatedAt: new Date().toISOString(),
              };
            } catch {
              // Account reads remain available when a quote provider
              // is temporarily unavailable. The previous mark is retained.
            }
          }),
        );

        account.updatedAt = new Date().toISOString();
        this.store.save(account);

        return this.buildSnapshot(account);
      },
    );
  }

  private buildSnapshot(
    account: PaperAccountState,
  ): PaperAccountSnapshot {
    const positions = Object.values(account.positions).sort(
      (left, right) =>
        left.symbol.localeCompare(right.symbol),
    );

    const positionsMarketValue = roundNumber(
      positions.reduce(
        (total, position) =>
          total + position.marketValue,
        0,
      ),
    );

    const unrealizedPnl = roundNumber(
      positions.reduce(
        (total, position) =>
          total + position.unrealizedPnl,
        0,
      ),
    );

    return {
      mode: "paper",
      storage: {
        kind: "memory",
        durable: false,
      },
      sessionId: account.sessionId,
      currency: account.currency,
      initialBalance: account.initialBalance,
      cashBalance: roundNumber(account.cashBalance),
      positionsMarketValue,
      totalEquity: roundNumber(
        account.cashBalance + positionsMarketValue,
      ),
      realizedPnl: roundNumber(account.realizedPnl),
      unrealizedPnl,
      positions,
      orders: [...account.orders],
      trades: [...account.trades],
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    };
  }
}
