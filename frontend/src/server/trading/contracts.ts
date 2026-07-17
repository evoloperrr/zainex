export type AssetClass = "crypto" | "forex" | "stocks";
export type OrderSide = "BUY" | "SELL";
export type OrderType = "MARKET";
export type OrderStatus = "FILLED" | "REJECTED";

export const PAPER_TRADING_INITIAL_BALANCE = 10_000;
export const PAPER_SPOT_FEE_RATE = 0.001;

export interface TradingContext {
  sessionId: string;
  requestId: string;
}

export interface ValidatedOrderRequest {
  adapter: string;
  assetClass: AssetClass;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  quantity: number;
  clientOrderId?: string;
}

export interface MarketLookup {
  assetClass: AssetClass;
  symbol: string;
}

export interface MarketPriceQuote extends MarketLookup {
  provider: string;
  price: number;
  timestamp: string;
}

export interface TradingOrder {
  id: string;
  clientOrderId: string;
  adapter: string;
  assetClass: AssetClass;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  status: OrderStatus;
  quantity: number;
  executedPrice: number;
  notional: number;
  fee: number;
  feeRate: number;
  createdAt: string;
}

export interface TradeRecord {
  id: string;
  orderId: string;
  assetClass: AssetClass;
  symbol: string;
  side: OrderSide;
  quantity: number;
  price: number;
  notional: number;
  fee: number;
  realizedPnl: number;
  executedAt: string;
}

export interface Position {
  id: string;
  assetClass: AssetClass;
  symbol: string;
  quantity: number;
  averageEntryPrice: number;
  lastPrice: number;
  marketValue: number;
  unrealizedPnl: number;
  openedAt: string;
  updatedAt: string;
}

export interface PaperAccountState {
  sessionId: string;
  currency: "USD";
  initialBalance: number;
  cashBalance: number;
  realizedPnl: number;
  positions: Record<string, Position>;
  orders: TradingOrder[];
  trades: TradeRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface PaperAccountSnapshot {
  mode: "paper";
  storage: {
    kind: "memory";
    durable: false;
  };
  sessionId: string;
  currency: "USD";
  initialBalance: number;
  cashBalance: number;
  positionsMarketValue: number;
  totalEquity: number;
  realizedPnl: number;
  unrealizedPnl: number;
  positions: Position[];
  orders: TradingOrder[];
  trades: TradeRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface OrderExecutionResult {
  order: TradingOrder;
  trade: TradeRecord;
  account: PaperAccountSnapshot;
  idempotentReplay: boolean;
  quoteProvider: string;
}

export interface MarketDescriptor {
  assetClass: AssetClass;
  symbol: string;
}

export interface CandleRequest extends MarketLookup {
  interval: string;
  limit: number;
}

export interface MarketPriceProvider {
  readonly id: string;

  supports(assetClass: AssetClass, symbol: string): boolean;

  getPrice(
    assetClass: AssetClass,
    symbol: string,
  ): Promise<MarketPriceQuote>;
}

export interface ExchangeAdapter {
  readonly id: string;

  connect(context: TradingContext): Promise<void>;

  getBalance(context: TradingContext): Promise<PaperAccountSnapshot>;

  getMarkets(): Promise<readonly MarketDescriptor[]>;

  getTicker(request: MarketLookup): Promise<MarketPriceQuote>;

  getCandles(request: CandleRequest): Promise<readonly unknown[]>;

  placeOrder(
    context: TradingContext,
    request: ValidatedOrderRequest,
  ): Promise<OrderExecutionResult>;

  cancelOrder(
    context: TradingContext,
    orderId: string,
  ): Promise<never>;

  closePosition(
    context: TradingContext,
    positionId: string,
  ): Promise<OrderExecutionResult>;

  getOpenOrders(
    context: TradingContext,
  ): Promise<readonly TradingOrder[]>;

  getPositions(
    context: TradingContext,
  ): Promise<readonly Position[]>;
}
