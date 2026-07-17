import {
  randomUUID,
} from "node:crypto";

import type {
  TradingContext,
} from "../contracts";

import {
  TradingError,
} from "../errors";

import {
  writeTradingAudit,
} from "../audit";

import {
  assertOrderRateLimit,
} from "../rate-limit";

import {
  MarketPriceProviderRegistry,
} from "../market-price-provider";

import {
  BinancePublicPriceProvider,
} from "../providers/binance-public-price-provider";

import {
  OkxPublicPriceProvider,
} from "../providers/okx-public-price-provider";

import {
  BybitPublicPriceProvider,
} from "../providers/bybit-public-price-provider";

import type {
  FuturesAccountSnapshot,
  FuturesAccountState,
  FuturesDirection,
  FuturesExecutionResult,
  FuturesOrder,
  FuturesPosition,
  FuturesTrade,
  ValidatedFuturesCloseRequest,
  ValidatedFuturesOpenRequest,
} from "./contracts";

import {
  FUTURES_ALLOWED_LEVERAGE,
  FUTURES_MAINTENANCE_MARGIN_RATE,
  FUTURES_TAKER_FEE_RATE,
} from "./contracts";

import {
  parseFuturesCloseRequest,
  parseFuturesOpenRequest,
} from "./validation";

import {
  futuresAccountStore,
  type FuturesAccountStore,
} from "./store";

const MAX_HISTORY_ITEMS = 500;

function roundNumber(
  value: number,
  places = 8,
): number {
  const factor = 10 ** places;

  return (
    Math.round(
      (value + Number.EPSILON) *
        factor,
    ) / factor
  );
}

function calculateRawPnl(
  direction: FuturesDirection,
  entryPrice: number,
  markPrice: number,
  quantity: number,
): number {
  if (direction === "LONG") {
    return (
      markPrice - entryPrice
    ) * quantity;
  }

  return (
    entryPrice - markPrice
  ) * quantity;
}

function calculateLiquidationPrice(
  direction: FuturesDirection,
  entryPrice: number,
  leverage: number,
): number {
  if (direction === "LONG") {
    return Math.max(
      0,
      entryPrice *
        (
          1 -
          1 / leverage +
          FUTURES_MAINTENANCE_MARGIN_RATE
        ),
    );
  }

  return (
    entryPrice *
    (
      1 +
      1 / leverage -
      FUTURES_MAINTENANCE_MARGIN_RATE
    )
  );
}

// ZAINEX_FUTURES_RISK_GUARD_V1

function crossedLiquidationPrice(
  position: FuturesPosition,
): boolean {
  if (position.direction === "LONG") {
    return (
      position.markPrice <=
      position.liquidationPrice
    );
  }

  return (
    position.markPrice >=
    position.liquidationPrice
  );
}

function crossedStopLoss(
  position: FuturesPosition,
): boolean {
  if (!Number.isFinite(position.stopLoss)) {
    return false;
  }

  if (position.direction === "LONG") {
    return (
      position.markPrice <=
      position.stopLoss
    );
  }

  return (
    position.markPrice >=
    position.stopLoss
  );
}

function crossedTakeProfit(
  position: FuturesPosition,
): boolean {
  if (!Number.isFinite(position.takeProfit)) {
    return false;
  }

  if (position.direction === "LONG") {
    return (
      position.markPrice >=
      position.takeProfit
    );
  }

  return (
    position.markPrice <=
    position.takeProfit
  );
}
function positionKey(
  symbol: string,
): string {
  return symbol;
}

class FuturesExecutionService {
  private readonly prices =
    new MarketPriceProviderRegistry([
      new BinancePublicPriceProvider(),
      new OkxPublicPriceProvider(),
      new BybitPublicPriceProvider(),
    ]);

  constructor(
    private readonly store:
      FuturesAccountStore =
      futuresAccountStore,
  ) {}

  async getAccount(
    context: TradingContext,
  ): Promise<FuturesAccountSnapshot> {
    return this.store.withSessionLock(
      context.sessionId,
      async () => {
        const account =
          this.store.readOrCreate(
            context.sessionId,
          );

        await this.refreshMarksAndLiquidate(
          account,
        );

        this.store.save(account);

        return this.buildSnapshot(
          account,
        );
      },
    );
  }

  async getPositions(
    context: TradingContext,
  ): Promise<readonly FuturesPosition[]> {
    const account =
      await this.getAccount(context);

    return account.positions;
  }

  async getOrders(
    context: TradingContext,
  ): Promise<readonly FuturesOrder[]> {
    const account =
      await this.getAccount(context);

    return account.orders;
  }

  async openPosition(
    context: TradingContext,
    input: unknown,
  ): Promise<FuturesExecutionResult> {
    assertOrderRateLimit(
      context.sessionId,
    );

    const request =
      parseFuturesOpenRequest(input);

    return this.store.withSessionLock(
      context.sessionId,
      async () => {
        const account =
          this.store.readOrCreate(
            context.sessionId,
          );

        await this.refreshMarksAndLiquidate(
          account,
        );

        const clientOrderId =
          request.clientOrderId ??
          `futures-open-${randomUUID()}`;

        const replay =
          this.findIdempotentResult(
            account,
            clientOrderId,
          );

        if (replay) {
          return replay;
        }

        const key = positionKey(
          request.symbol,
        );

        if (account.positions[key]) {
          throw new TradingError(
            "FUTURES_POSITION_EXISTS",
            "A BTCUSDT futures position is already open. Close it before opening another one.",
            409,
            {
              positionMode: "ONE_WAY",
              existingPosition:
                account.positions[key].id,
            },
          );
        }

        const quote =
          await this.prices.getPrice(
            "crypto",
            request.symbol,
          );

        const liquidationPrice =
          roundNumber(
            calculateLiquidationPrice(
              request.direction,
              quote.price,
              request.leverage,
            ),
          );

        const riskGuardValid =
          request.direction === "LONG"
            ? (
                request.stopLoss <
                  quote.price &&
                request.stopLoss >
                  liquidationPrice &&
                request.takeProfit >
                  quote.price
              )
            : (
                request.stopLoss >
                  quote.price &&
                request.stopLoss <
                  liquidationPrice &&
                request.takeProfit <
                  quote.price
              );

        if (!riskGuardValid) {
          throw new TradingError(
            "INVALID_FUTURES_RISK_GUARD",
            request.direction === "LONG"
              ? "LONG requires Stop Loss below entry but above liquidation, and Take Profit above entry."
              : "SHORT requires Stop Loss above entry but below liquidation, and Take Profit below entry.",
            400,
            {
              direction:
                request.direction,
              entryPrice:
                quote.price,
              liquidationPrice,
              stopLoss:
                request.stopLoss,
              takeProfit:
                request.takeProfit,
            },
          );
        }

        const margin =
          roundNumber(request.margin);

        const notional =
          roundNumber(
            margin *
              request.leverage,
          );

        const quantity =
          roundNumber(
            notional / quote.price,
          );

        const entryFee =
          roundNumber(
            notional *
              FUTURES_TAKER_FEE_RATE,
          );

        const requiredBalance =
          roundNumber(
            margin + entryFee,
          );

        if (
          account.availableBalance <
          requiredBalance
        ) {
          throw new TradingError(
            "INSUFFICIENT_FUTURES_MARGIN",
            "The virtual futures account does not have enough available USDT.",
            409,
            {
              availableBalance:
                account.availableBalance,
              requiredBalance,
              margin,
              entryFee,
            },
          );
        }

        const now =
          new Date().toISOString();

        const position:
          FuturesPosition = {
            id: randomUUID(),
            symbol: request.symbol,
            direction:
              request.direction,
            marginMode: "ISOLATED",
            leverage:
              request.leverage,
            margin,
            quantity,
            entryPrice:
              roundNumber(
                quote.price,
              ),
            markPrice:
              roundNumber(
                quote.price,
              ),
            notional,
            entryFee,
            stopLoss:
              roundNumber(
                request.stopLoss,
              ),
            takeProfit:
              roundNumber(
                request.takeProfit,
              ),
            liquidationPrice,
            maintenanceMarginRate:
              FUTURES_MAINTENANCE_MARGIN_RATE,
            unrealizedPnl: 0,
            roePercent: 0,
            markProvider:
              quote.provider,
            openedAt: now,
            updatedAt: now,
          };

        const order:
          FuturesOrder = {
            id: randomUUID(),
            clientOrderId,
            action: "OPEN",
            direction:
              request.direction,
            symbol: request.symbol,
            status: "FILLED",
            marginMode: "ISOLATED",
            leverage:
              request.leverage,
            margin,
            quantity,
            executedPrice:
              roundNumber(
                quote.price,
              ),
            notional,
            fee: entryFee,
            feeRate:
              FUTURES_TAKER_FEE_RATE,
            reduceOnly: false,
            quoteProvider:
              quote.provider,
            createdAt: now,
          };

        const trade:
          FuturesTrade = {
            id: randomUUID(),
            orderId: order.id,
            action: "OPEN",
            direction:
              request.direction,
            symbol: request.symbol,
            leverage:
              request.leverage,
            margin,
            quantity,
            price:
              roundNumber(
                quote.price,
              ),
            entryPrice:
              roundNumber(
                quote.price,
              ),
            notional,
            fee: entryFee,
            realizedPnl: 0,
            reason: "USER_OPEN",
            executedAt: now,
          };

        account.availableBalance =
          roundNumber(
            account.availableBalance -
              requiredBalance,
          );

        account.positions[key] =
          position;

        account.orders = [
          order,
          ...account.orders,
        ].slice(
          0,
          MAX_HISTORY_ITEMS,
        );

        account.trades = [
          trade,
          ...account.trades,
        ].slice(
          0,
          MAX_HISTORY_ITEMS,
        );

        account.updatedAt = now;

        this.store.save(account);

        const result:
          FuturesExecutionResult = {
            order,
            trade,
            account:
              this.buildSnapshot(
                account,
              ),
            idempotentReplay: false,
            quoteProvider:
              quote.provider,
          };

        writeTradingAudit(
          "paper_futures_position_opened",
          {
            requestId:
              context.requestId,
            sessionId:
              context.sessionId,
            symbol:
              request.symbol,
            direction:
              request.direction,
            margin,
            leverage:
              request.leverage,
            quantity,
            entryPrice:
              quote.price,
            liquidationPrice:
              position.liquidationPrice,
            orderId:
              order.id,
            quoteProvider:
              quote.provider,
          },
        );

        return result;
      },
    );
  }

  async closePosition(
    context: TradingContext,
    input: unknown,
  ): Promise<FuturesExecutionResult> {
    assertOrderRateLimit(
      context.sessionId,
    );

    const request =
      parseFuturesCloseRequest(input);

    return this.store.withSessionLock(
      context.sessionId,
      async () => {
        const account =
          this.store.readOrCreate(
            context.sessionId,
          );

        await this.refreshMarksAndLiquidate(
          account,
        );

        const clientOrderId =
          request.clientOrderId ??
          `futures-close-${randomUUID()}`;

        const replay =
          this.findIdempotentResult(
            account,
            clientOrderId,
          );

        if (replay) {
          return replay;
        }

        const position = Object.values(
          account.positions,
        ).find(
          (candidate) =>
            candidate.id ===
            request.positionId,
        );

        if (!position) {
          throw new TradingError(
            "FUTURES_POSITION_NOT_FOUND",
            "The requested futures position is not open.",
            404,
            {
              positionId:
                request.positionId,
            },
          );
        }

        const quote =
          await this.prices.getPrice(
            "crypto",
            position.symbol,
          );

        return this.finalizePosition(
          account,
          position,
          quote.price,
          quote.provider,
          clientOrderId,
          "CLOSE",
          "USER_CLOSE",
          context,
        );
      },
    );
  }

  private async refreshMarksAndLiquidate(
    account: FuturesAccountState,
  ): Promise<void> {
    const positions =
      Object.values(
        account.positions,
      );

    for (const position of positions) {
      const quote =
        await this.prices.getPrice(
          "crypto",
          position.symbol,
        );

      position.markPrice =
        roundNumber(
          quote.price,
        );

      position.markProvider =
        quote.provider;

      position.unrealizedPnl =
        roundNumber(
          calculateRawPnl(
            position.direction,
            position.entryPrice,
            position.markPrice,
            position.quantity,
          ),
        );

      position.roePercent =
        position.margin > 0
          ? roundNumber(
              (
                position.unrealizedPnl /
                position.margin
              ) * 100,
              4,
            )
          : 0;

      position.updatedAt =
        new Date().toISOString();

      if (
        crossedLiquidationPrice(
          position,
        )
      ) {
        this.finalizePosition(
          account,
          position,
          position.markPrice,
          quote.provider,
          "liquidation-" +
            randomUUID(),
          "LIQUIDATE",
          "LIQUIDATION",
        );

        continue;
      }

      if (
        crossedStopLoss(
          position,
        )
      ) {
        this.finalizePosition(
          account,
          position,
          position.markPrice,
          quote.provider,
          "stop-loss-" +
            randomUUID(),
          "CLOSE",
          "STOP_LOSS",
        );

        continue;
      }

      if (
        crossedTakeProfit(
          position,
        )
      ) {
        this.finalizePosition(
          account,
          position,
          position.markPrice,
          quote.provider,
          "take-profit-" +
            randomUUID(),
          "CLOSE",
          "TAKE_PROFIT",
        );
      }
    }

    account.updatedAt =
      new Date().toISOString();
  }

  private finalizePosition(
    account: FuturesAccountState,
    position: FuturesPosition,
    exitPrice: number,
    quoteProvider: string,
    clientOrderId: string,
    action: "CLOSE" | "LIQUIDATE",
    reason:
      | "USER_CLOSE"
      | "STOP_LOSS"
      | "TAKE_PROFIT"
      | "LIQUIDATION",
    context?: TradingContext,
  ): FuturesExecutionResult {
    const exitNotional =
      roundNumber(
        position.quantity *
          exitPrice,
      );

    const exitFee =
      roundNumber(
        exitNotional *
          FUTURES_TAKER_FEE_RATE,
      );

    const rawPnl =
      roundNumber(
        calculateRawPnl(
          position.direction,
          position.entryPrice,
          exitPrice,
          position.quantity,
        ),
      );

    const releasedBalance =
      Math.max(
        0,
        roundNumber(
          position.margin +
            rawPnl -
            exitFee,
        ),
      );

    const realizedPnl =
      roundNumber(
        releasedBalance -
          position.margin -
          position.entryFee,
      );

    const now =
      new Date().toISOString();

    const order:
      FuturesOrder = {
        id: randomUUID(),
        clientOrderId,
        action,
        direction:
          position.direction,
        symbol:
          position.symbol,
        status: "FILLED",
        marginMode: "ISOLATED",
        leverage:
          position.leverage,
        margin:
          position.margin,
        quantity:
          position.quantity,
        executedPrice:
          roundNumber(
            exitPrice,
          ),
        notional:
          exitNotional,
        fee: exitFee,
        feeRate:
          FUTURES_TAKER_FEE_RATE,
        reduceOnly: true,
        quoteProvider,
        createdAt: now,
      };

    const trade:
      FuturesTrade = {
        id: randomUUID(),
        orderId: order.id,
        action,
        direction:
          position.direction,
        symbol:
          position.symbol,
        leverage:
          position.leverage,
        margin:
          position.margin,
        quantity:
          position.quantity,
        price:
          roundNumber(
            exitPrice,
          ),
        entryPrice:
          position.entryPrice,
        notional:
          exitNotional,
        fee: exitFee,
        realizedPnl,
        reason,
        executedAt: now,
      };

    account.availableBalance =
      roundNumber(
        account.availableBalance +
          releasedBalance,
      );

    account.realizedPnl =
      roundNumber(
        account.realizedPnl +
          realizedPnl,
      );

    delete account.positions[
      positionKey(
        position.symbol,
      )
    ];

    account.orders = [
      order,
      ...account.orders,
    ].slice(
      0,
      MAX_HISTORY_ITEMS,
    );

    account.trades = [
      trade,
      ...account.trades,
    ].slice(
      0,
      MAX_HISTORY_ITEMS,
    );

    account.updatedAt = now;

    this.store.save(account);

    if (context) {
      writeTradingAudit(
        "paper_futures_position_closed",
        {
          requestId:
            context.requestId,
          sessionId:
            context.sessionId,
          positionId:
            position.id,
          symbol:
            position.symbol,
          direction:
            position.direction,
          leverage:
            position.leverage,
          entryPrice:
            position.entryPrice,
          exitPrice,
          realizedPnl,
          orderId:
            order.id,
          quoteProvider,
        },
      );
    }
    else {
      writeTradingAudit(
        "paper_futures_position_liquidated",
        {
          sessionId:
            account.sessionId,
          positionId:
            position.id,
          symbol:
            position.symbol,
          direction:
            position.direction,
          leverage:
            position.leverage,
          entryPrice:
            position.entryPrice,
          liquidationPrice:
            position.liquidationPrice,
          exitPrice,
          realizedPnl,
          orderId:
            order.id,
          quoteProvider,
        },
      );
    }

    return {
      order,
      trade,
      account:
        this.buildSnapshot(
          account,
        ),
      idempotentReplay: false,
      quoteProvider,
    };
  }

  private findIdempotentResult(
    account: FuturesAccountState,
    clientOrderId: string,
  ): FuturesExecutionResult | undefined {
    const order =
      account.orders.find(
        (candidate) =>
          candidate.clientOrderId ===
          clientOrderId,
      );

    if (!order) {
      return undefined;
    }

    const trade =
      account.trades.find(
        (candidate) =>
          candidate.orderId ===
          order.id,
      );

    if (!trade) {
      throw new TradingError(
        "FUTURES_IDEMPOTENCY_STATE_INVALID",
        "The saved futures order is missing its execution record.",
        500,
      );
    }

    return {
      order,
      trade,
      account:
        this.buildSnapshot(
          account,
        ),
      idempotentReplay: true,
      quoteProvider:
        order.quoteProvider,
    };
  }

  private buildSnapshot(
    account: FuturesAccountState,
  ): FuturesAccountSnapshot {
    const positions =
      Object.values(
        account.positions,
      ).map(
        (position) => ({
          ...position,
        }),
      );

    const usedMargin =
      roundNumber(
        positions.reduce(
          (total, position) =>
            total + position.margin,
          0,
        ),
      );

    const unrealizedPnl =
      roundNumber(
        positions.reduce(
          (total, position) =>
            total +
            position.unrealizedPnl,
          0,
        ),
      );

    const totalEquity =
      roundNumber(
        account.availableBalance +
          usedMargin +
          unrealizedPnl,
      );

    return {
      mode: "paper-futures",
      product:
        "USDT-M-PERPETUAL",
      storage: {
        kind: "memory",
        durable: false,
      },
      model: {
        marginMode: "ISOLATED",
        positionMode: "ONE_WAY",
        liquidation:
          "SIMPLIFIED_ISOLATED_V1",
        fundingSettlement: false,
      },
      sessionId:
        account.sessionId,
      currency: "USDT",
      initialBalance:
        account.initialBalance,
      availableBalance:
        account.availableBalance,
      usedMargin,
      totalEquity,
      realizedPnl:
        account.realizedPnl,
      unrealizedPnl,
      positions,
      orders:
        account.orders.map(
          (order) => ({
            ...order,
          }),
        ),
      trades:
        account.trades.map(
          (trade) => ({
            ...trade,
          }),
        ),
      supportedLeverage:
        FUTURES_ALLOWED_LEVERAGE,
      feeRate:
        FUTURES_TAKER_FEE_RATE,
      maintenanceMarginRate:
        FUTURES_MAINTENANCE_MARGIN_RATE,
      createdAt:
        account.createdAt,
      updatedAt:
        account.updatedAt,
    };
  }
}

export const futuresExecutionService =
  new FuturesExecutionService();