"use client";
import { useRouter } from "next/navigation";

import { SharedProfileMenu } from "@/components/shared-profile-menu";
import { useCurrency } from "@/components/currency-provider";
import { TradingViewChart } from "@/components/tradingview-chart";
import { FuturesPaperTerminal } from "@/components/futures-paper-terminal";
import { signOut } from "next-auth/react";
import { createPortal } from "react-dom";
import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  CRYPTO_ASSET_NAMES,
  CRYPTO_SYMBOL_LABELS,
  SUPPORTED_CRYPTO_SYMBOLS,
  type CryptoSymbol,
} from "@/lib/crypto-symbols";

import {
  FOREX_PAIR_LABELS,
  FOREX_PAIR_NAMES,
  SUPPORTED_FOREX_PAIRS,
  type ForexPair,
} from "@/lib/forex-symbols";

import { useBodyScrollLock } from "@/lib/use-body-scroll-lock";

type MarketKey = "crypto" | "forex" | "stocks";

type IconName =
  | "home"
  | "search"
  | "rocket"
  | "layers"
  | "wallet"
  | "bolt"
  | "flow"
  | "download"
  | "link"
  | "chart"
  | "diamond"
  | "crown"
  | "star"
  | "share"
  | "arrow"
  | "filter"
  | "copy"
  | "more"
  | "billing";

type Candle = {
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
};

type MarketData = {
  label: string;
  network: string;
  symbol: string;
  assetName: string;

  price: string;
  rawPrice: string;
  currencySymbol: string;
  change: string;
  secondaryValue: string;

  liquidityLabel: string;
  liquidity: string;

  volumeLabel: string;
  volume: string;

  pooledPrimaryLabel: string;
  pooledPrimary: string;

  pooledSecondaryLabel: string;
  pooledSecondary: string;

  score: string;
  trust: string;
  votes: string;
  accent: string;
  shift: number;
  line: string;
};

type LiveMarketResponse = {
  ok: boolean;
  summary?: Partial<MarketData>;
  error?: string;
};

type PaperTradeSide = "BUY" | "SELL";

type PaperTradeApiResponse = {
  ok: boolean;
  result?: {
    order?: {
      side: PaperTradeSide;
      symbol: string;
      quantity: number;
      executedPrice: number;
      fee: number;
      status: string;
    };
    account?: {
      cashBalance: number;
      totalEquity: number;
    };
    quoteProvider?: string;
  };
  error?: {
    message?: string;
  };
};

type PaperTradeHistoryRecord = {
  id: string;
  orderId: string;
  assetClass: MarketKey;
  symbol: string;
  side: PaperTradeSide;
  quantity: number;
  price: number;
  notional: number;
  fee: number;
  realizedPnl: number;
  executedAt: string;
};

type PaperPositionSnapshot = {
  id: string;
  assetClass: MarketKey;
  symbol: string;
  quantity: number;
  averageEntryPrice: number;
  lastPrice: number;
  marketValue: number;
  unrealizedPnl: number;
  openedAt: string;
  updatedAt: string;
};

type PaperAccountSnapshot = {
  mode: "paper";
  storage: {
    kind: "memory";
    durable: false;
  };
  currency: "USD";
  initialBalance: number;
  cashBalance: number;
  positionsMarketValue: number;
  totalEquity: number;
  realizedPnl: number;
  unrealizedPnl: number;
  positions: PaperPositionSnapshot[];
  trades: PaperTradeHistoryRecord[];
  createdAt: string;
  updatedAt: string;
};

type PaperAccountApiResponse = {
  ok: boolean;
  account?: PaperAccountSnapshot;
  error?: {
    message?: string;
  };
};

const PAPER_ACCOUNT_UPDATED_EVENT =
  "zainex:paper-account-updated";

function formatPaperUsd(
  value: number,
  maximumFractionDigits = 2,
): string {
  return (
    "$" +
    value.toLocaleString(
      undefined,
      {
        minimumFractionDigits: 2,
        maximumFractionDigits,
      },
    )
  );
}

function formatPaperQuantity(
  value: number,
): string {
  return value.toLocaleString(
    undefined,
    {
      maximumFractionDigits: 8,
    },
  );
}

function formatPaperExecutionTime(
  value: string,
): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "--:--:--";
  }

  return date.toLocaleTimeString(
    [],
    {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    },
  );
}

function shortenPaperOrderId(
  value: string,
): string {
  if (value.length <= 14) {
    return value;
  }

  return (
    value.slice(0, 6) +
    "..." +
    value.slice(-6)
  );
}

async function fetchPaperAccount(
  signal?: AbortSignal,
): Promise<PaperAccountSnapshot> {
  const response = await fetch(
    "/api/trading/account",
    {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
      },
      signal,
    },
  );

  const payload =
    (await response.json()) as
      PaperAccountApiResponse;

  if (
    !response.ok ||
    !payload.ok ||
    !payload.account
  ) {
    throw new Error(
      payload.error?.message ??
        "Account is unavailable.",
    );
  }

  return payload.account;
}

type PaperTradeModalRequest = {
  side: PaperTradeSide;
  activeMarket: MarketKey;
  market: MarketData;
  symbol: string;
  quantity: number;
  stopLoss?: number;
  takeProfit?: number;
};

type PaperTradeModalResult = {
  order: {
    side: PaperTradeSide;
    symbol: string;
    quantity: number;
    executedPrice: number;
    fee: number;
    status: string;
  };
  quoteProvider?: string;
  account?: PaperAccountSnapshot;
  trade?: PaperTradeHistoryRecord;
};

type PaperTradeModalState =
  | {
      phase: "confirm";
      request: PaperTradeModalRequest;
    }
  | {
      phase: "pending";
      request: PaperTradeModalRequest;
    }
  | {
      phase: "success";
      request: PaperTradeModalRequest;
      result: PaperTradeModalResult;
    }
  | {
      phase: "error";
      request: PaperTradeModalRequest;
      message: string;
    };

type PaperTradeOutcome =
  | "OPEN"
  | "WIN"
  | "LOSS"
  | "EVEN";

const PAPER_TRADE_MODAL_EVENT =
  "zainex:paper-trade-modal";

let paperTradeRequestPending = false;

function formatSignedPaperUsd(
  value: number,
  maximumFractionDigits = 8,
): string {
  const amount = formatPaperUsd(
    Math.abs(value),
    maximumFractionDigits,
  );

  if (value > 0) {
    return `+${amount}`;
  }

  if (value < 0) {
    return `-${amount}`;
  }

  return amount;
}

function getPaperTradeOutcome(
  trade: PaperTradeHistoryRecord,
): PaperTradeOutcome {
  if (trade.side === "BUY") {
    return "OPEN";
  }

  if (trade.realizedPnl > 0.00000001) {
    return "WIN";
  }

  if (trade.realizedPnl < -0.00000001) {
    return "LOSS";
  }

  return "EVEN";
}

function getPaperPnlClass(
  value: number,
): string {
  if (value > 0.00000001) {
    return "positive";
  }

  if (value < -0.00000001) {
    return "negative";
  }

  return "neutral";
}

function submitPaperTrade(
  side: PaperTradeSide,
  activeMarket: MarketKey,
  market: MarketData,
  quantity: number,
  stopLoss?: number,
  takeProfit?: number,
): void {
  const request: PaperTradeModalRequest = {
    side,
    activeMarket,
    market,
    symbol: market.symbol
      .replace(/[^A-Za-z0-9]/g, "")
      .toUpperCase(),
    quantity,
    stopLoss,
    takeProfit,
  };

  window.dispatchEvent(
    new CustomEvent<PaperTradeModalRequest>(
      PAPER_TRADE_MODAL_EVENT,
      {
        detail: request,
      },
    ),
  );
}

async function executePaperTrade(
  request: PaperTradeModalRequest,
): Promise<PaperTradeModalResult> {
  if (paperTradeRequestPending) {
    throw new Error(
      "Another order is already processing.",
    );
  }

  if (request.activeMarket !== "crypto") {
    throw new Error(
      "Trading currently supports Crypto only.",
    );
  }

  paperTradeRequestPending = true;

  try {
    const response = await fetch(
      "/api/trading/orders",
      {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          adapter: "paper",
          assetClass: "crypto",
          symbol: request.symbol,
          side: request.side,
          type: "MARKET",
          quantity: request.quantity,
          ...(request.side === "BUY" &&
          request.stopLoss !== undefined
            ? { stopLoss: request.stopLoss }
            : {}),
          ...(request.side === "BUY" &&
          request.takeProfit !== undefined
            ? { takeProfit: request.takeProfit }
            : {}),
          clientOrderId:
            "ui-" +
            request.side.toLowerCase() +
            "-" +
            Date.now().toString(36) +
            "-" +
            Math.random()
              .toString(36)
              .slice(2, 10),
        }),
      },
    );

    const payload =
      (await response.json()) as
        PaperTradeApiResponse;

    if (
      !response.ok ||
      !payload.ok ||
      !payload.result?.order
    ) {
      throw new Error(
        payload.error?.message ??
          "The order could not be executed.",
      );
    }

    let account:
      | PaperAccountSnapshot
      | undefined;

    let trade:
      | PaperTradeHistoryRecord
      | undefined;

    try {
      account = await fetchPaperAccount();

      trade = account.trades.find(
        (item) =>
          item.side === request.side &&
          item.symbol === request.symbol,
      );
    }
    catch {
      account = undefined;
      trade = undefined;
    }

    return {
      order: payload.result.order,
      quoteProvider:
        payload.result.quoteProvider,
      account,
      trade,
    };
  }
  finally {
    paperTradeRequestPending = false;
  }
}

function PaperTradeModalHost() {
  const [
    modal,
    setModal,
  ] = useState<PaperTradeModalState | null>(
    null,
  );

  useEffect(() => {
    const handleModalRequest = (
      event: Event,
    ) => {
      const request = (
        event as CustomEvent<PaperTradeModalRequest>
      ).detail;

      if (!request) {
        return;
      }

      if (request.activeMarket !== "crypto") {
        setModal({
          phase: "error",
          request,
          message:
            "Trading currently supports Crypto only.",
        });

        return;
      }

      setModal({
        phase: "confirm",
        request,
      });
    };

    window.addEventListener(
      PAPER_TRADE_MODAL_EVENT,
      handleModalRequest,
    );

    return () => {
      window.removeEventListener(
        PAPER_TRADE_MODAL_EVENT,
        handleModalRequest,
      );
    };
  }, []);

  useBodyScrollLock(
    modal !== null,
  );

  useEffect(() => {
    if (!modal) {
      return;
    }

    const handleEscape = (
      event: KeyboardEvent,
    ) => {
      if (
        event.key === "Escape" &&
        modal.phase !== "pending"
      ) {
        setModal(null);
      }
    };

    window.addEventListener(
      "keydown",
      handleEscape,
    );

    return () => {
      window.removeEventListener(
        "keydown",
        handleEscape,
      );
    };
  }, [modal]);

  if (!modal) {
    return null;
  }

  const request = modal.request;

  const closeModal = () => {
    if (modal.phase !== "pending") {
      setModal(null);
    }
  };

  const confirmTrade = async () => {
    if (modal.phase !== "confirm") {
      return;
    }

    setModal({
      phase: "pending",
      request,
    });

    try {
      const result =
        await executePaperTrade(
          request,
        );

      window.dispatchEvent(
        new Event(
          PAPER_ACCOUNT_UPDATED_EVENT,
        ),
      );

      setModal({
        phase: "success",
        request,
        result,
      });
    }
    catch (error) {
      setModal({
        phase: "error",
        request,
        message:
          error instanceof Error
            ? error.message
            : "The order failed.",
      });
    }
  };

  const resultTrade =
    modal.phase === "success"
      ? modal.result.trade
      : undefined;

  const resultOutcome =
    resultTrade
      ? getPaperTradeOutcome(
          resultTrade,
        )
      : request.side === "BUY"
        ? "OPEN"
        : "FILLED";

  return (
    <div
      className="zainex-trade-modal-backdrop"
      onMouseDown={(event) => {
        if (
          event.target ===
          event.currentTarget
        ) {
          closeModal();
        }
      }}
    >
      <section
        className={[
          "zainex-trade-modal",
          `side-${request.side.toLowerCase()}`,
        ].join(" ")}
        role="dialog"
        aria-modal="true"
        aria-labelledby="zainex-trade-modal-title"
      >
        <div className="zainex-trade-modal-glow" />

        <header className="zainex-trade-modal-header">
          <div>
            <span>
              ZAINEX EXECUTION
            </span>

            <h2 id="zainex-trade-modal-title">
              {modal.phase === "confirm"
                ? `Confirm ${request.side}`
                : modal.phase === "pending"
                  ? "Executing order"
                  : modal.phase === "success"
                    ? "Order filled"
                    : "Order failed"}
            </h2>
          </div>

          <button
            type="button"
            onClick={closeModal}
            disabled={
              modal.phase === "pending"
            }
            aria-label="Close trade modal"
          >
            X
          </button>
        </header>

        <div className="zainex-trade-demo-label">
          <i />
          REAL MARKET PRICE | VIRTUAL FUNDS
        </div>

        {modal.phase === "confirm" ? (
          <>
            <div className="zainex-trade-modal-order">
              <b
                className={`side-${request.side.toLowerCase()}`}
              >
                {request.side}
              </b>

              <div>
                <strong>
                  {request.symbol}
                </strong>

                <span>
                  Market order
                </span>
              </div>

              <strong>
                {formatPaperQuantity(
                  request.quantity,
                )}
              </strong>
            </div>

            <div className="zainex-trade-modal-data">
              <div>
                <span>Displayed price</span>
                <strong>
                  {request.market.price}
                </strong>
              </div>

              <div>
                <span>Execution source</span>
                <strong>
                  LIVE PROVIDER
                </strong>
              </div>

              <div>
                <span>Order type</span>
                <strong>MARKET</strong>
              </div>

              <div>
                <span>Trading mode</span>
                <strong>SIMULATED</strong>
              </div>

              {request.side === "BUY" &&
              request.stopLoss !== undefined ? (
                <div>
                  <span>Stop loss</span>
                  <strong>
                    {formatPaperUsd(
                      request.stopLoss,
                    )}
                  </strong>
                </div>
              ) : null}

              {request.side === "BUY" &&
              request.takeProfit !== undefined ? (
                <div>
                  <span>Take profit</span>
                  <strong>
                    {formatPaperUsd(
                      request.takeProfit,
                    )}
                  </strong>
                </div>
              ) : null}
            </div>

            <p className="zainex-trade-modal-note">
              Final execution uses the newest
              available public exchange price.
              {request.side === "BUY"
                ? " BUY opens or adds to the virtual BTC position."
                : " SELL closes virtual BTC quantity and calculates the actual result."}
            </p>
          </>
        ) : null}

        {modal.phase === "pending" ? (
          <div className="zainex-trade-modal-pending">
            <i />

            <strong>
              Processing {request.side}
            </strong>

            <span>
              Fetching the real public market
              price and updating the virtual
              account.
            </span>
          </div>
        ) : null}

        {modal.phase === "success" ? (
          <>
            <div className="zainex-trade-modal-success">
              <i className="zainex-trade-success-check" aria-hidden="true" />

              <div>
                <strong>
                  {modal.result.order.side} FILLED
                </strong>

                <span>
                  {modal.result.order.symbol}
                  {" | "}
                  {formatPaperQuantity(
                    modal.result.order.quantity,
                  )}
                </span>
              </div>

              <b
                className={`outcome-${resultOutcome.toLowerCase()}`}
              >
                {resultOutcome}

                {resultTrade &&
                resultTrade.side === "SELL"
                  ? ` ${formatSignedPaperUsd(
                      resultTrade.realizedPnl,
                      8,
                    )}`
                  : ""}
              </b>
            </div>

            <div className="zainex-trade-modal-data">
              <div>
                <span>Execution price</span>

                <strong>
                  {formatPaperUsd(
                    modal.result.order
                      .executedPrice,
                    8,
                  )}
                </strong>
              </div>

              <div>
                <span>Trading fee</span>

                <strong>
                  {formatPaperUsd(
                    modal.result.order.fee,
                    8,
                  )}
                </strong>
              </div>

              <div>
                <span>Price provider</span>

                <strong>
                  {modal.result
                    .quoteProvider ??
                    "public-market"}
                </strong>
              </div>

              <div>
                <span>Order status</span>

                <strong>
                  {modal.result.order.status}
                </strong>
              </div>

              <div>
                <span>Virtual cash</span>

                <strong>
                  {modal.result.account
                    ? formatPaperUsd(
                        modal.result.account
                          .cashBalance,
                      )
                    : "--"}
                </strong>
              </div>

              <div>
                <span>Total equity</span>

                <strong>
                  {modal.result.account
                    ? formatPaperUsd(
                        modal.result.account
                          .totalEquity,
                      )
                    : "--"}
                </strong>
              </div>

              <div>
                <span>Total realized PnL</span>

                <strong>
                  {modal.result.account
                    ? formatSignedPaperUsd(
                        modal.result.account
                          .realizedPnl,
                        8,
                      )
                    : "--"}
                </strong>
              </div>

              <div>
                <span>Open unrealized PnL</span>

                <strong>
                  {modal.result.account
                    ? formatSignedPaperUsd(
                        modal.result.account
                          .unrealizedPnl,
                        8,
                      )
                    : "--"}
                </strong>
              </div>
            </div>
          </>
        ) : null}

        {modal.phase === "error" ? (
          <div className="zainex-trade-modal-error">
            <i>!</i>

            <div>
              <strong>
                {request.side} NOT EXECUTED
              </strong>

              <span>
                {modal.message}
              </span>
            </div>
          </div>
        ) : null}

        <footer className="zainex-trade-modal-actions">
          {modal.phase === "confirm" ? (
            <>
              <button
                type="button"
                className="secondary"
                onClick={closeModal}
              >
                Cancel
              </button>

              <button
                type="button"
                className={`primary side-${request.side.toLowerCase()}`}
                onClick={() => {
                  void confirmTrade();
                }}
              >
                Confirm {request.side}
              </button>
            </>
          ) : null}

          {modal.phase === "pending" ? (
            <button
              type="button"
              className="primary"
              disabled
            >
              Processing...
            </button>
          ) : null}

          {modal.phase === "success" ||
          modal.phase === "error" ? (
            <button
              type="button"
              className="primary"
              onClick={closeModal}
            >
              Close
            </button>
          ) : null}
        </footer>
      </section>
    </div>
  );
}

const markets: Record<
  MarketKey,
  MarketData
> = {
  crypto: {
    label: "Crypto",
    network: "Digital asset market",
    symbol: "BTC / USDT",
    assetName: "Bitcoin",

    price: "--",
    rawPrice: "--",
    currencySymbol: "$",
    change: "--",
    secondaryValue: "BTC / USDT",

    liquidityLabel: "24H quote volume",
    liquidity: "--",

    volumeLabel: "24H base volume",
    volume: "--",

    pooledPrimaryLabel: "24H high",
    pooledPrimary: "--",

    pooledSecondaryLabel: "24H low",
    pooledSecondary: "--",

    score: "97",
    trust: "86%",
    votes: "25 votes",
    accent: "#35bdf8",
    shift: 0,
    line:
      "0,180 65,167 130,181 195,146 260,155 325,126 390,139 455,98 520,116 585,82 650,101 715,62 780,86 845,48 910,73 1000,42",
  },

  forex: {
    label: "Forex",
    network: "Global currency market",
    symbol: "EUR / USD",
    assetName: "Euro versus US Dollar",

    price: "--",
    rawPrice: "--",
    currencySymbol: "",
    change: "--",
    secondaryValue: "EUR / USD",

    liquidityLabel: "Previous close",
    liquidity: "--",

    volumeLabel: "Session high",
    volume: "--",

    pooledPrimaryLabel: "Session low",
    pooledPrimary: "--",

    pooledSecondaryLabel: "Market state",
    pooledSecondary: "--",

    score: "91",
    trust: "82%",
    votes: "31 votes",
    accent: "#8b6cff",
    shift: 10,
    line:
      "0,174 65,151 130,166 195,128 260,145 325,111 390,128 455,101 520,117 585,88 650,105 715,75 780,92 845,60 910,77 1000,54",
  },

  stocks: {
    label: "Stocks",
    network: "Global equity market",
    symbol: "NVDA",
    assetName: "NVIDIA Corporation",

    price: "--",
    rawPrice: "--",
    currencySymbol: "$",
    change: "--",
    secondaryValue: "1 NVDA",

    liquidityLabel: "Market volume",
    liquidity: "--",

    volumeLabel: "Previous close",
    volume: "--",

    pooledPrimaryLabel: "Day high",
    pooledPrimary: "--",

    pooledSecondaryLabel: "Day low",
    pooledSecondary: "--",

    score: "94",
    trust: "88%",
    votes: "42 votes",
    accent: "#df58ff",
    shift: -4,
    line:
      "0,192 65,171 130,184 195,151 260,164 325,130 390,144 455,110 520,125 585,90 650,111 715,70 780,94 845,55 910,78 1000,48",
  },
};
const baseCandles: Candle[] = [
  { open: 205, close: 194, high: 184, low: 216, volume: 42 },
  { open: 196, close: 181, high: 172, low: 208, volume: 58 },
  { open: 180, close: 187, high: 168, low: 199, volume: 36 },
  { open: 189, close: 174, high: 162, low: 201, volume: 48 },
  { open: 173, close: 160, high: 149, low: 187, volume: 63 },
  { open: 160, close: 169, high: 151, low: 181, volume: 37 },
  { open: 170, close: 153, high: 142, low: 180, volume: 54 },
  { open: 151, close: 139, high: 130, low: 163, volume: 69 },
  { open: 140, close: 122, high: 112, low: 152, volume: 75 },
  { open: 121, close: 105, high: 94, low: 134, volume: 86 },
  { open: 106, close: 96, high: 84, low: 117, volume: 93 },
  { open: 96, close: 109, high: 88, low: 121, volume: 70 },
  { open: 110, close: 138, high: 101, low: 149, volume: 96 },
  { open: 138, close: 150, high: 128, low: 163, volume: 88 },
  { open: 149, close: 139, high: 129, low: 160, volume: 64 },
  { open: 139, close: 145, high: 131, low: 155, volume: 60 },
  { open: 145, close: 132, high: 122, low: 158, volume: 78 },
  { open: 133, close: 144, high: 124, low: 156, volume: 53 },
  { open: 145, close: 137, high: 127, low: 157, volume: 47 },
  { open: 138, close: 149, high: 129, low: 160, volume: 71 },
  { open: 148, close: 142, high: 132, low: 159, volume: 55 },
  { open: 143, close: 154, high: 134, low: 166, volume: 49 },
  { open: 153, close: 147, high: 138, low: 165, volume: 62 },
  { open: 148, close: 163, high: 139, low: 174, volume: 77 },
];

const desktopNav: Array<{
  label: string;
  icon: IconName;
  active?: boolean;
}> = [
  { label: "Dashboard", icon: "home" },
  { label: "Markets", icon: "search", active: true },
  { label: "AI Strategies", icon: "rocket" },
  { label: "Portfolios", icon: "layers" },
  { label: "Wallets", icon: "wallet" },
];

const desktopTools: Array<{
  label: string;
  icon: IconName;
  active?: boolean;
}> = [
  { label: "AI Signals", icon: "bolt", active: true },
  { label: "Workflow", icon: "flow" },
  { label: "Billing", icon: "billing" },
  { label: "Connections", icon: "link" },
  { label: "Analytics", icon: "chart" },
  { label: "Rewards", icon: "diamond" },
  { label: "Premium", icon: "crown" },
];

function Icon({
  name,
  size = 20,
}: {
  name: IconName;
  size?: number;
}) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (name) {
    case "home":
      return (
        <svg {...common}>
          <path d="M3 11.5 12 4l9 7.5" />
          <path d="M5.5 10.5V20h13v-9.5" />
          <path d="M9.5 20v-6h5v6" />
        </svg>
      );

    case "search":
      return (
        <svg {...common}>
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="m15.5 15.5 5 5" />
        </svg>
      );

    case "rocket":
      return (
        <svg {...common}>
          <path d="M14 5c2.7-2.1 5.7-1.5 6-1.4.1.4.7 3.3-1.4 6l-5.8 5.8-4.2-4.2L14 5Z" />
          <path d="m8.6 11.2-3.1.6-2 2 4.2 1.1" />
          <path d="m12.8 15.4-.6 3.1-2 2-1.1-4.2" />
          <circle cx="15.7" cy="7.9" r="1.5" />
        </svg>
      );

    case "layers":
      return (
        <svg {...common}>
          <path d="m12 3 9 5-9 5-9-5 9-5Z" />
          <path d="m3 12 9 5 9-5" />
          <path d="m3 16 9 5 9-5" />
        </svg>
      );

    case "wallet":
      return (
        <svg {...common}>
          <path d="M4 6.5h14.5A1.5 1.5 0 0 1 20 8v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h11" />
          <path d="M15 11h6v5h-6a2.5 2.5 0 0 1 0-5Z" />
          <circle cx="15.5" cy="13.5" r=".6" fill="currentColor" />
        </svg>
      );

    case "bolt":
      return (
        <svg {...common}>
          <path d="m13 2-8 12h6l-1 8 9-13h-6V2Z" />
        </svg>
      );

    case "flow":
      return (
        <svg {...common}>
          <circle cx="6" cy="5" r="2" />
          <circle cx="18" cy="5" r="2" />
          <circle cx="12" cy="19" r="2" />
          <path d="M6 7v3c0 2 2 3 6 3s6-1 6-3V7" />
          <path d="M12 13v4" />
        </svg>
      );

    case "download":
      return (
        <svg {...common}>
          <path d="M12 3v12" />
          <path d="m7 10 5 5 5-5" />
          <path d="M4 20h16" />
        </svg>
      );

        case "billing":
      return (
        <svg {...common}>
          <rect
            x="3"
            y="5.5"
            width="18"
            height="13"
            rx="2.7"
          />
          <path d="M3 9.5h18" />
          <path d="M7 14h3.5" />
          <circle cx="16.5" cy="14" r="1.5" />
        </svg>
      );
case "link":
      return (
        <svg {...common}>
          <path d="m9.5 14.5 5-5" />
          <path d="M7 17H5.5a4.5 4.5 0 0 1 0-9H9" />
          <path d="M17 7h1.5a4.5 4.5 0 1 1 0 9H15" />
        </svg>
      );

    case "chart":
      return (
        <svg {...common}>
          <path d="M4 19V9" />
          <path d="M10 19V4" />
          <path d="M16 19v-7" />
          <path d="M22 19V7" />
        </svg>
      );

    case "diamond":
      return (
        <svg {...common}>
          <path d="m12 3 8 6-8 12L4 9l8-6Z" />
          <path d="m4 9 8 3 8-3" />
        </svg>
      );

    case "crown":
      return (
        <svg {...common}>
          <path d="m3 7 4 4 5-7 5 7 4-4-2 11H5L3 7Z" />
          <path d="M5 21h14" />
        </svg>
      );

    case "star":
      return (
        <svg {...common}>
          <path d="m12 3 2.8 5.8 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.7l6.2-.9L12 3Z" />
        </svg>
      );

    case "share":
      return (
        <svg {...common}>
          <circle cx="18" cy="5" r="2.5" />
          <circle cx="6" cy="12" r="2.5" />
          <circle cx="18" cy="19" r="2.5" />
          <path d="m8.2 10.8 7.6-4.5" />
          <path d="m8.2 13.2 7.6 4.5" />
        </svg>
      );

    case "arrow":
      return (
        <svg {...common}>
          <path d="M4 12h16" />
          <path d="m14 6 6 6-6 6" />
        </svg>
      );

    case "filter":
      return (
        <svg {...common}>
          <path d="M3 5h18l-7 8v6l-4 2v-8L3 5Z" />
        </svg>
      );

    case "copy":
      return (
        <svg {...common}>
          <rect x="8" y="8" width="11" height="11" rx="2" />
          <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
        </svg>
      );

    case "more":
      return (
        <svg {...common}>
          <circle cx="5" cy="12" r="1" fill="currentColor" />
          <circle cx="12" cy="12" r="1" fill="currentColor" />
          <circle cx="19" cy="12" r="1" fill="currentColor" />
        </svg>
      );

    default:
      return null;
  }
}

function AmbientBackground() {
  return (
    <>
      <div className="ambient-light ambient-light-one" />
      <div className="ambient-light ambient-light-two" />
      <div className="ambient-light ambient-light-three" />

      <svg
        className="background-wave"
        viewBox="0 0 1600 1100"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <defs>
          <linearGradient
            id="backgroundWaveStroke"
            x1="0"
            y1="0"
            x2="1"
            y2="0"
          >
            <stop offset="0%" stopColor="#2859ff" />
            <stop offset="45%" stopColor="#7656ff" />
            <stop offset="100%" stopColor="#ed3dff" />
          </linearGradient>

          <pattern
            id="backgroundDots"
            width="18"
            height="18"
            patternUnits="userSpaceOnUse"
          >
            <circle
              cx="2"
              cy="2"
              r="1"
              fill="#9580ff"
              fillOpacity=".24"
            />
          </pattern>

          <filter id="backgroundGlow">
            <feGaussianBlur stdDeviation="12" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <path
          d="M-100 810 C230 620 430 860 720 690 C1010 510 1220 730 1700 390 L1700 1200 L-100 1200 Z"
          fill="url(#backgroundDots)"
          opacity=".78"
        />

        <path
          d="M-100 745 C220 555 440 795 730 620 C1010 455 1240 660 1700 330"
          fill="none"
          stroke="url(#backgroundWaveStroke)"
          strokeWidth="8"
          strokeLinecap="round"
          opacity=".55"
          filter="url(#backgroundGlow)"
        />

        <path
          d="M-100 875 C230 690 480 920 760 750 C1040 575 1270 780 1700 520"
          fill="none"
          stroke="#4867ff"
          strokeWidth="3"
          strokeLinecap="round"
          opacity=".37"
        />
      </svg>
    </>
  );
}

export function DesktopSidebar({
  activeLabel,
}: {
  activeLabel?: string;
}) {
  const router = useRouter();
  return (
    <aside className="desktop-sidebar">
      <button
        className="desktop-logo"
        type="button"
        aria-label="ZAINEX"
        title="ZAINEX"
      >
        <span>Z</span>
      </button>

      <nav
        className="desktop-nav desktop-nav-primary"
        aria-label="Primary navigation"
      >
        {desktopNav.map((item) => (
          <button
            key={item.label}
            type="button"
            className={`desktop-nav-button ${
              (activeLabel ? activeLabel === item.label : item.active) ? "active" : ""
            }`}
            aria-label={item.label}
            title={item.label}
            data-label={item.label}
            onClick={() => {
              // ZAINEX_DESKTOP_SIDEBAR_DASHBOARD_ROUTE_V1
              if (item.label === "Dashboard") {
                router.push("/dashboard");
                return;
              }

              if (item.label === "AI Strategies") {
                router.push("/ai-strategies");
                return;
              }
              if (item.label === "Markets") {
                router.push("/market");
                return;
              }

              if (item.label === "Portfolios") {
                router.push("/portfolio");
                return;
              }

              // ZAINEX_WALLET_AI_CREDITS_ROUTE_V1_3
              if (item.label === "Wallets") {
                router.push("/wallet");
              }
            }}
          >
            <Icon name={item.icon} />
          </button>
        ))}
      </nav>

      <div className="desktop-nav-divider" />

      <nav
        className="desktop-nav desktop-nav-tools"
        aria-label="Trading tools"
      >
        {desktopTools.map((item) => (
          <button
            key={item.label}
            type="button"
            className={`desktop-nav-button ${
              (activeLabel ? activeLabel === item.label : item.active) ? "active secondary-active" : ""
            }`}
            aria-label={item.label}
            title={item.label}
            data-label={item.label}
            onClick={() => {
              if (item.label === "AI Signals") {
                router.push("/ai-signals");
                return;
              }

              if (item.label === "Workflow") {
                router.push("/workflow");
                return;
              }

              if (item.label === "Billing") {
                router.push("/billing");
                return;
              }

              if (item.label === "Connections") {
                router.push("/connections");
                return;
              }

              if (item.label === "Analytics") {
                router.push("/analytics");
                return;
              }

              if (item.label === "Premium") {
                router.push("/premium");
                return;
              }

              // ZAINEX_THREE_LEVEL_REFERRALS_V1
              if (item.label === "Rewards") {
                router.push("/rewards");
              }
            }}
>
            <Icon name={item.icon} />
          </button>
        ))}
      </nav>
    </aside>
  );
}

function MarketSwitcher({
  activeMarket,
  setActiveMarket,
  compact = false,
}: {
  activeMarket: MarketKey;
  setActiveMarket: (market: MarketKey) => void;
  compact?: boolean;
}) {
  const tabs: Array<{ key: MarketKey; label: string }> = [
    { key: "crypto", label: "Crypto" },
    { key: "forex", label: "Forex" },
    { key: "stocks", label: "Stocks" },
  ];

  return (
    <div
      className={`market-switcher ${
        compact ? "market-switcher-compact" : ""
      }`}
      role="tablist"
      aria-label="Market selector"
    >
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={activeMarket === tab.key}
          className={`market-switch ${
            activeMarket === tab.key ? "active" : ""
          }`}
          onClick={() => setActiveMarket(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function CandlestickChart({
  market,
}: {
  market: MarketData;
}) {
  const shift = market.shift;

  return (
    <div className="desktop-chart-canvas">
      <div className="desktop-chart-grid" />

      <svg
        className="candlestick-chart"
        viewBox="0 0 1080 390"
        preserveAspectRatio="none"
        role="img"
        aria-label={`${market.label} candlestick chart`}
      >
        <defs>
          <linearGradient
            id="volumeGradient"
            x1="0"
            y1="0"
            x2="0"
            y2="1"
          >
            <stop
              offset="0%"
              stopColor={market.accent}
              stopOpacity=".38"
            />
            <stop
              offset="100%"
              stopColor={market.accent}
              stopOpacity=".03"
            />
          </linearGradient>

          <filter id="candleGlow">
            <feGaussianBlur stdDeviation="3.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {baseCandles.map((candle, index) => {
          const x = 36 + index * 42;
          const open = candle.open + shift;
          const close = candle.close + shift;
          const high = candle.high + shift;
          const low = candle.low + shift;
          const rising = close < open;
          const color = rising ? "#2fd8ff" : "#c95cff";
          const bodyY = Math.min(open, close);
          const bodyHeight = Math.max(7, Math.abs(close - open));
          const volumeHeight = candle.volume * 0.78;

          return (
            <g key={`${x}-${open}-${close}`}>
              <rect
                x={x - 6}
                y={350 - volumeHeight}
                width="12"
                height={volumeHeight}
                rx="2"
                fill="url(#volumeGradient)"
                opacity={rising ? ".76" : ".38"}
              />

              <line
                x1={x}
                y1={high}
                x2={x}
                y2={low}
                stroke={color}
                strokeWidth="2"
                opacity=".88"
              />

              <rect
                x={x - 6}
                y={bodyY}
                width="12"
                height={bodyHeight}
                rx="2"
                fill={color}
                filter="url(#candleGlow)"
              />
            </g>
          );
        })}

        <line
          x1="36"
          y1={138 + shift}
          x2="1044"
          y2={138 + shift}
          stroke={market.accent}
          strokeWidth="1.5"
          strokeDasharray="5 6"
          opacity=".42"
        />

        <circle
          cx="1044"
          cy={138 + shift}
          r="4"
          fill={market.accent}
        />
      </svg>

      <div className="desktop-chart-price-scale">
        <span>1.30</span>
        <span>1.25</span>
        <span>1.20</span>
        <span>1.15</span>
        <span>1.10</span>
        <span>1.05</span>
      </div>

      <div className="desktop-chart-time-scale">
        <span>03</span>
        <span>06</span>
        <span>09</span>
        <span>12</span>
        <span>15</span>
        <span>18</span>
        <span>21</span>
        <span>00</span>
        <span>03</span>
        <span>06</span>
        <span>09</span>
        <span>12</span>
      </div>

      <div className="crosshair crosshair-horizontal" />
      <div className="crosshair crosshair-vertical" />
      <div className="crosshair-point" />
    </div>
  );
}

/* ZAINEX_PROFILE_FLOATING_PANEL_V1 */

type ProfileMenuSessionResponse = {
  user?: {
    name?: string | null;
    email?: string | null;
  };
};

type ProfileMenuAccountResponse = {
  account?: {
    availableBalance?: number;
    user?: {
      name?: string;
      email?: string;
      role?: string;
      walletBalance?: number;
      credits?: number;
    } | null;
  };
};

function DesktopProfileMenu({
  anchor,
  open,
  onClose,
}: {
  anchor: {
    current: HTMLButtonElement | null;
  };
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();

  const {
    formatUsd: formatDisplayCurrency,
    formatCredits,
  } = useCurrency();

  function formatProfileMenuUsd(
    value: number | null,
  ): string {
    if (
      value === null ||
      !Number.isFinite(value)
    ) {
      return "--";
    }

    return formatDisplayCurrency(
      value,
    );
  }

  const menuRef =
    useRef<HTMLDivElement>(null);

  const [
    position,
    setPosition,
  ] = useState({
    top: 76,
    right: 18,
  });

  const [
    identity,
    setIdentity,
  ] = useState({
    name: "Evoloperr",
    email: "evoloperr@gmail.com",
    role: "ROOT",
  });

  const [
    walletBalance,
    setWalletBalance,
  ] = useState<number | null>(null);

  const [
    credits,
    setCredits,
  ] = useState<number | null>(null);

  const [
    signingOut,
    setSigningOut,
  ] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    const updatePosition = () => {
      const rect =
        anchor.current
          ?.getBoundingClientRect();

      if (!rect) {
        return;
      }

      setPosition({
        top: rect.bottom + 10,
        right: Math.max(
          16,
          window.innerWidth -
            rect.right,
        ),
      });
    };

    const handleOutsideClick = (
      event: MouseEvent,
    ) => {
      const target =
        event.target as Node;

      if (
        menuRef.current
          ?.contains(target) ||
        anchor.current
          ?.contains(target)
      ) {
        return;
      }

      onClose();
    };

    const handleKeyDown = (
      event: KeyboardEvent,
    ) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    updatePosition();

    window.addEventListener(
      "resize",
      updatePosition,
    );

    window.addEventListener(
      "scroll",
      updatePosition,
      true,
    );

    document.addEventListener(
      "mousedown",
      handleOutsideClick,
    );

    document.addEventListener(
      "keydown",
      handleKeyDown,
    );

    return () => {
      window.removeEventListener(
        "resize",
        updatePosition,
      );

      window.removeEventListener(
        "scroll",
        updatePosition,
        true,
      );

      document.removeEventListener(
        "mousedown",
        handleOutsideClick,
      );

      document.removeEventListener(
        "keydown",
        handleKeyDown,
      );
    };
  }, [
    anchor,
    onClose,
    open,
  ]);

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;

    const loadMenuData =
      async () => {
        const [
          sessionResult,
          accountResult,
        ] = await Promise.allSettled([
          fetch(
            "/api/auth/session",
            {
              cache: "no-store",
              credentials:
                "same-origin",
            },
          ),
          fetch(
            "/api/trading/futures/account",
            {
              cache: "no-store",
              credentials:
                "same-origin",
            },
          ),
        ]);

        if (cancelled) {
          return;
        }

        if (
          sessionResult.status ===
          "fulfilled"
        ) {
          const response =
            sessionResult.value;

          if (response.ok) {
            const payload =
              (await response.json()) as
                ProfileMenuSessionResponse;

            setIdentity(
              (current) => ({
                ...current,
                name:
                  payload.user?.name
                    ?.trim() ||
                  current.name,
                email:
                  payload.user?.email
                    ?.trim() ||
                  current.email,
              }),
            );
          }
        }

        if (
          accountResult.status ===
          "fulfilled"
        ) {
          const response =
            accountResult.value;

          if (response.ok) {
            const payload =
              (await response.json()) as
                ProfileMenuAccountResponse;

            const user =
              payload.account?.user;

            setWalletBalance(
              typeof user
                ?.walletBalance ===
                "number"
                ? user.walletBalance
                : null,
            );

            setCredits(
              typeof user?.credits ===
                "number"
                ? user.credits
                : null,
            );

            setIdentity(
              (current) => ({
                ...current,
                role:
                  user?.role?.trim() ||
                  current.role,
              }),
            );
          }
        }
      };

    void loadMenuData();

    return () => {
      cancelled = true;
    };
  }, [open]);

  if (
    !open ||
    typeof document === "undefined"
  ) {
    return null;
  }

  const navigate = (
    route: string,
  ) => {
    onClose();
    router.push(route);
  };

  return createPortal(
    <div
      ref={menuRef}
      className="zainex-profile-menu"
      style={{
        top: position.top,
        right: position.right,
      }}
      role="menu"
      aria-label="ZAINEX profile menu"
    >
      <section className="zainex-profile-menu-identity">
        <SessionUserInitials className="zainex-profile-menu-avatar" />

        <div>
          <strong>{identity.name}</strong>
          <span>{identity.email}</span>
          <small>{identity.role} ACCOUNT</small>
        </div>
      </section>

      <section className="zainex-profile-menu-balance">
        <div>
          <span>Wallet balance</span>
          <strong>
            {formatProfileMenuUsd(
              walletBalance,
            )}
          </strong>
        </div>

        <div>
          <span>AI credits</span>
          <strong>
            {credits === null
              ? "--"
              : formatCredits(
                  credits,
                )}
          </strong>
        </div>
      </section>

      <nav
        className="zainex-profile-menu-nav"
        aria-label="Profile navigation"
      >
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            navigate("/profile#account");
          }}
        >
          <Icon name="search" size={16} />

          <span>
            <strong>Profile settings</strong>
            <small>
              Identity and account details
            </small>
          </span>

          <b>â€º</b>
        </button>

        <button
          type="button"
          role="menuitem"
          onClick={() => {
            navigate("/profile#security");
          }}
        >
          <Icon name="star" size={16} />

          <span>
            <strong>Account & security</strong>
            <small>
              Google sign-in and session
            </small>
          </span>

          <b>â€º</b>
        </button>

        <button
          type="button"
          role="menuitem"
          onClick={() => {
            navigate("/profile#appearance");
          }}
        >
          <Icon name="diamond" size={16} />

          <span>
            <strong>Appearance</strong>
            <small>
              Theme and interface
            </small>
          </span>

          <b>â€º</b>
        </button>

        <button
          type="button"
          role="menuitem"
          onClick={() => {
            navigate("/wallet");
          }}
        >
          <Icon name="wallet" size={16} />

          <span>
            <strong>Wallet & credits</strong>
            <small>
              Balance and AI credits
            </small>
          </span>

          <b>â€º</b>
        </button>

        <button
          type="button"
          role="menuitem"
          onClick={() => {
            navigate("/ai-strategies");
          }}
        >
          <Icon name="bolt" size={16} />

          <span>
            <strong>AI strategies</strong>
            <small>
              Active strategy access
            </small>
          </span>

          <b>â€º</b>
        </button>

        <button
          type="button"
          role="menuitem"
          onClick={() => {
            navigate("/billing");
          }}
        >
          <Icon name="billing" size={16} />

          <span>
            <strong>Billing</strong>
            <small>
              Subscription settings
            </small>
          </span>

          <b>â€º</b>
        </button>
      </nav>

      <button
        type="button"
        className="zainex-profile-menu-signout"
        disabled={signingOut}
        onClick={async () => {
          if (signingOut) {
            return;
          }

          setSigningOut(true);

          await signOut({
            redirectTo: "/auth",
          });
        }}
      >
        <Icon name="arrow" size={16} />

        {signingOut
          ? "Signing out..."
          : "Sign out"}
      </button>
    </div>,
    document.body,
  );
}

function DesktopHeader() {
  return (
    <header className="desktop-header">
      <div className="desktop-brand">
        <div className="desktop-brand-symbol">
          <span>Z</span>
        </div>

        <div>
          <strong className="zainex-wordmark market-wordmark"><span className="zainex-wordmark-silver">Z</span><span className="zainex-wordmark-ai">AI</span><span className="zainex-wordmark-silver">NEX</span></strong>

          <small>
            multi-market terminal
          </small>
        </div>
      </div>

      <label className="desktop-search">
        <Icon name="search" size={18} />

        <input
          type="search"
          placeholder="Search market, symbol or wallet"
          aria-label="Search markets"
        />

        <kbd>CTRL K</kbd>
      </label>

      <div className="desktop-header-actions">
        <button
          className="network-button"
          type="button"
        >
          <span className="network-icon">
            <Icon name="bolt" size={15} />
          </span>

          AI Engine Online

          <span className="network-chevron">
            v
          </span>
        </button>

        <SharedProfileMenu />
      </div>
    </header>
  );
}

/* ZAINEX_SESSION_USER_DYNAMIC_INITIALS_V1 */
/* ZAINEX_GOOGLE_SESSION_AVATAR_V1 */
/* ZAINEX_GOOGLE_GRADIENT_INITIAL_AVATAR_V2 */
type GoogleAuthSessionResponse = {
  user?: {
    name?: string | null;
    email?: string | null;
  };
};

function getGoogleUserInitial(
  name: string | null | undefined,
  email: string | null | undefined,
): string {
  const source =
    name?.trim() ||
    email
      ?.trim()
      .split("@")[0] ||
    "";

  return source
    .slice(0, 1)
    .toUpperCase();
}

function SessionUserInitials({
  className,
}: {
  className?: string;
}) {
  const [initial, setInitial] =
    useState("");

  const [
    accessibleLabel,
    setAccessibleLabel,
  ] = useState(
    "Signed-in Google user",
  );

  useEffect(() => {
    let cancelled = false;

    const loadGoogleSessionUser =
      async () => {
        try {
          const response = await fetch(
            "/api/auth/session",
            {
              cache: "no-store",
              credentials:
                "same-origin",
            },
          );

          if (!response.ok) {
            return;
          }

          const payload =
            (await response.json()) as
              GoogleAuthSessionResponse;

          const user = payload.user;

          if (
            cancelled ||
            (!user?.name &&
              !user?.email)
          ) {
            return;
          }

          const nextInitial =
            getGoogleUserInitial(
              user.name,
              user.email,
            );

          if (!nextInitial) {
            return;
          }

          setInitial(nextInitial);

          setAccessibleLabel(
            user.name?.trim() ||
              user.email?.trim() ||
              "Signed-in Google user",
          );
        } catch {
          // Keep the avatar hidden until
          // the signed-in session is available.
        }
      };

    void loadGoogleSessionUser();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <span
      className={className}
      aria-label={accessibleLabel}
      title={accessibleLabel}
      style={{
        width: "100%",
        height: "100%",
        display: "grid",
        placeItems: "center",
        overflow: "hidden",
        borderRadius: "50%",
        background:
          "linear-gradient(135deg, #22d3ee 0%, #6366f1 52%, #d946ef 100%)",
        border:
          "1px solid rgba(255, 255, 255, 0.3)",
        boxShadow:
          "0 8px 24px rgba(99, 102, 241, 0.38), inset 0 1px 0 rgba(255, 255, 255, 0.2)",
        color: "#ffffff",
        fontSize: "20px",
        fontWeight: 500,
        lineHeight: 1,
        textShadow:
          "0 1px 8px rgba(0, 0, 0, 0.22)",
        opacity: initial ? 1 : 0,
        transition:
          "opacity 140ms ease",
      }}
    >
      {initial}
    </span>
  );
}

function DesktopAssetColumn({
  market,
  activeMarket,
  setActiveMarket,
  cryptoSymbol,
  setCryptoSymbol,
  forexPair,
  setForexPair,
}: {
  market: MarketData;
  activeMarket: MarketKey;
  setActiveMarket: (market: MarketKey) => void;
  cryptoSymbol: CryptoSymbol;
  setCryptoSymbol: (symbol: CryptoSymbol) => void;
  forexPair: ForexPair;
  setForexPair: (pair: ForexPair) => void;
}) {
  return (
    <section className="desktop-asset-column">
      <MarketSwitcher
        activeMarket={activeMarket}
        setActiveMarket={setActiveMarket}
        compact
      />

      <article className="desktop-asset-summary">
        <div className="asset-heading">
          <div className="asset-token">
            <div
              className="asset-token-logo"
              style={{
                background: `linear-gradient(145deg, ${market.accent}, #7d51ff)`,
              }}
            >
              {market.symbol.slice(0, 1)}
            </div>

            <div>
              <span>{market.network}</span>
              <strong>{market.symbol}</strong>
              <small>{market.assetName}</small>
            </div>
          </div>

          {activeMarket === "crypto" ? (
            <select
              aria-label="Select crypto pair"
              value={cryptoSymbol}
              onChange={(event) => {
                setCryptoSymbol(
                  event.target
                    .value as CryptoSymbol,
                );
              }}
              style={{
                minHeight: 38,
                border:
                  "1px solid rgba(145,126,255,.35)",
                borderRadius: 9,
                color: "#e2e5f5",
                background: "#12182b",
                padding: "0 10px",
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              {SUPPORTED_CRYPTO_SYMBOLS.map(
                (symbol) => (
                  <option
                    key={symbol}
                    value={symbol}
                  >
                    {CRYPTO_SYMBOL_LABELS[symbol]}
                  </option>
                ),
              )}
            </select>
          ) : activeMarket === "forex" ? (
            <select
              aria-label="Select forex pair"
              value={forexPair}
              onChange={(event) => {
                setForexPair(
                  event.target
                    .value as ForexPair,
                );
              }}
              style={{
                minHeight: 38,
                border:
                  "1px solid rgba(145,126,255,.35)",
                borderRadius: 9,
                color: "#e2e5f5",
                background: "#12182b",
                padding: "0 10px",
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              {SUPPORTED_FOREX_PAIRS.map(
                (pair) => (
                  <option
                    key={pair}
                    value={pair}
                  >
                    {FOREX_PAIR_LABELS[pair]}
                  </option>
                ),
              )}
            </select>
          ) : (
            <button
              className="asset-add-button"
              type="button"
              aria-label="Add asset"
            >
              +
            </button>
          )}
        </div>

        <div className="asset-quick-actions">
          <button type="button" aria-label="Open market">
            <Icon name="arrow" size={16} />
          </button>

          <button type="button" aria-label="Favorite asset">
            <Icon name="star" size={16} />
          </button>

          <button type="button" aria-label="Share asset">
            <Icon name="share" size={16} />
          </button>

          <button
            className="trade-outline-button"
            type="button"
          >
            Trade
          </button>
        </div>

        <div className="asset-main-price">
          <strong>{market.rawPrice}</strong>
          <span>{market.currencySymbol}</span>
        </div>

        <div
            className="asset-sub-price"
            style={{
              fontSize: 15,
              lineHeight: 1.5,
            }}
          >
          <span className="asset-diamond">+</span>
          {market.secondaryValue}
          <span
              className="asset-change"
              style={{
                fontSize: 15,
                lineHeight: 1.5,
              }}
            >
            24H: {market.change}
          </span>
        </div>
        <div className="desktop-trade-actions">
          <button
            className="desktop-trade-button desktop-buy-action"
            type="button"
            onClick={() => void submitPaperTrade("BUY", activeMarket, market, 0.0001)}
          >
            <span>BUY LOW</span>
            <strong>{market.price}</strong>
            <small>Buy position</small>
          </button>

          <button
            className="desktop-trade-button desktop-sell-action"
            type="button"
            onClick={() => void submitPaperTrade("SELL", activeMarket, market, 0.0001)}
          >
            <span>SELL HIGH</span>
            <strong>{market.price}</strong>
            <small>Sell position</small>
          </button>
        </div>
      </article>

      <div className="desktop-stat-grid">
        <article className="desktop-stat-card">
          <div className="desktop-stat-icon pink">
            <Icon name="diamond" size={18} />
          </div>
          <div>
            <span style={{ fontSize: 15, lineHeight: 1.45, fontWeight: 400 }}>{market.liquidityLabel}</span>
            <strong>{market.liquidity}</strong>
          </div>
        </article>

        <article className="desktop-stat-card">
          <div className="desktop-stat-icon blue">
            <Icon name="chart" size={18} />
          </div>
          <div>
            <span style={{ fontSize: 15, lineHeight: 1.45, fontWeight: 400 }}>{market.volumeLabel}</span>
            <strong>{market.volume}</strong>
          </div>
        </article>

        <article className="desktop-stat-card">
          <div className="desktop-stat-icon violet">
            <Icon name="layers" size={18} />
          </div>
          <div>
            <span style={{ fontSize: 15, lineHeight: 1.45, fontWeight: 400 }}>{market.pooledPrimaryLabel}</span>
            <strong>{market.pooledPrimary}</strong>
          </div>
        </article>

        <article className="desktop-stat-card">
          <div className="desktop-stat-icon rose">
            <Icon name="flow" size={18} />
          </div>
          <div>
            <span style={{ fontSize: 15, lineHeight: 1.45, fontWeight: 400 }}>{market.pooledSecondaryLabel}</span>
            <strong>{market.pooledSecondary}</strong>
          </div>
        </article>
      </div>

      <article className="desktop-score-card">
        <div className="score-card-heading">
          <div>
            <span
                style={{
                  fontSize: 15,
                  lineHeight: 1.45,
                  fontWeight: 400,
                }}
              >
                AI MARKET SCORE
              </span>
            <strong>{market.score}</strong>
          </div>

          <div
            className="desktop-score-ring"
            style={{
              background:
                "conic-gradient(#ff718f 0 20%, #ffc26a 20% 37%, #8b5cff 37% 68%, #b7b1dc 68% 86%, rgba(255,255,255,.08) 86% 100%)",
            }}
          >
            <div />
          </div>
        </div>

        <div className="community-row">
          <span
              style={{
                fontSize: 15,
                lineHeight: 1.45,
                fontWeight: 400,
              }}
            >
              Community trust
            </span>
          <strong
              style={{
                fontSize: 15,
                lineHeight: 1.45,
                fontWeight: 500,
              }}
            >
              Trust {market.trust}
            </strong>
          <small
              style={{
                fontSize: 14,
                lineHeight: 1.45,
                fontWeight: 400,
              }}
            >
              {market.votes}
            </small>
        </div>

        <div className="community-progress">
          <span
            style={{
              width: market.trust,
            }}
          />
        </div>
      </article>
    </section>
  );
}

function DesktopMarketColumn({
  market,
  activeMarket,
  cryptoSymbol,
  forexPair,
}: {
  market: MarketData;
  activeMarket: MarketKey;
  cryptoSymbol: CryptoSymbol;
  forexPair: ForexPair;
}) {
  const [paperAccount, setPaperAccount] =
    useState<PaperAccountSnapshot | null>(
      null,
    );

  const [
    paperAccountError,
    setPaperAccountError,
  ] = useState("");

  useEffect(() => {
    let disposed = false;
    const controller =
      new AbortController();

    async function refreshPaperAccount() {
      try {
        const account =
          await fetchPaperAccount(
            controller.signal,
          );

        if (disposed) {
          return;
        }

        setPaperAccount(account);
        setPaperAccountError("");
      }
      catch (error) {
        if (
          disposed ||
          controller.signal.aborted
        ) {
          return;
        }

        setPaperAccountError(
          error instanceof Error
            ? error.message
            : "Account unavailable.",
        );
      }
    }

    const handleAccountUpdated = () => {
      void refreshPaperAccount();
    };

    void refreshPaperAccount();

    window.addEventListener(
      PAPER_ACCOUNT_UPDATED_EVENT,
      handleAccountUpdated,
    );

    const refreshTimer =
      window.setInterval(
        handleAccountUpdated,
        15000,
      );

    return () => {
      disposed = true;
      controller.abort();

      window.removeEventListener(
        PAPER_ACCOUNT_UPDATED_EVENT,
        handleAccountUpdated,
      );

      window.clearInterval(
        refreshTimer,
      );
    };
  }, []);

  const [
    desktopTradingMode,
    setDesktopTradingMode,
  ] = useState<"spot" | "futures">(
    "spot",
  );

  const paperTrades =
    paperAccount?.trades ?? [];

  const latestClosedTrade =
    paperTrades.find(
      (trade) => trade.side === "SELL",
    );

  const primaryOpenPosition =
    paperAccount?.positions[0];

  return (
    <section className="desktop-market-column">
      <article className="desktop-chart-card desktop-live-chart-card">
        <TradingViewChart
          market={activeMarket}
          cryptoSymbol={cryptoSymbol}
          forexPair={forexPair}
        />

        <FuturesPaperTerminal
          variant="desktop"
          activeMarket={activeMarket}
          cryptoSymbol={cryptoSymbol}
          forexPair={forexPair}
          displayPrice={market.price}
          onSpotSell={(quantity) => {
            submitPaperTrade(
              "SELL",
              activeMarket,
              market,
              quantity,
            );
          }}
          onSpotBuy={(
            quantity,
            stopLoss,
            takeProfit,
          ) => {
            submitPaperTrade(
              "BUY",
              activeMarket,
              market,
              quantity,
              stopLoss,
              takeProfit,
            );
          }}
          onModeChange={(
            nextMode,
          ) => {
            setDesktopTradingMode(
              nextMode,
            );
          }}
        />
      </article>

      {desktopTradingMode === "spot" ? (
        <article className="trade-history-card">
          <div className="trade-history-heading">
            <div>
              <span>EXECUTION FEED</span>
              <h2>Trade History</h2>
            </div>
  
  
            <div className="trade-history-actions">
              <strong>SIMULATED</strong>
  
              <span>
                {paperAccount
                  ? [
                      `Cash ${formatPaperUsd(
                        paperAccount.cashBalance,
                      )}`,
                      `Equity ${formatPaperUsd(
                        paperAccount.totalEquity,
                      )}`,
                      `Realized ${formatPaperUsd(
                        paperAccount.realizedPnl,
                      )}`,
                      `Unrealized ${formatPaperUsd(
                        paperAccount.unrealizedPnl,
                      )}`,
                      `Open ${paperAccount.positions.length}`,
                      `Trades ${paperTrades.length}`,
                    ].join(" | ")
                  : paperAccountError ||
                    "Loading account..."}
              </span>
            </div>
          </div>
  
  
          <div className="paper-trading-status-grid">
            <div className="paper-trading-status-card">
              <span>OPEN POSITION</span>
  
              <strong>
                {primaryOpenPosition
                  ? primaryOpenPosition.symbol
                  : "NO OPEN POSITION"}
              </strong>
  
              <small>
                {primaryOpenPosition
                  ? [
                      `Entry ${formatPaperUsd(
                        primaryOpenPosition.averageEntryPrice,
                        8,
                      )}`,
                      `Current ${formatPaperUsd(
                        primaryOpenPosition.lastPrice,
                        8,
                      )}`,
                    ].join(" | ")
                  : "BUY to open a position"}
              </small>
  
              <b
                className={`paper-status-value ${
                  primaryOpenPosition
                    ? getPaperPnlClass(
                        primaryOpenPosition.unrealizedPnl,
                      )
                    : "neutral"
                }`}
              >
                {primaryOpenPosition
                  ? formatSignedPaperUsd(
                      primaryOpenPosition.unrealizedPnl,
                      8,
                    )
                  : "--"}
              </b>
            </div>
  
            <div className="paper-trading-status-card">
              <span>LATEST CLOSED RESULT</span>
  
              <strong>
                {latestClosedTrade
                  ? getPaperTradeOutcome(
                      latestClosedTrade,
                    )
                  : "NO CLOSED TRADE"}
              </strong>
  
              <small>
                {latestClosedTrade
                  ? `${latestClosedTrade.symbol} | SELL`
                  : "SELL closes a position"}
              </small>
  
              <b
                className={`paper-status-value ${
                  latestClosedTrade
                    ? getPaperPnlClass(
                        latestClosedTrade.realizedPnl,
                      )
                    : "neutral"
                }`}
              >
                {latestClosedTrade
                  ? formatSignedPaperUsd(
                      latestClosedTrade.realizedPnl,
                      8,
                    )
                  : "--"}
              </b>
            </div>
  
            <div className="paper-trading-status-card">
              <span>TOTAL PNL</span>
  
              <strong>
                {paperAccount
                  ? formatSignedPaperUsd(
                      paperAccount.realizedPnl,
                      8,
                    )
                  : "--"}
              </strong>
  
              <small>
                Realized after completed SELL orders
              </small>
  
              <b
                className={`paper-status-value ${
                  paperAccount
                    ? getPaperPnlClass(
                        paperAccount.unrealizedPnl,
                      )
                    : "neutral"
                }`}
              >
                Open{" "}
                {paperAccount
                  ? formatSignedPaperUsd(
                      paperAccount.unrealizedPnl,
                      8,
                    )
                  : "--"}
              </b>
            </div>
          </div>
          <div className="trade-table-header">
          <span>Time</span>
            <span>Price</span>
            <span>Quantity</span>
            <span>Total</span>
            <span>Fee</span>
            <span>Order ID</span>
            <span />
          </div>
  
  
          <div className="trade-table-body">
            {paperTrades.length > 0 ? (
              paperTrades.slice(0, 10).map((trade) => (
                <div
                  className="trade-table-row"
                  key={trade.id}
                >
                  <span>
                    {formatPaperExecutionTime(
                      trade.executedAt,
                    )}
                  </span>
  
                  <strong>
                    {formatPaperUsd(
                      trade.price,
                      8,
                    )}
  
                    <i
                      className={
                        trade.side === "BUY"
                          ? "trade-up"
                          : "trade-down"
                      }
                    >
                      {trade.side}
                    </i>
                  </strong>
  
                  <span className="trade-quantity">
                    QTY{" "}
                    {formatPaperQuantity(
                      trade.quantity,
                    )}
                  </span>
  
                  <span>
                    {formatPaperUsd(
                      trade.notional,
                      8,
                    )}
                  </span>
  
                  <span>
                    {formatPaperUsd(
                      trade.fee,
                      8,
                    )}
                  </span>
  
                  <span
                    className="wallet-cell"
                    title={trade.orderId}
                  >
                    {shortenPaperOrderId(
                      trade.orderId,
                    )}
  
                    <Icon
                      name="copy"
                      size={13}
                    />
                  </span>
  
                  <button
                    type="button"
                    aria-label={`${trade.side} ${trade.symbol} trade`}
                    title={`Realized PnL: ${formatPaperUsd(
                      trade.realizedPnl,
                      8,
                    )}`}
                  >
                    <Icon
                      name="more"
                      size={17}
                    />
                  </button>
                </div>
              ))
            ) : (
              <div className="trade-table-row">
                <span>--:--:--</span>
  
                <strong>
                  No trades
                  <i className="trade-up">
                    NONE
                  </i>
                </strong>
  
                <span className="trade-quantity">
                  Click BUY to start
                </span>
  
                <span>$0.00</span>
                <span>$0.00</span>
  
                <span className="wallet-cell">
                  N/A
                </span>
  
                <button
                  type="button"
                  aria-label="No trades yet"
                  disabled
                >
                  <Icon
                    name="more"
                    size={17}
                  />
                </button>
              </div>
            )}
          </div>
  
  
          <button
            className="history-more-button"
            type="button"
            onClick={() => {
              window.dispatchEvent(
                new Event(
                  PAPER_ACCOUNT_UPDATED_EVENT,
                ),
              );
            }}
          >
            Refresh account
          </button>
        </article>
      ) : null}
    </section>
  );
}

/* ZAINEX_MOBILE_CONTROLS_COMPLETE_MENU_V1 */
/* ZAINEX_DASHBOARD_COMMAND_CENTER_V1 */

function MobileDashboard({
  market,
  activeMarket,
  setActiveMarket,
  cryptoSymbol,
  setCryptoSymbol,
  forexPair,
  setForexPair,
}: {
  market: MarketData;
  activeMarket: MarketKey;
  setActiveMarket: (market: MarketKey) => void;
  cryptoSymbol: CryptoSymbol;
  setCryptoSymbol: (symbol: CryptoSymbol) => void;
  forexPair: ForexPair;
  setForexPair: (pair: ForexPair) => void;
}) {
  const router = useRouter();


  const [
    mobileMenuOpen,
    setMobileMenuOpen,
  ] = useState(false);

  const [
    mobileSigningOut,
    setMobileSigningOut,
  ] = useState(false);

  const mobileMenuItems: Array<{
    label: string;
    description: string;
    icon: IconName;
    href: string;
  }> = [
    {
      label: "Dashboard",
      description: "Capital, market, risk, and intelligence",
      icon: "home",
      href: "/dashboard",
    },
    {
      label: "Markets",
      description: "Trading terminal and live market",
      icon: "chart",
      href: "/market",
    },
    {
      label: "AI strategies",
      description: "Strategy activation and records",
      icon: "rocket",
      href: "/ai-strategies",
    },
    {
      label: "Wallet & credits",
      description: "Wallet balance and AI credits",
      icon: "wallet",
      href: "/wallet",
    },
    {
      label: "Workflow",
      description: "AI automation builder",
      icon: "flow",
      href: "/workflow",
    },
    {
      label: "Billing",
      description: "Plans and subscription settings",
      icon: "billing",
      href: "/billing",
    },
    {
      label: "Rewards",
      description: "Three-level referral network",
      icon: "diamond",
      href: "/rewards",
    },
    {
      label: "Profile settings",
      description: "Identity and account details",
      icon: "search",
      href: "/profile#account",
    },
    {
      label: "Account & security",
      description: "Google sign-in and session",
      icon: "star",
      href: "/profile#security",
    },
    {
      label: "Appearance",
      description: "Theme and interface settings",
      icon: "diamond",
      href: "/profile#appearance",
    },
  ];

  useBodyScrollLock(
    mobileMenuOpen,
  );

  useEffect(() => {
    if (!mobileMenuOpen) {
      return;
    }

    const handleEscape = (
      event: KeyboardEvent,
    ) => {
      if (event.key === "Escape") {
        setMobileMenuOpen(false);
      }
    };

    window.addEventListener(
      "keydown",
      handleEscape,
    );

    return () => {
      window.removeEventListener(
        "keydown",
        handleEscape,
      );
    };
  }, [mobileMenuOpen]);

  const navigateMobile = (
    href: string,
  ) => {
    setMobileMenuOpen(false);
    router.push(href);
  };

  const mobileStats = [
    {
      label: "Momentum",
      value: "82%",
      fill: 82,
      color: "#b45bff",
    },
    {
      label: "Volume",
      value: market.volume,
      fill: 70,
      color: "#6476ff",
    },
    {
      label: "AI Signal",
      value: "BUY",
      fill: 91,
      color: "#25d5ff",
    },
    {
      label: "Risk",
      value: "LOW",
      fill: 42,
      color: "#e64cff",
    },
  ];

  return (
    <section className="mobile-shell">
      <header className="mobile-header">
        <div className="mobile-profile">
          <SharedProfileMenu size={45} />

          <div>
            <span>My profile</span>
            <strong>ZAINEX Trader</strong>
          </div>
        </div>

        <div className="mobile-balance">
          <span>Portfolio balance</span>
          <strong>$12,120.84</strong>
        </div>
      </header>

      <div className="mobile-brand-row">
        <div className="mobile-wordmark zainex-wordmark market-wordmark"><span className="zainex-wordmark-silver">Z</span><span className="zainex-wordmark-ai">AI</span><span className="zainex-wordmark-silver">NEX</span></div>

        <div className="mobile-live">
          <i />
          LIVE
        </div>
      </div>

      <MarketSwitcher
        activeMarket={activeMarket}
        setActiveMarket={setActiveMarket}
      />

      <article className="mobile-chart-card mobile-real-chart-card">
        <div className="mobile-chart-heading">
          <div>
            <span>{market.network}</span>
            {activeMarket === "crypto" ? (
              <select
                aria-label="Select crypto pair"
                value={cryptoSymbol}
                onChange={(event) => {
                  setCryptoSymbol(
                    event.target.value as CryptoSymbol,
                  );
                }}
                style={{
                  minHeight: 34,
                  border: "1px solid rgba(145,126,255,.35)",
                  borderRadius: 8,
                  color: "#e2e5f5",
                  background: "#12182b",
                  padding: "0 8px",
                  fontSize: 14,
                  fontWeight: 600,
                }}
              >
                {SUPPORTED_CRYPTO_SYMBOLS.map((symbol) => (
                  <option key={symbol} value={symbol}>
                    {CRYPTO_SYMBOL_LABELS[symbol]}
                  </option>
                ))}
              </select>
            ) : activeMarket === "forex" ? (
              <select
                aria-label="Select forex pair"
                value={forexPair}
                onChange={(event) => {
                  setForexPair(
                    event.target.value as ForexPair,
                  );
                }}
                style={{
                  minHeight: 34,
                  border: "1px solid rgba(145,126,255,.35)",
                  borderRadius: 8,
                  color: "#e2e5f5",
                  background: "#12182b",
                  padding: "0 8px",
                  fontSize: 14,
                  fontWeight: 600,
                }}
              >
                {SUPPORTED_FOREX_PAIRS.map((pair) => (
                  <option key={pair} value={pair}>
                    {FOREX_PAIR_LABELS[pair]}
                  </option>
                ))}
              </select>
            ) : (
              <strong>{market.symbol}</strong>
            )}
          </div>

          <div>
            <strong>{market.price}</strong>
            <span>{market.change}</span>
          </div>
        </div>

        <div className="mobile-chart-area mobile-live-chart-area">
          <TradingViewChart
            market={activeMarket}
            cryptoSymbol={cryptoSymbol}
            forexPair={forexPair}
            compact
          />
        </div>
      </article>

      <FuturesPaperTerminal
        variant="mobile"
        activeMarket={activeMarket}
        cryptoSymbol={cryptoSymbol}
        forexPair={forexPair}
        displayPrice={market.price}
        onSpotSell={(quantity) => {
          submitPaperTrade(
            "SELL",
            activeMarket,
            market,
            quantity,
          );
        }}
        onSpotBuy={(
          quantity,
          stopLoss,
          takeProfit,
        ) => {
          submitPaperTrade(
            "BUY",
            activeMarket,
            market,
            quantity,
            stopLoss,
            takeProfit,
          );
        }}
      />

      <section className="mobile-statistics">
        {mobileStats.map((stat) => (
          <article key={stat.label}>
            <div
              className="mobile-stat-ring"
              style={{
                background: `conic-gradient(
                  ${stat.color} ${stat.fill}%,
                  rgba(255,255,255,.09) 0
                )`,
              }}
            >
              <div>
                <strong>{stat.value}</strong>
              </div>
            </div>

            <span>{stat.label}</span>
          </article>
        ))}
      </section>


      <nav
        className="mobile-bottom-navigation"
        aria-label="Mobile navigation"
      >
        <button
          type="button"
          onClick={() => {
            router.push("/dashboard");
          }}
        >
          <Icon name="home" size={17} />
          <span>Home</span>
        </button>

        <button
          className="active"
          type="button"
          onClick={() => {
            document
              .querySelector<HTMLElement>(
                ".mobile-chart-card",
              )
              ?.scrollIntoView({
                behavior: "smooth",
                block: "start",
              });
          }}
        >
          <Icon name="chart" size={17} />
          <span>Markets</span>
        </button>

        <button
          type="button"
          onClick={() => {
            router.push("/wallet");
          }}
        >
          <Icon name="wallet" size={17} />
          <span>Wallet</span>
        </button>

        <button
          className={
            mobileMenuOpen
              ? "active"
              : undefined
          }
          type="button"
          aria-label="Open complete menu"
          aria-haspopup="dialog"
          aria-expanded={mobileMenuOpen}
          onClick={() => {
            setMobileMenuOpen(
              (current) => !current,
            );
          }}
        >
          <Icon name="more" size={18} />
          <span>Menu</span>
        </button>
      </nav>

      {mobileMenuOpen &&
      typeof document !== "undefined"
        ? createPortal(
            <div
              className="mobile-app-menu-backdrop"
              role="presentation"
              onClick={() => {
                setMobileMenuOpen(false);
              }}
            >
              <style>{`
                /* ZAINEX_MOBILE_MENU_RUNTIME_STYLE_SPOT_CLEANUP_V1 */

                .mobile-app-menu-backdrop {
                  position: fixed !important;
                  z-index: 2147483000 !important;
                  inset: 0 !important;
                  display: flex !important;
                  align-items: flex-end !important;
                  justify-content: center !important;
                  box-sizing: border-box !important;
                  padding:
                    14px 12px
                    calc(
                      14px +
                      env(safe-area-inset-bottom)
                    ) !important;
                  overflow: hidden !important;
                  background:
                    rgba(2, 3, 13, 0.78) !important;
                  backdrop-filter:
                    blur(13px)
                    saturate(125%) !important;
                  -webkit-backdrop-filter:
                    blur(13px)
                    saturate(125%) !important;
                }

                .mobile-app-menu-backdrop,
                .mobile-app-menu-backdrop * {
                  box-sizing: border-box !important;
                }

                .mobile-app-menu {
                  display: block !important;
                  width: min(100%, 520px) !important;
                  max-width: 520px !important;
                  max-height: min(82dvh, 720px) !important;
                  margin: 0 !important;
                  padding: 14px !important;
                  overflow-x: hidden !important;
                  overflow-y: auto !important;
                  overscroll-behavior: contain !important;
                  border: 1px solid
                    rgba(166, 105, 255, 0.28) !important;
                  border-radius: 24px !important;
                  color: #dce5f8 !important;
                  background:
                    radial-gradient(
                      circle at 92% 0,
                      rgba(194, 65, 255, 0.22),
                      transparent 34%
                    ),
                    radial-gradient(
                      circle at 3% 100%,
                      rgba(34, 188, 255, 0.12),
                      transparent 38%
                    ),
                    linear-gradient(
                      155deg,
                      rgba(18, 15, 50, 0.995),
                      rgba(6, 8, 24, 0.998)
                    ) !important;
                  box-shadow:
                    0 35px 90px rgba(0, 0, 0, 0.62),
                    0 0 55px rgba(139, 70, 255, 0.16),
                    inset 0 1px rgba(255, 255, 255, 0.05) !important;
                  font-family: inherit !important;
                  animation:
                    zainexRuntimeMenuEnter
                    220ms
                    cubic-bezier(0.16, 1, 0.3, 1) !important;
                }

                .mobile-app-menu-header {
                  display: flex !important;
                  align-items: center !important;
                  justify-content: space-between !important;
                  gap: 14px !important;
                  padding: 4px 3px 14px !important;
                  border-bottom: 1px solid
                    rgba(132, 144, 207, 0.14) !important;
                }

                .mobile-app-menu-header > div {
                  display: block !important;
                  min-width: 0 !important;
                }

                .mobile-app-menu-header span,
                .mobile-app-menu-header strong {
                  display: block !important;
                }

                .mobile-app-menu-header span {
                  color: #53ddff !important;
                  font-size: 9px !important;
                  font-weight: 650 !important;
                  line-height: 1.2 !important;
                  letter-spacing: 0.14em !important;
                }

                .mobile-app-menu-header strong {
                  margin-top: 5px !important;
                  color: #faf8ff !important;
                  font-size: 18px !important;
                  font-weight: 560 !important;
                  line-height: 1.25 !important;
                }

                .mobile-app-menu-header button {
                  display: grid !important;
                  width: 40px !important;
                  height: 40px !important;
                  min-width: 40px !important;
                  min-height: 40px !important;
                  place-items: center !important;
                  margin: 0 !important;
                  padding: 0 !important;
                  border: 1px solid
                    rgba(161, 113, 255, 0.22) !important;
                  border-radius: 13px !important;
                  color: #e4ddf7 !important;
                  background:
                    rgba(255, 255, 255, 0.035) !important;
                  font-family: inherit !important;
                  font-size: 12px !important;
                  cursor: pointer !important;
                }

                .mobile-app-menu-grid {
                  display: grid !important;
                  grid-template-columns: 1fr !important;
                  gap: 6px !important;
                  width: 100% !important;
                  margin: 0 !important;
                  padding: 11px 0 !important;
                }

                .mobile-app-menu-grid > button {
                  display: grid !important;
                  width: 100% !important;
                  min-height: 62px !important;
                  grid-template-columns:
                    42px minmax(0, 1fr) auto !important;
                  align-items: center !important;
                  gap: 11px !important;
                  margin: 0 !important;
                  padding: 9px 11px !important;
                  border: 1px solid
                    rgba(130, 143, 211, 0.08) !important;
                  border-radius: 15px !important;
                  color: #c6cfe4 !important;
                  background:
                    rgba(255, 255, 255, 0.018) !important;
                  font-family: inherit !important;
                  text-align: left !important;
                  cursor: pointer !important;
                }

                .mobile-app-menu-grid > button:active {
                  border-color:
                    rgba(164, 101, 255, 0.3) !important;
                  color: #ffffff !important;
                  background:
                    linear-gradient(
                      105deg,
                      rgba(39, 157, 245, 0.13),
                      rgba(184, 65, 246, 0.15)
                    ) !important;
                  transform: scale(0.985) !important;
                }

                .mobile-app-menu-icon {
                  display: grid !important;
                  width: 40px !important;
                  height: 40px !important;
                  place-items: center !important;
                  border: 1px solid
                    rgba(94, 188, 255, 0.18) !important;
                  border-radius: 13px !important;
                  color: #59ddff !important;
                  background:
                    linear-gradient(
                      145deg,
                      rgba(41, 158, 244, 0.14),
                      rgba(181, 66, 245, 0.14)
                    ) !important;
                }

                .mobile-app-menu-grid
                > button
                > span:nth-child(2) {
                  display: block !important;
                  min-width: 0 !important;
                }

                .mobile-app-menu-grid strong,
                .mobile-app-menu-grid small {
                  display: block !important;
                }

                .mobile-app-menu-grid strong {
                  color: inherit !important;
                  font-size: 12px !important;
                  font-weight: 560 !important;
                  line-height: 1.25 !important;
                }

                .mobile-app-menu-grid small {
                  margin-top: 4px !important;
                  overflow: hidden !important;
                  color: #747f9f !important;
                  font-size: 9px !important;
                  line-height: 1.35 !important;
                  text-overflow: ellipsis !important;
                  white-space: nowrap !important;
                }

                .mobile-app-menu-grid b {
                  color: #727e9d !important;
                  font-size: 16px !important;
                  font-weight: 400 !important;
                }

                .mobile-app-menu-signout {
                  display: flex !important;
                  width: 100% !important;
                  min-height: 52px !important;
                  align-items: center !important;
                  justify-content: center !important;
                  gap: 9px !important;
                  margin: 0 !important;
                  padding: 0 14px !important;
                  border: 1px solid
                    rgba(255, 104, 142, 0.17) !important;
                  border-radius: 14px !important;
                  color: #f39ab0 !important;
                  background:
                    rgba(255, 83, 129, 0.055) !important;
                  font-family: inherit !important;
                  font-size: 11px !important;
                  font-weight: 560 !important;
                  cursor: pointer !important;
                }

                .mobile-app-menu-signout:disabled {
                  opacity: 0.55 !important;
                  cursor: wait !important;
                }

                @keyframes zainexRuntimeMenuEnter {
                  from {
                    opacity: 0;
                    transform:
                      translate3d(0, 30px, 0)
                      scale(0.96);
                  }

                  to {
                    opacity: 1;
                    transform:
                      translate3d(0, 0, 0)
                      scale(1);
                  }
                }

                @media (max-height: 620px) {
                  .mobile-app-menu {
                    max-height: 92dvh !important;
                    border-radius: 19px !important;
                  }

                  .mobile-app-menu-grid > button {
                    min-height: 55px !important;
                  }
                }
              `}</style>

              <section
                className="mobile-app-menu"
                role="dialog"
                aria-modal="true"
                aria-label="Complete ZAINEX menu"
                onClick={(event) => {
                  event.stopPropagation();
                }}
              >
                <header className="mobile-app-menu-header">
                  <div>
                    <span>ZAINEX NAVIGATION</span>
                    <strong>Complete menu</strong>
                  </div>

                  <button
                    type="button"
                    aria-label="Close menu"
                    onClick={() => {
                      setMobileMenuOpen(false);
                    }}
                  >
                    X
                  </button>
                </header>

                <nav
                  className="mobile-app-menu-grid"
                  aria-label="Application menu"
                >
                  {mobileMenuItems.map(
                    (item) => (
                      <button
                        key={item.href}
                        type="button"
                        onClick={() => {
                          navigateMobile(
                            item.href,
                          );
                        }}
                      >
                        <span className="mobile-app-menu-icon">
                          <Icon
                            name={item.icon}
                            size={18}
                          />
                        </span>

                        <span>
                          <strong>
                            {item.label}
                          </strong>

                          <small>
                            {item.description}
                          </small>
                        </span>

                        <b>{">"}</b>
                      </button>
                    ),
                  )}
                </nav>

                <button
                  type="button"
                  className="mobile-app-menu-signout"
                  disabled={mobileSigningOut}
                  onClick={async () => {
                    if (mobileSigningOut) {
                      return;
                    }

                    setMobileSigningOut(true);

                    await signOut({
                      redirectTo: "/auth",
                    });
                  }}
                >
                  <Icon
                    name="arrow"
                    size={17}
                  />

                  {mobileSigningOut
                    ? "Signing out..."
                    : "Sign out"}
                </button>
              </section>
            </div>,
            document.body,
          )
        : null}
    </section>
  );
}

export function MarketDashboard() {
  const [activeMarket, setActiveMarket] =
    useState<MarketKey>("crypto");

  const [
    cryptoSymbol,
    setCryptoSymbol,
  ] = useState<CryptoSymbol>("BTCUSDT");

  const [
    forexPair,
    setForexPair,
  ] = useState<ForexPair>("EURUSD");

  const [
    marketSnapshots,
    setMarketSnapshots,
  ] = useState<
    Record<MarketKey, MarketData>
  >(markets);

  const market =
    marketSnapshots[activeMarket];

  const handleCryptoSymbolChange = (
    symbol: CryptoSymbol,
  ) => {
    setCryptoSymbol(symbol);

    setMarketSnapshots((current) => ({
      ...current,
      crypto: {
        ...current.crypto,
        symbol:
          CRYPTO_SYMBOL_LABELS[symbol],
        assetName:
          CRYPTO_ASSET_NAMES[symbol],
        secondaryValue:
          CRYPTO_SYMBOL_LABELS[symbol],
        price: "--",
        rawPrice: "--",
        change: "--",
      },
    }));
  };

  const handleForexPairChange = (
    pair: ForexPair,
  ) => {
    setForexPair(pair);

    setMarketSnapshots((current) => ({
      ...current,
      forex: {
        ...current.forex,
        symbol:
          FOREX_PAIR_LABELS[pair],
        assetName:
          FOREX_PAIR_NAMES[pair],
        secondaryValue:
          FOREX_PAIR_LABELS[pair],
        price: "--",
        rawPrice: "--",
        change: "--",
      },
    }));
  };

  useEffect(() => {
    let disposed = false;

    const controller =
      new AbortController();

    async function refreshSummary() {
      try {
        const endpoint = new URL(
          "/api/market/candles",
          window.location.origin,
        );

        endpoint.searchParams.set(
          "market",
          activeMarket,
        );

        if (activeMarket === "crypto") {
          endpoint.searchParams.set(
            "symbol",
            cryptoSymbol,
          );
        }

        if (activeMarket === "forex") {
          endpoint.searchParams.set(
            "symbol",
            forexPair,
          );
        }

        endpoint.searchParams.set(
          "interval",
          "1h",
        );

        endpoint.searchParams.set(
          "limit",
          "120",
        );

        const response = await fetch(
          endpoint,
          {
            cache: "no-store",
            signal: controller.signal,
          },
        );

        const payload =
          (await response.json()) as
            LiveMarketResponse;

        if (
          !response.ok ||
          !payload.ok ||
          !payload.summary
        ) {
          throw new Error(
            payload.error ??
              "Market summary unavailable.",
          );
        }

        if (disposed) {
          return;
        }

        setMarketSnapshots(
          (current) => ({
            ...current,

            [activeMarket]: {
              ...current[activeMarket],
              ...payload.summary,
            },
          }),
        );
      }
      catch (error) {
        if (
          disposed ||
          controller.signal.aborted
        ) {
          return;
        }

        console.error(
          "ZAINEX market summary failed:",
          error,
        );
      }
    }

    void refreshSummary();

    const refreshTimer =
      window.setInterval(
        () => {
          void refreshSummary();
        },
        activeMarket === "crypto"
          ? 15000
          : 60000,
      );

    return () => {
      disposed = true;

      controller.abort();

      window.clearInterval(
        refreshTimer,
      );
    };
  }, [activeMarket, cryptoSymbol, forexPair]);

  return (
    <main className="zainex-app">
      <AmbientBackground />

      <div className="desktop-app-frame">
        <DesktopSidebar />

        <section className="desktop-shell">
          <DesktopHeader />

          <div className="desktop-body">
            <DesktopAssetColumn
              market={market}
              activeMarket={activeMarket}
              setActiveMarket={setActiveMarket}
              cryptoSymbol={cryptoSymbol}
              setCryptoSymbol={handleCryptoSymbolChange}
              forexPair={forexPair}
              setForexPair={handleForexPairChange}
            />

            <DesktopMarketColumn
              market={market}
              activeMarket={activeMarket}
              cryptoSymbol={cryptoSymbol}
              forexPair={forexPair}
            />
          </div>
        </section>
      </div>

      <MobileDashboard
        market={market}
        activeMarket={activeMarket}
        setActiveMarket={setActiveMarket}
        cryptoSymbol={cryptoSymbol}
        setCryptoSymbol={handleCryptoSymbolChange}
        forexPair={forexPair}
        setForexPair={handleForexPairChange}
      />
      <PaperTradeModalHost />

    </main>
  );
}

/* ZAINEX_MARKET_STATS_SMALL_TEXT_SIZE_V1_1 */
