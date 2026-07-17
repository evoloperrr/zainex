export type FuturesDirection =
  | "LONG"
  | "SHORT";

export type FuturesOrderAction =
  | "OPEN"
  | "CLOSE"
  | "LIQUIDATE";

export type FuturesOrderStatus =
  | "FILLED"
  | "REJECTED";

export const FUTURES_INITIAL_BALANCE =
  10_000;

export const FUTURES_TAKER_FEE_RATE =
  0.0005;

export const FUTURES_MAINTENANCE_MARGIN_RATE =
  0.005;

export const FUTURES_ALLOWED_LEVERAGE =
  [1, 2, 5, 10, 20] as const;

export type FuturesLeverage =
  (typeof FUTURES_ALLOWED_LEVERAGE)[number];

export interface ValidatedFuturesOpenRequest {
  symbol: "BTCUSDT";
  direction: FuturesDirection;
  margin: number;
  leverage: FuturesLeverage;
  stopLoss: number;
  takeProfit: number;
  clientOrderId?: string;
}

export interface ValidatedFuturesCloseRequest {
  positionId: string;
  clientOrderId?: string;
}

export interface FuturesPosition {
  id: string;
  symbol: "BTCUSDT";
  direction: FuturesDirection;
  marginMode: "ISOLATED";
  leverage: FuturesLeverage;
  margin: number;
  quantity: number;
  entryPrice: number;
  markPrice: number;
  notional: number;
  entryFee: number;
  liquidationPrice: number;
  stopLoss: number;
  takeProfit: number;
  maintenanceMarginRate: number;
  unrealizedPnl: number;
  roePercent: number;
  markProvider: string;
  openedAt: string;
  updatedAt: string;
}

export interface FuturesOrder {
  id: string;
  clientOrderId: string;
  action: FuturesOrderAction;
  direction: FuturesDirection;
  symbol: "BTCUSDT";
  status: FuturesOrderStatus;
  marginMode: "ISOLATED";
  leverage: FuturesLeverage;
  margin: number;
  quantity: number;
  executedPrice: number;
  notional: number;
  fee: number;
  feeRate: number;
  reduceOnly: boolean;
  quoteProvider: string;
  createdAt: string;
}

export interface FuturesTrade {
  id: string;
  orderId: string;
  action: FuturesOrderAction;
  direction: FuturesDirection;
  symbol: "BTCUSDT";
  leverage: FuturesLeverage;
  margin: number;
  quantity: number;
  price: number;
  entryPrice: number;
  notional: number;
  fee: number;
  realizedPnl: number;
  reason:
    | "USER_OPEN"
    | "USER_CLOSE"
    | "STOP_LOSS"
    | "TAKE_PROFIT"
    | "LIQUIDATION";
  executedAt: string;
}

export interface FuturesAccountState {
  sessionId: string;
  currency: "USDT";
  initialBalance: number;
  availableBalance: number;
  realizedPnl: number;
  positions: Record<string, FuturesPosition>;
  orders: FuturesOrder[];
  trades: FuturesTrade[];
  createdAt: string;
  updatedAt: string;
}

export interface FuturesAccountSnapshot {
  mode: "paper-futures";
  product: "USDT-M-PERPETUAL";
  storage: {
    kind: "memory";
    durable: false;
  };
  model: {
    marginMode: "ISOLATED";
    positionMode: "ONE_WAY";
    liquidation:
      "SIMPLIFIED_ISOLATED_V1";
    fundingSettlement: false;
  };
  sessionId: string;
  currency: "USDT";
  initialBalance: number;
  availableBalance: number;
  usedMargin: number;
  totalEquity: number;
  realizedPnl: number;
  unrealizedPnl: number;
  positions: FuturesPosition[];
  orders: FuturesOrder[];
  trades: FuturesTrade[];
  supportedLeverage:
    readonly FuturesLeverage[];
  feeRate: number;
  maintenanceMarginRate: number;
  createdAt: string;
  updatedAt: string;
}

export interface FuturesExecutionResult {
  order: FuturesOrder;
  trade: FuturesTrade;
  account: FuturesAccountSnapshot;
  idempotentReplay: boolean;
  quoteProvider: string;
}