"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  createPortal,
} from "react-dom";

import styles from "./futures-paper-terminal.module.css";

import { FuturesAiSignalPanel } from "./futures-ai-signal-panel";
import { SpotAiSignalPanel } from "./spot-ai-signal-panel";

import {
  CRYPTO_SYMBOL_LABELS,
  type CryptoSymbol,
} from "@/lib/crypto-symbols";

import {
  FOREX_PAIR_LABELS,
  type ForexPair,
} from "@/lib/forex-symbols";

type MarketKey =
  | "crypto"
  | "forex"
  | "stocks";

type TradingMode =
  | "spot"
  | "futures";

type FuturesDirection =
  | "LONG"
  | "SHORT";

const LEVERAGES =
  [1, 2, 5, 10, 20] as const;

type FuturesLeverage =
  (typeof LEVERAGES)[number];

type FuturesPosition = {
  id: string;
  symbol: string;
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
  stopLoss?: number;
  takeProfit?: number;
  unrealizedPnl: number;
  roePercent: number;
  markProvider: string;
};

type FuturesTrade = {
  id: string;
  action:
    | "OPEN"
    | "CLOSE"
    | "LIQUIDATE";
  direction: FuturesDirection;
  symbol: string;
  leverage: FuturesLeverage;
  quantity: number;
  price: number;
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
};

type FuturesAccount = {
  mode: "paper-futures";
  currency: "USDT";
  availableBalance: number;
  usedMargin: number;
  totalEquity: number;
  realizedPnl: number;
  unrealizedPnl: number;
  positions: FuturesPosition[];
  trades: FuturesTrade[];
  supportedLeverage:
    readonly FuturesLeverage[];
  feeRate: number;
  maintenanceMarginRate: number;
};

type FuturesExecutionResult = {
  order: {
    id: string;
    action:
      | "OPEN"
      | "CLOSE"
      | "LIQUIDATE";
    direction: FuturesDirection;
    symbol: string;
    leverage: FuturesLeverage;
    margin: number;
    quantity: number;
    executedPrice: number;
    notional: number;
    fee: number;
    quoteProvider: string;
  };
  trade: FuturesTrade & {
    price: number;
    fee: number;
  };
  account: FuturesAccount;
  quoteProvider: string;
};

type AccountApiResponse = {
  ok: boolean;
  account?: FuturesAccount;
  error?: {
    message?: string;
  };
};

type ExecutionApiResponse = {
  ok: boolean;
  result?: FuturesExecutionResult;
  error?: {
    message?: string;
  };
};

type FuturesAction =
  | {
      kind: "OPEN";
      direction: FuturesDirection;
    }
  | {
      kind: "CLOSE";
      position: FuturesPosition;
    };

type ModalState =
  | {
      phase: "confirm";
      action: FuturesAction;
    }
  | {
      phase: "pending";
      action: FuturesAction;
    }
  | {
      phase: "success";
      action: FuturesAction;
      result: FuturesExecutionResult;
    }
  | {
      phase: "error";
      action: FuturesAction;
      message: string;
    };

type Props = {
  variant:
    | "desktop"
    | "mobile";
  activeMarket: MarketKey;
  cryptoSymbol: CryptoSymbol;
  forexPair: ForexPair;
  displayPrice: string;
  onSpotSell: (
    quantity: number,
  ) => void;
  onSpotBuy: (
    quantity: number,
    stopLoss?: number,
    takeProfit?: number,
  ) => void;
  onModeChange?: (
    mode: TradingMode,
  ) => void;
};

function formatUsdt(
  value: number,
  maximumFractionDigits = 8,
): string {
  return (
    value.toLocaleString(
      undefined,
      {
        minimumFractionDigits: 2,
        maximumFractionDigits,
      },
    ) + " USDT"
  );
}

function formatSignedUsdt(
  value: number,
): string {
  if (value > 0) {
    return `+${formatUsdt(value)}`;
  }

  if (value < 0) {
    return `-${formatUsdt(
      Math.abs(value),
    )}`;
  }

  return formatUsdt(0);
}

function formatNumber(
  value: number,
  maximumFractionDigits = 8,
): string {
  return value.toLocaleString(
    undefined,
    {
      maximumFractionDigits,
    },
  );
}

function parseDisplayedPrice(
  value: string,
): number {
  const parsed = Number(
    value.replace(
      /[^0-9.-]/g,
      "",
    ),
  );

  return Number.isFinite(parsed)
    ? parsed
    : 0;
}

function pnlClass(
  value: number,
): string {
  if (value > 0.00000001) {
    return styles.positive;
  }

  if (value < -0.00000001) {
    return styles.negative;
  }

  return styles.neutral;
}

function estimateLiquidation(
  direction: FuturesDirection,
  entryPrice: number,
  leverage: number,
  maintenanceMarginRate: number,
): number {
  if (
    entryPrice <= 0 ||
    leverage <= 0
  ) {
    return 0;
  }

  if (direction === "LONG") {
    return Math.max(
      0,
      entryPrice *
        (
          1 -
          1 / leverage +
          maintenanceMarginRate
        ),
    );
  }

  return (
    entryPrice *
    (
      1 +
      1 / leverage -
      maintenanceMarginRate
    )
  );
}

function formatFuturesExecutionTime(
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

function getFuturesTradeResult(
  trade: FuturesTrade,
): "OPEN" | "WIN" | "LOSS" | "EVEN" {
  if (trade.action === "OPEN") {
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
async function getAccount(): Promise<FuturesAccount> {
  const response = await fetch(
    "/api/trading/futures/account",
    {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
      },
    },
  );

  const payload =
    (await response.json()) as
      AccountApiResponse;

  if (
    !response.ok ||
    !payload.ok ||
    !payload.account
  ) {
    throw new Error(
      payload.error?.message ??
        "Futures account is unavailable.",
    );
  }

  return payload.account;
}

async function postOrder(
  url: string,
  body: Record<string, unknown>,
): Promise<FuturesExecutionResult> {
  const response = await fetch(
    url,
    {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "Content-Type":
          "application/json",
      },
      body: JSON.stringify(body),
    },
  );

  const payload =
    (await response.json()) as
      ExecutionApiResponse;

  if (
    !response.ok ||
    !payload.ok ||
    !payload.result
  ) {
    throw new Error(
      payload.error?.message ??
        "The futures order failed.",
    );
  }

  return payload.result;
}

export function FuturesPaperTerminal({
  variant,
  activeMarket,
  cryptoSymbol,
  forexPair,
  displayPrice,
  onSpotSell,
  onSpotBuy,
  onModeChange,
}: Props) {
  const [
    mode,
    setMode,
  ] = useState<TradingMode>(
    "spot",
  );

  const [
    account,
    setAccount,
  ] = useState<FuturesAccount | null>(
    null,
  );

  const [
    accountError,
    setAccountError,
  ] = useState("");

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    marginInput,
    setMarginInput,
  ] = useState("100");

  const [
    stopLossInput,
    setStopLossInput,
  ] = useState("");

  const [
    takeProfitInput,
    setTakeProfitInput,
  ] = useState("");

  const [
    leverage,
    setLeverage,
  ] = useState<FuturesLeverage>(
    5,
  );

  const [
    spotQuantityInput,
    setSpotQuantityInput,
  ] = useState("0.0001");

  const [
    spotStopLossInput,
    setSpotStopLossInput,
  ] = useState("");

  const [
    spotTakeProfitInput,
    setSpotTakeProfitInput,
  ] = useState("");

  const [
    modal,
    setModal,
  ] = useState<ModalState | null>(
    null,
  );

  const [
    mounted,
    setMounted,
  ] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const refreshAccount =
    useCallback(
      async () => {
        setLoading(true);

        try {
          const nextAccount =
            await getAccount();

          setAccount(nextAccount);
          setAccountError("");
        }
        catch (error) {
          setAccountError(
            error instanceof Error
              ? error.message
              : "Futures account refresh failed.",
          );
        }
        finally {
          setLoading(false);
        }
      },
      [],
    );

  useEffect(() => {
    if (
      mode !== "futures" ||
      activeMarket !== "crypto"
    ) {
      return;
    }

    void refreshAccount();

    const timer =
      window.setInterval(
        () => {
          void refreshAccount();
        },
        5000,
      );

    return () => {
      window.clearInterval(
        timer,
      );
    };
  }, [
    mode,
    activeMarket,
    refreshAccount,
  ]);

  useEffect(() => {
    if (!modal) {
      return;
    }

    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow =
      "hidden";

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
      document.body.style.overflow =
        previousOverflow;

      window.removeEventListener(
        "keydown",
        handleEscape,
      );
    };
  }, [modal]);

  const displayedPrice =
    useMemo(
      () =>
        parseDisplayedPrice(
          displayPrice,
        ),
      [displayPrice],
    );

  const margin =
    Number(marginInput);

  const validMargin =
    Number.isFinite(margin) &&
    margin >= 1 &&
    margin <= 5000;

  const spotQuantity =
    Number(spotQuantityInput);

  const validSpotQuantity =
    Number.isFinite(spotQuantity) &&
    spotQuantity > 0;

  const spotStopLoss =
    spotStopLossInput.trim() === ""
      ? undefined
      : Number(spotStopLossInput);

  const spotTakeProfit =
    spotTakeProfitInput.trim() === ""
      ? undefined
      : Number(spotTakeProfitInput);

  const spotStopLossValid =
    spotStopLoss === undefined ||
    (
      Number.isFinite(spotStopLoss) &&
      spotStopLoss > 0 &&
      spotStopLoss < displayedPrice
    );

  const spotTakeProfitValid =
    spotTakeProfit === undefined ||
    (
      Number.isFinite(spotTakeProfit) &&
      spotTakeProfit > displayedPrice
    );

  const feeRate =
    account?.feeRate ??
    0.0005;

  const maintenanceRate =
    account
      ?.maintenanceMarginRate ??
    0.005;

  const notional =
    validMargin
      ? margin * leverage
      : 0;

  const quantity =
    displayedPrice > 0
      ? notional / displayedPrice
      : 0;

  const estimatedFee =
    notional * feeRate;

  const estimatedLongLiquidation =
    estimateLiquidation(
      "LONG",
      displayedPrice,
      leverage,
      maintenanceRate,
    );

  const estimatedShortLiquidation =
    estimateLiquidation(
      "SHORT",
      displayedPrice,
      leverage,
      maintenanceRate,
    );

  const stopLoss =
    Number(stopLossInput);

  const takeProfit =
    Number(takeProfitInput);

  const validRiskNumbers =
    Number.isFinite(stopLoss) &&
    stopLoss > 0 &&
    Number.isFinite(takeProfit) &&
    takeProfit > 0 &&
    displayedPrice > 0 &&
    quantity > 0;

  const longRiskValid =
    validRiskNumbers &&
    stopLoss < displayedPrice &&
    stopLoss >
      estimatedLongLiquidation &&
    takeProfit > displayedPrice;

  const shortRiskValid =
    validRiskNumbers &&
    stopLoss > displayedPrice &&
    stopLoss <
      estimatedShortLiquidation &&
    takeProfit < displayedPrice;

  const longEstimatedMaxLoss =
    longRiskValid
      ? Math.max(
          0,
          (
            displayedPrice -
            stopLoss
          ) *
            quantity +
            estimatedFee +
            stopLoss *
              quantity *
              feeRate,
        )
      : 0;

  const longEstimatedNetReward =
    longRiskValid
      ? Math.max(
          0,
          (
            takeProfit -
            displayedPrice
          ) *
            quantity -
            estimatedFee -
            takeProfit *
              quantity *
              feeRate,
        )
      : 0;

  const longRiskReward =
    longEstimatedMaxLoss > 0
      ? longEstimatedNetReward /
        longEstimatedMaxLoss
      : 0;

  const shortEstimatedMaxLoss =
    shortRiskValid
      ? Math.max(
          0,
          (
            stopLoss -
            displayedPrice
          ) *
            quantity +
            estimatedFee +
            stopLoss *
              quantity *
              feeRate,
        )
      : 0;

  const shortEstimatedNetReward =
    shortRiskValid
      ? Math.max(
          0,
          (
            displayedPrice -
            takeProfit
          ) *
            quantity -
            estimatedFee -
            takeProfit *
              quantity *
              feeRate,
        )
      : 0;

  const shortRiskReward =
    shortEstimatedMaxLoss > 0
      ? shortEstimatedNetReward /
        shortEstimatedMaxLoss
      : 0;

  const position = account?.positions.find(
    (candidate) =>
      candidate.symbol === cryptoSymbol,
  );

  const modalClosePosition =
    modal?.action.kind === "CLOSE"
      ? modal.action.position
      : null;

  const modalCloseEstimate =
    modalClosePosition
      ? (() => {
          const closeNotional =
            modalClosePosition.quantity *
            modalClosePosition.markPrice;

          const closeFee =
            closeNotional *
            feeRate;

          const fundingFee = 0;

          const netPnl =
            modalClosePosition
              .unrealizedPnl -
            modalClosePosition
              .entryFee -
            closeFee -
            fundingFee;

          return {
            closeNotional,
            closeFee,
            fundingFee,
            netPnl,
          };
        })()
      : null;

  const completedCloseBreakdown =
    modal?.phase === "success" &&
    modal.action.kind === "CLOSE"
      ? {
          grossPnl:
            modal.result.trade
              .realizedPnl +
            modal.action.position
              .entryFee +
            modal.result.order.fee,

          entryFee:
            modal.action.position
              .entryFee,

          closeFee:
            modal.result.order.fee,

          fundingFee: 0,

          netPnl:
            modal.result.trade
              .realizedPnl,
        }
      : null;

  const enoughBalance =
    Boolean(
      account &&
      validMargin &&
      account.availableBalance >=
        margin +
          estimatedFee,
    );

  const canOpen =
    activeMarket === "crypto" &&
    Boolean(account) &&
    validMargin &&
    validRiskNumbers &&
    enoughBalance &&
    !position &&
    modal === null;

  const openConfirmation = (
    direction: FuturesDirection,
  ) => {
    if (!canOpen) {
      return;
    }

    const directionRiskValid =
      direction === "LONG"
        ? longRiskValid
        : shortRiskValid;

    if (!directionRiskValid) {
      setAccountError(
        direction === "LONG"
          ? "LONG requires Stop Loss below entry but above liquidation, and Take Profit above entry."
          : "SHORT requires Stop Loss above entry but below liquidation, and Take Profit below entry.",
      );

      return;
    }

    setAccountError("");

    setModal({
      phase: "confirm",
      action: {
        kind: "OPEN",
        direction,
      },
    });
  };

  const closeConfirmation = () => {
    if (!position || modal) {
      return;
    }

    setModal({
      phase: "confirm",
      action: {
        kind: "CLOSE",
        position,
      },
    });
  };

  const closeModal = () => {
    if (
      modal?.phase !== "pending"
    ) {
      setModal(null);
    }
  };

  const confirmAction =
    async () => {
      if (
        !modal ||
        modal.phase !== "confirm"
      ) {
        return;
      }

      const action = modal.action;

      setModal({
        phase: "pending",
        action,
      });

      try {
        const result =
          action.kind === "OPEN"
            ? await postOrder(
                "/api/trading/futures/orders",
                {
                  symbol: cryptoSymbol,
                  direction:
                    action.direction,
                  margin,
                  leverage,
                  stopLoss,
                  takeProfit,
                  clientOrderId:
                    "ui-futures-open-" +
                    Date.now()
                      .toString(36) +
                    "-" +
                    Math.random()
                      .toString(36)
                      .slice(2, 10),
                },
              )
            : await postOrder(
                "/api/trading/futures/close",
                {
                  positionId:
                    action.position.id,
                  clientOrderId:
                    "ui-futures-close-" +
                    Date.now()
                      .toString(36) +
                    "-" +
                    Math.random()
                      .toString(36)
                      .slice(2, 10),
                },
              );

        setAccount(
          result.account,
        );

        setAccountError("");

        setModal({
          phase: "success",
          action,
          result,
        });
      }
      catch (error) {
        setModal({
          phase: "error",
          action,
          message:
            error instanceof Error
              ? error.message
              : "The futures order failed.",
        });
      }
    };

  const rootClassName = [
    variant === "desktop"
      ? "desktop-chart-trade-overlay"
      : "mobile-trade-actions",
    styles.root,
  ].join(" ");

  const modalNode =
    mounted && modal
      ? createPortal(
          <div
            className={
              styles.modalBackdrop
            }
            onMouseDown={(
              event,
            ) => {
              if (
                event.target ===
                event.currentTarget
              ) {
                closeModal();
              }
            }}
          >
            <section
              className={
                styles.modal
              }
              role="dialog"
              aria-modal="true"
              aria-labelledby="futures-modal-title"
            >
              <header
                className={
                  styles.modalHeader
                }
              >
                <div>
                  <span>
                    ZAINEX PAPER FUTURES
                  </span>

                  <h2 id="futures-modal-title">
                    {modal.phase ===
                    "confirm"
                      ? modal.action.kind ===
                        "OPEN"
                        ? `Confirm ${modal.action.direction}`
                        : "Close Position"
                      : modal.phase ===
                          "pending"
                        ? "Executing Order"
                        : modal.phase ===
                            "success"
                          ? "Order Filled"
                          : "Order Failed"}
                  </h2>
                </div>

                <button
                  type="button"
                  onClick={
                    closeModal
                  }
                  disabled={
                    modal.phase ===
                    "pending"
                  }
                  aria-label="Close futures modal"
                >
                  X
                </button>
              </header>

              <div
                className={
                  styles.paperLabel
                }
              >
                <i />
                REAL MARKET PRICE |
                VIRTUAL USDT |
                ISOLATED
              </div>

              {modal.phase ===
              "confirm" ? (
                <>
                  <div
                    className={
                      styles.modalSummary
                    }
                  >
                    <b
                      className={
                        modal.action
                          .kind ===
                        "OPEN"
                          ? modal.action
                                .direction ===
                              "LONG"
                            ? styles.longTag
                            : styles.shortTag
                          : styles.closeTag
                      }
                    >
                      {modal.action
                        .kind ===
                      "OPEN"
                        ? modal.action
                            .direction
                        : "CLOSE"}
                    </b>

                    <div>
                      <strong>
                        {modal.action
                          .kind ===
                        "OPEN"
                          ? cryptoSymbol
                          : modal.action
                              .position
                              .symbol}
                      </strong>

                      <span>
                        USDT-M perpetual
                      </span>
                    </div>

                    <strong>
                      {modal.action
                        .kind ===
                      "OPEN"
                        ? `${leverage}x`
                        : `${modal.action.position.leverage}x`}
                    </strong>
                  </div>

                  <div
                    className={
                      styles.modalGrid
                    }
                  >
                    {modal.action
                      .kind ===
                    "OPEN" ? (
                      <>
                        <div>
                          <span>
                            Margin
                          </span>
                          <strong>
                            {formatUsdt(
                              margin,
                              2,
                            )}
                          </strong>
                        </div>

                        <div>
                          <span>
                            Notional
                          </span>
                          <strong>
                            {formatUsdt(
                              notional,
                              2,
                            )}
                          </strong>
                        </div>

                        <div>
                          <span>
                            Quantity
                          </span>
                          <strong>
                            {formatNumber(
                              quantity,
                              8,
                            )}{" "}
                            BTC
                          </strong>
                        </div>

                        <div>
                          <span>
                            Estimated fee
                          </span>
                          <strong>
                            {formatUsdt(
                              estimatedFee,
                              8,
                            )}
                          </strong>
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <span>
                            Direction
                          </span>
                          <strong>
                            {
                              modal
                                .action
                                .position
                                .direction
                            }
                          </strong>
                        </div>

                        <div>
                          <span>
                            Gross unrealized PnL
                          </span>
                          <strong
                            className={pnlClass(
                              modal.action
                                .position
                                .unrealizedPnl,
                            )}
                          >
                            {formatSignedUsdt(
                              modal.action
                                .position
                                .unrealizedPnl,
                            )}
                          </strong>
                        </div>

                        <div>
                          <span>
                            Entry fee paid
                          </span>
                          <strong>
                            {formatUsdt(
                              modal.action
                                .position
                                .entryFee,
                              8,
                            )}
                          </strong>
                        </div>

                        <div>
                          <span>
                            Estimated close notional
                          </span>
                          <strong>
                            {formatUsdt(
                              modalCloseEstimate
                                ?.closeNotional ??
                                0,
                              8,
                            )}
                          </strong>
                        </div>

                        <div>
                          <span>
                            Estimated close fee
                          </span>
                          <strong>
                            {formatUsdt(
                              modalCloseEstimate
                                ?.closeFee ??
                                0,
                              8,
                            )}
                          </strong>
                        </div>

                        <div>
                          <span>
                            Funding fee
                            (not implemented)
                          </span>
                          <strong>
                            {formatUsdt(
                              modalCloseEstimate
                                ?.fundingFee ??
                                0,
                              8,
                            )}
                          </strong>
                        </div>

                        <div>
                          <span>
                            Estimated net PnL
                          </span>
                          <strong
                            className={pnlClass(
                              modalCloseEstimate
                                ?.netPnl ??
                                0,
                            )}
                          >
                            {formatSignedUsdt(
                              modalCloseEstimate
                                ?.netPnl ??
                                0,
                            )}
                          </strong>
                        </div>

                        <div>
                          <span>
                            Entry price
                          </span>
                          <strong>
                            {formatUsdt(
                              modal.action
                                .position
                                .entryPrice,
                              2,
                            )}
                          </strong>
                        </div>

                        <div>
                          <span>
                            Mark price
                          </span>
                          <strong>
                            {formatUsdt(
                              modal.action
                                .position
                                .markPrice,
                              2,
                            )}
                          </strong>
                        </div>
                      </>
                    )}
                  </div>

                  <p
                    className={
                      styles.modalNote
                    }
                  >
                    Paper trading only.
                    No real money or live
                    exchange order will be used.
                  </p>
                </>
              ) : null}

              {modal.phase ===
              "pending" ? (
                <div
                  className={
                    styles.pending
                  }
                >
                  <i />

                  <strong>
                    Processing order
                  </strong>

                  <span>
                    Fetching the current
                    public market price.
                  </span>
                </div>
              ) : null}

              {modal.phase ===
              "success" ? (
                <>
                  <div
                    className={
                      styles.success
                    }
                  >
                    <i />

                    <div>
                      <strong>
                        {modal.result
                          .order
                          .action ===
                        "OPEN"
                          ? `${modal.result.order.direction} OPENED`
                          : modal.result.order.action ===
                              "LIQUIDATE"
                            ? "POSITION LIQUIDATED"
                            : "POSITION CLOSED"}
                      </strong>

                      <span>
                        {
                          modal.result
                            .order
                            .symbol
                        }
                        {" |"}{" "}
                        {
                          modal.result
                            .order
                            .leverage
                        }
                        x
                      </span>
                    </div>

                    <b
                      className={pnlClass(
                        modal.result
                          .trade
                          .realizedPnl,
                      )}
                    >
                      {modal.result
                        .order
                        .action ===
                      "OPEN"
                        ? "OPEN"
                        : formatSignedUsdt(
                            modal
                              .result
                              .trade
                              .realizedPnl,
                          )}
                    </b>
                  </div>

                  <div
                    className={
                      styles.modalGrid
                    }
                  >
                    <div>
                      <span>
                        Execution price
                      </span>
                      <strong>
                        {formatUsdt(
                          modal.result
                            .order
                            .executedPrice,
                          2,
                        )}
                      </strong>
                    </div>

                    {completedCloseBreakdown ? (
                      <>
                        <div>
                          <span>
                            Gross realized PnL
                          </span>
                          <strong
                            className={pnlClass(
                              completedCloseBreakdown
                                .grossPnl,
                            )}
                          >
                            {formatSignedUsdt(
                              completedCloseBreakdown
                                .grossPnl,
                            )}
                          </strong>
                        </div>

                        <div>
                          <span>
                            Entry fee
                          </span>
                          <strong>
                            {formatUsdt(
                              completedCloseBreakdown
                                .entryFee,
                              8,
                            )}
                          </strong>
                        </div>

                        <div>
                          <span>
                            Close fee
                          </span>
                          <strong>
                            {formatUsdt(
                              completedCloseBreakdown
                                .closeFee,
                              8,
                            )}
                          </strong>
                        </div>

                        <div>
                          <span>
                            Funding fee
                            (not implemented)
                          </span>
                          <strong>
                            {formatUsdt(
                              completedCloseBreakdown
                                .fundingFee,
                              8,
                            )}
                          </strong>
                        </div>

                        <div>
                          <span>
                            Final net PnL
                          </span>
                          <strong
                            className={pnlClass(
                              completedCloseBreakdown
                                .netPnl,
                            )}
                          >
                            {formatSignedUsdt(
                              completedCloseBreakdown
                                .netPnl,
                            )}
                          </strong>
                        </div>
                      </>
                    ) : (
                      <div>
                        <span>
                          Entry fee
                        </span>
                        <strong>
                          {formatUsdt(
                            modal.result
                              .order
                              .fee,
                            8,
                          )}
                        </strong>
                      </div>
                    )}

                    <div>
                      <span>
                        Provider
                      </span>
                      <strong>
                        {
                          modal.result
                            .quoteProvider
                        }
                      </strong>
                    </div>

                    <div>
                      <span>
                        Available balance
                      </span>
                      <strong>
                        {formatUsdt(
                          modal.result
                            .account
                            .availableBalance,
                          2,
                        )}
                      </strong>
                    </div>
                  </div>
                </>
              ) : null}

              {modal.phase ===
              "error" ? (
                <div
                  className={
                    styles.error
                  }
                >
                  <i>!</i>

                  <div>
                    <strong>
                      NOT EXECUTED
                    </strong>

                    <span>
                      {
                        modal.message
                      }
                    </span>
                  </div>
                </div>
              ) : null}

              <footer
                className={
                  styles.modalActions
                }
              >
                {modal.phase ===
                "confirm" ? (
                  <>
                    <button
                      type="button"
                      className={
                        styles.secondary
                      }
                      onClick={
                        closeModal
                      }
                    >
                      Cancel
                    </button>

                    <button
                      type="button"
                      className={
                        styles.primary
                      }
                      onClick={() => {
                        void confirmAction();
                      }}
                    >
                      Confirm
                    </button>
                  </>
                ) : null}

                {modal.phase ===
                "pending" ? (
                  <button
                    type="button"
                    className={
                      styles.primary
                    }
                    disabled
                  >
                    Processing...
                  </button>
                ) : null}

                {modal.phase ===
                  "success" ||
                modal.phase ===
                  "error" ? (
                  <button
                    type="button"
                    className={
                      styles.primary
                    }
                    onClick={
                      closeModal
                    }
                  >
                    Close
                  </button>
                ) : null}
              </footer>
            </section>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <div className={rootClassName}>
        <div
          className={
            styles.modeSwitch
          }
        >
          <button
            type="button"
            className={
              mode === "spot"
                ? styles.activeMode
                : ""
            }
            onClick={() => {
              setMode("spot");
              onModeChange?.("spot");
            }}
          >
            SPOT
          </button>

          <button
            type="button"
            className={
              mode === "futures"
                ? styles.activeMode
                : ""
            }
            onClick={() => {
              setMode(
                "futures",
              );

              onModeChange?.(
                "futures",
              );
            }}
          >
            FUTURES
          </button>

          <span>
            {mode === "spot"
              ? "Paper spot"
              : "USDT-M perpetual"}
          </span>
        </div>

        {mode === "futures" &&
        !position ? (
          <>
            <button
              type="button"
              className={`${styles.futuresButton} ${styles.shortButton}`}
              onClick={() => {
                openConfirmation(
                  "SHORT",
                );
              }}
              disabled={
                !canOpen
              }
            >
              <span>SHORT</span>
              <strong>
                {displayPrice}
              </strong>
              <small>
                Open short |{" "}
                {leverage}x
              </small>
            </button>

            <button
              type="button"
              className={`${styles.futuresButton} ${styles.longButton}`}
              onClick={() => {
                openConfirmation(
                  "LONG",
                );
              }}
              disabled={
                !canOpen
              }
            >
              <span>LONG</span>
              <strong>
                {displayPrice}
              </strong>
              <small>
                Open long |{" "}
                {leverage}x
              </small>
            </button>
          </>
        ) : null}

        {mode === "spot" ? (
          <>
            <button
              className={
                variant === "desktop"
                  ? "desktop-chart-trade-button desktop-chart-sell-button"
                  : "mobile-trade-button mobile-sell-button"
              }
              type="button"
              disabled={
                !validSpotQuantity
              }
              onClick={() => {
                onSpotSell(
                  spotQuantity,
                );
              }}
            >
              <span>SELL</span>

              {variant ===
              "desktop" ? (
                <strong>
                  {displayPrice}
                </strong>
              ) : null}

              <small>
                Sell paper position
              </small>
            </button>

            <button
              className={
                variant === "desktop"
                  ? "desktop-chart-trade-button desktop-chart-buy-button"
                  : "mobile-trade-button mobile-buy-button"
              }
              type="button"
              disabled={
                !validSpotQuantity ||
                !spotStopLossValid ||
                !spotTakeProfitValid
              }
              onClick={() => {
                onSpotBuy(
                  spotQuantity,
                  spotStopLoss,
                  spotTakeProfit,
                );
              }}
            >
              <span>BUY</span>

              {variant ===
              "desktop" ? (
                <strong>
                  {displayPrice}
                </strong>
              ) : null}

              <small>
                Buy paper position
              </small>
            </button>
          </>
        ) : null}

        {mode === "spot" ? (
          <section
            className={
              styles.panel
            }
          >
            <div
              className={
                styles.inputGrid
              }
            >
              <label>
                <span>
                  Quantity
                </span>

                <div>
                  <input
                    type="number"
                    min="0.0001"
                    step="0.0001"
                    inputMode="decimal"
                    value={
                      spotQuantityInput
                    }
                    onChange={(
                      event,
                    ) => {
                      setSpotQuantityInput(
                        event.target
                          .value,
                      );
                    }}
                  />

                  <b>
                    {activeMarket ===
                    "crypto"
                      ? "BTC"
                      : activeMarket ===
                          "forex"
                        ? "LOT"
                        : "SHARES"}
                  </b>
                </div>
              </label>
            </div>

            <div
              className={
                styles.inputGrid
              }
            >
              <label>
                <span>
                  STOP LOSS
                  (optional)
                </span>

                <div>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={
                      spotStopLossInput
                    }
                    placeholder="Enter stop price"
                    onChange={(
                      event,
                    ) => {
                      setSpotStopLossInput(
                        event.target
                          .value,
                      );
                    }}
                  />

                  <b>USD</b>
                </div>
              </label>

              <label>
                <span>
                  TAKE PROFIT
                  (optional)
                </span>

                <div>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={
                      spotTakeProfitInput
                    }
                    placeholder="Enter target price"
                    onChange={(
                      event,
                    ) => {
                      setSpotTakeProfitInput(
                        event.target
                          .value,
                      );
                    }}
                  />

                  <b>USD</b>
                </div>
              </label>
            </div>

            {!validSpotQuantity ? (
              <div
                className={
                  styles.warning
                }
              >
                Enter a quantity
                greater than 0.
              </div>
            ) : !spotStopLossValid ? (
              <div
                className={
                  styles.warning
                }
              >
                Stop loss must be a
                positive price below
                the current market
                price.
              </div>
            ) : !spotTakeProfitValid ? (
              <div
                className={
                  styles.warning
                }
              >
                Take profit must be
                a price above the
                current market price.
              </div>
            ) : null}

            <SpotAiSignalPanel
              assetClass={
                activeMarket
              }
              symbol={
                activeMarket === "crypto"
                  ? cryptoSymbol
                  : activeMarket === "forex"
                    ? forexPair
                    : undefined
              }
              symbolLabel={
                activeMarket === "crypto"
                  ? CRYPTO_SYMBOL_LABELS[
                      cryptoSymbol
                    ]
                  : activeMarket === "forex"
                    ? FOREX_PAIR_LABELS[
                        forexPair
                      ]
                    : undefined
              }
              onApplyLevels={(levels) => {
                setSpotStopLossInput(
                  String(
                    levels.stopLoss,
                  ),
                );
                setSpotTakeProfitInput(
                  String(
                    levels.takeProfit,
                  ),
                );
              }}
            />
          </section>
        ) : (
          <>
            <section
              className={
                styles.panel
              }
            >
              {activeMarket !==
              "crypto" ? (
                <div
                  className={
                    styles.warning
                  }
                >
                  Futures V1 supports
                  Crypto pairs only.
                  Select Crypto.
                </div>
              ) : (
                <>
                  <FuturesAiSignalPanel
                    symbol={cryptoSymbol}
                    symbolLabel={
                      CRYPTO_SYMBOL_LABELS[
                        cryptoSymbol
                      ]
                    }
                    onApplyLevels={(
                      levels,
                    ) => {
                      setStopLossInput(
                        String(
                          levels.stopLoss,
                        ),
                      );
                      setTakeProfitInput(
                        String(
                          levels.takeProfit,
                        ),
                      );
                    }}
                  />

                  <div
                    className={
                      styles.accountGrid
                    }
                  >
                    <div>
                      <span>
                        Available
                      </span>

                      <strong>
                        {account
                          ? formatUsdt(
                              account
                                .availableBalance,
                              2,
                            )
                          : loading
                            ? "Loading..."
                            : "--"}
                      </strong>
                    </div>

                    <div>
                      <span>
                        Equity
                      </span>

                      <strong>
                        {account
                          ? formatUsdt(
                              account
                                .totalEquity,
                              2,
                            )
                          : "--"}
                      </strong>
                    </div>

                    <div>
                      <span>
                        Used margin
                      </span>

                      <strong>
                        {account
                          ? formatUsdt(
                              account
                                .usedMargin,
                              2,
                            )
                          : "--"}
                      </strong>
                    </div>

                    <div>
                      <span>
                        Realized PnL
                      </span>

                      <strong
                        className={pnlClass(
                          account
                            ?.realizedPnl ??
                            0,
                        )}
                      >
                        {account
                          ? formatSignedUsdt(
                              account
                                .realizedPnl,
                            )
                          : "--"}
                      </strong>
                    </div>
                  </div>

                  {accountError ? (
                    <div
                      className={
                        styles.warning
                      }
                    >
                      {accountError}
                    </div>
                  ) : null}

                  <div
                    className={
                      styles.inputGrid
                    }
                  >
                    <label>
                      <span>
                        Isolated margin
                      </span>

                      <div>
                        <input
                          type="number"
                          min="1"
                          max="5000"
                          step="1"
                          value={
                            marginInput
                          }
                          onChange={(
                            event,
                          ) => {
                            setMarginInput(
                              event
                                .target
                                .value,
                            );
                          }}
                        />

                        <b>USDT</b>
                      </div>
                    </label>

                    <div
                      className={
                        styles.leverage
                      }
                    >
                      <span>
                        Leverage
                      </span>

                      <div>
                        {LEVERAGES.map(
                          (
                            value,
                          ) => (
                            <button
                              key={
                                value
                              }
                              type="button"
                              className={
                                leverage ===
                                value
                                  ? styles.activeLeverage
                                  : ""
                              }
                              onClick={() => {
                                setLeverage(
                                  value,
                                );
                              }}
                            >
                              {
                                value
                              }
                              x
                            </button>
                          ),
                        )}
                      </div>
                    </div>
                  </div>

                  <div
                    className={
                      styles.estimateGrid
                    }
                  >
                    <div>
                      <span>
                        Notional
                      </span>

                      <strong>
                        {formatUsdt(
                          notional,
                          2,
                        )}
                      </strong>
                    </div>

                    <div>
                      <span>
                        Quantity
                      </span>

                      <strong>
                        {formatNumber(
                          quantity,
                          8,
                        )}{" "}
                        BTC
                      </strong>
                    </div>

                    <div>
                      <span>
                        Entry fee
                      </span>

                      <strong>
                        {formatUsdt(
                          estimatedFee,
                          8,
                        )}
                      </strong>
                    </div>
                  </div>

                  {!validMargin ? (
                    <div
                      className={
                        styles.warning
                      }
                    >
                      Margin must be
                      1 to 5,000 USDT.
                    </div>
                  ) : !enoughBalance &&
                    account &&
                    !position ? (
                    <div
                      className={
                        styles.warning
                      }
                    >
                      Insufficient futures
                      balance.
                    </div>
                  ) : null}

                  {position ? (
                    <article
                      className={
                        styles.positionCard
                      }
                    >
                      <header>
                        <div>
                          <span>
                            OPEN POSITION
                          </span>

                          <strong>
                            {
                              position.direction
                            }{" "}
                            {
                              position.symbol
                            }
                            {" |"}{" "}
                            {
                              position.leverage
                            }
                            x
                          </strong>
                        </div>

                        <b
                          className={pnlClass(
                            position
                              .unrealizedPnl,
                          )}
                        >
                          {formatSignedUsdt(
                            position
                              .unrealizedPnl,
                          )}
                        </b>
                      </header>

                      <div
                        className={
                          styles.positionGrid
                        }
                      >
                        <span>
                          Entry
                          <strong>
                            {formatUsdt(
                              position
                                .entryPrice,
                              2,
                            )}
                          </strong>
                        </span>

                        <span>
                          Mark
                          <strong>
                            {formatUsdt(
                              position
                                .markPrice,
                              2,
                            )}
                          </strong>
                        </span>

                        <span>
                          Liquidation
                          <strong>
                            {formatUsdt(
                              position
                                .liquidationPrice,
                              2,
                            )}
                          </strong>
                        </span>

                        <span>
                          Stop loss
                          <strong>
                            {Number.isFinite(
                              position.stopLoss,
                            )
                              ? formatUsdt(
                                  position.stopLoss ??
                                    0,
                                  2,
                                )
                              : "NOT SET"}
                          </strong>
                        </span>

                        <span>
                          Take profit
                          <strong>
                            {Number.isFinite(
                              position.takeProfit,
                            )
                              ? formatUsdt(
                                  position.takeProfit ??
                                    0,
                                  2,
                                )
                              : "NOT SET"}
                          </strong>
                        </span>

                        <span>
                          Margin
                          <strong>
                            {formatUsdt(
                              position
                                .margin,
                              2,
                            )}
                          </strong>
                        </span>

                        <span>
                          Notional
                          <strong>
                            {formatUsdt(
                              position
                                .notional,
                              2,
                            )}
                          </strong>
                        </span>

                        <span>
                          ROE
                          <strong
                            className={pnlClass(
                              position
                                .roePercent,
                            )}
                          >
                            {position
                              .roePercent >
                            0
                              ? "+"
                              : ""}
                            {formatNumber(
                              position
                                .roePercent,
                              4,
                            )}
                            %
                          </strong>
                        </span>
                      </div>

                      <button
                        type="button"
                        className={
                          styles.closePosition
                        }
                        onClick={
                          closeConfirmation
                        }
                      >
                        CLOSE POSITION
                      </button>
                    </article>
                  ) : null}

                  {!position ? (
                      <>
                        {/* ZAINEX_FUTURES_RISK_GUARD_V1 */}

                        <div
                          className={
                            styles.inputGrid
                          }
                        >
                          <label>
                            <span>
                              STOP LOSS
                              (required)
                            </span>

                            <div>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                inputMode="decimal"
                                value={
                                  stopLossInput
                                }
                                placeholder="Enter stop price"
                                onChange={(
                                  event,
                                ) => {
                                  setStopLossInput(
                                    event.target
                                      .value,
                                  );

                                  setAccountError(
                                    "",
                                  );
                                }}
                              />

                              <b>USDT</b>
                            </div>
                          </label>

                          <label>
                            <span>
                              TAKE PROFIT
                              (required)
                            </span>

                            <div>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                inputMode="decimal"
                                value={
                                  takeProfitInput
                                }
                                placeholder="Enter target price"
                                onChange={(
                                  event,
                                ) => {
                                  setTakeProfitInput(
                                    event.target
                                      .value,
                                  );

                                  setAccountError(
                                    "",
                                  );
                                }}
                              />

                              <b>USDT</b>
                            </div>
                          </label>
                        </div>

                        <div
                          className={
                            styles.liquidationGrid
                          }
                        >
                          <span>
                            Long liquidation
                            <strong>
                              {formatUsdt(
                                estimatedLongLiquidation,
                                2,
                              )}
                            </strong>
                          </span>

                          <span>
                            Short liquidation
                            <strong>
                              {formatUsdt(
                                estimatedShortLiquidation,
                                2,
                              )}
                            </strong>
                          </span>

                          <span>
                            LONG max loss
                            <strong>
                              {longRiskValid
                                ? formatUsdt(
                                    longEstimatedMaxLoss,
                                    2,
                                  )
                                : "INVALID"}
                            </strong>
                          </span>

                          <span>
                            LONG risk/reward
                            <strong>
                              {longRiskValid
                                ? "1:" +
                                  longRiskReward
                                    .toFixed(2)
                                : "INVALID"}
                            </strong>
                          </span>

                          <span>
                            SHORT max loss
                            <strong>
                              {shortRiskValid
                                ? formatUsdt(
                                    shortEstimatedMaxLoss,
                                    2,
                                  )
                                : "INVALID"}
                            </strong>
                          </span>

                          <span>
                            SHORT risk/reward
                            <strong>
                              {shortRiskValid
                                ? "1:" +
                                  shortRiskReward
                                    .toFixed(2)
                                : "INVALID"}
                            </strong>
                          </span>
                        </div>
                      </>
                    ) : null}
                  <section
                    className={
                      styles.executionLog
                    }
                  >
                    <header
                      className={
                        styles.executionLogHeading
                      }
                    >
                      <div>
                        <span>
                          PAPER FUTURES FEED
                        </span>

                        <strong>
                          FUTURES EXECUTION LOGS
                        </strong>
                      </div>

                      <b>
                        {account
                          ? `Latest ${Math.min(
                              account.trades.length,
                              10,
                            )} of ${account.trades.length}`
                          : "Loading..."}
                      </b>
                    </header>

                    <div
                      className={
                        styles.executionLogTable
                      }
                    >
                      <div
                        className={
                          styles.executionLogHeader
                        }
                      >
                        <span>Time</span>
                        <span>Action</span>
                        <span>Direction</span>
                        <span>Leverage</span>
                        <span>Price</span>
                        <span>Fee</span>
                        <span>Result</span>
                      </div>

                      <div
                        className={
                          styles.executionLogBody
                        }
                      >
                        {!account ? (
                          <div
                            className={
                              styles.executionLogEmpty
                            }
                          >
                            Loading futures executions...
                          </div>
                        ) : account.trades.length >
                          0 ? (
                          account.trades
                            .slice(0, 10)
                            .map((trade) => {
                              const result =
                                getFuturesTradeResult(
                                  trade,
                                );

                              return (
                                <div
                                  className={
                                    styles.executionLogRow
                                  }
                                  key={
                                    trade.id
                                  }
                                >
                                  <span>
                                    {formatFuturesExecutionTime(
                                      trade.executedAt,
                                    )}
                                  </span>

                                  <strong>
                                      {trade.reason ===
                                      "STOP_LOSS"
                                        ? "STOP LOSS"
                                        : trade.reason ===
                                            "TAKE_PROFIT"
                                          ? "TAKE PROFIT"
                                          : trade.action}
                                    </strong>

                                  <span>
                                    {trade.direction}
                                  </span>

                                  <span>
                                    {trade.leverage}x
                                  </span>

                                  <span>
                                    {formatUsdt(
                                      trade.price,
                                      2,
                                    )}
                                  </span>

                                  <span>
                                    {formatUsdt(
                                      trade.fee,
                                      8,
                                    )}
                                  </span>

                                  <b
                                    className={pnlClass(
                                      trade.realizedPnl,
                                    )}
                                  >
                                    {result}

                                    {trade.action !==
                                    "OPEN"
                                      ? ` ${formatSignedUsdt(
                                          trade.realizedPnl,
                                        )}`
                                      : ""}
                                  </b>
                                </div>
                              );
                            })
                        ) : (
                          <div
                            className={
                              styles.executionLogEmpty
                            }
                          >
                            No futures executions yet.
                            Open a LONG or SHORT position
                            to create the first record.
                          </div>
                        )}
                      </div>
                    </div>
                  </section>
                </>
              )}
            </section>


          </>
        )}
      </div>

      {modalNode}
    </>
  );
}