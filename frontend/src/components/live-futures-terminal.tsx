"use client";

import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  createPortal,
} from "react-dom";

import styles from "./futures-paper-terminal.module.css";
import liveStyles from "./live-futures-terminal.module.css";

import { FuturesAiSignalPanel } from "./futures-ai-signal-panel";

import {
  CRYPTO_SYMBOL_LABELS,
} from "@/lib/crypto-symbols";

// ZAINEX_LIVE_OKX_TRADING_V1
// Standalone live-trading terminal, kept entirely separate from
// FuturesPaperTerminal (which stays untouched) — reuses its CSS module
// for shared visual language (account grid, position card, modal, log
// table) since the two are meant to look like the same product, but
// none of its state or logic. Every number here moves real money.

const SYMBOLS = [
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "BNBUSDT",
  "XRPUSDT",
  "ADAUSDT",
  "DOGEUSDT",
] as const;

type LiveSymbol = (typeof SYMBOLS)[number];

const LEVERAGE_PRESETS = [
  1, 2, 5, 10, 20,
] as const;

type LiveDirection =
  | "LONG"
  | "SHORT";

type ConnectionStatus =
  | "PENDING"
  | "ACTIVE"
  | "INVALID"
  | "REVOKED";

type Connection = {
  exchange: string;
  label: string | null;
  isDemo: boolean;
  status: ConnectionStatus;
  maskedApiKey: string | null;
  lastVerifiedAt: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
};

type ConnectionApiResponse = {
  ok: boolean;
  connection?: Connection | null;
  error?: {
    code?: string;
    message?: string;
  };
};

type LivePosition = {
  id: string;
  symbol: string;
  exchangeInstrumentId: string;
  direction: LiveDirection;
  leverage: number;
  margin: number;
  quantity: number;
  entryPrice: number;
  markPrice: number;
  notional: number;
  entryFee: number;
  liquidationPrice: number;
  stopLoss: number;
  takeProfit: number;
  unrealizedPnl: number;
  roePercent: number;
  markProvider: string;
  openedAt: string | null;
};

type LiveOrder = {
  id: string;
  action: "OPEN" | "CLOSE";
  direction: LiveDirection;
  symbol: string;
  status: string;
  leverage: number;
  margin: number;
  quantity: number;
  executedPrice: number;
  notional: number;
  fee: number;
  rejectionCode: string | null;
  createdAt: string;
};

type LiveTrade = {
  id: string;
  action: "OPEN" | "CLOSE";
  direction: LiveDirection;
  symbol: string;
  leverage: number;
  quantity: number;
  price: number;
  notional: number;
  fee: number;
  realizedPnl: number;
  reason: string;
  executedAt: string;
};

type LiveAccount = {
  mode: "live-okx-futures";
  currency: "USDT";
  availableBalance: number;
  usedMargin: number;
  totalEquity: number;
  realizedPnl: number;
  unrealizedPnl: number;
  positions: LivePosition[];
  orders: LiveOrder[];
  trades: LiveTrade[];
};

type LiveExecutionResult = {
  order: LiveOrder;
  trade: LiveTrade;
  account: LiveAccount;
  idempotentReplay: boolean;
};

type AccountApiResponse = {
  ok: boolean;
  account?: LiveAccount;
  error?: {
    code?: string;
    message?: string;
    details?: {
      maxLeverage?: number;
    };
  };
};

type ExecutionApiResponse = {
  ok: boolean;
  result?: LiveExecutionResult;
  error?: {
    code?: string;
    message?: string;
    details?: {
      maxLeverage?: number;
    };
  };
};

type LiveAction =
  | {
      kind: "OPEN";
      direction: LiveDirection;
    }
  | {
      kind: "CLOSE";
      position: LivePosition;
    };

type ModalState =
  | {
      phase: "confirm";
      action: LiveAction;
    }
  | {
      phase: "pending";
      action: LiveAction;
    }
  | {
      phase: "success";
      action: LiveAction;
      result: LiveExecutionResult;
    }
  | {
      phase: "ambiguous";
      action: LiveAction;
      message: string;
    }
  | {
      phase: "error";
      action: LiveAction;
      message: string;
    };

type Props = {
  variant: "desktop" | "mobile";
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
    { maximumFractionDigits },
  );
}

function pnlClass(
  value: number,
): string {
  if (value > 0) {
    return styles.positive;
  }

  if (value < 0) {
    return styles.negative;
  }

  return styles.neutral;
}

function clientOrderId(
  prefix: string,
): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function LiveFuturesTerminal({
  variant,
}: Props) {
  const [
    connection,
    setConnection,
  ] = useState<Connection | null>(
    null,
  );

  const [
    connectionLoading,
    setConnectionLoading,
  ] = useState(true);

  const [account, setAccount] =
    useState<LiveAccount | null>(
      null,
    );

  const [accountError, setAccountError] =
    useState("");

  const [
    apiKeyInput,
    setApiKeyInput,
  ] = useState("");

  const [
    apiSecretInput,
    setApiSecretInput,
  ] = useState("");

  const [
    passphraseInput,
    setPassphraseInput,
  ] = useState("");

  const [isDemoInput, setIsDemoInput] =
    useState(false);

  const [connecting, setConnecting] =
    useState(false);

  const [connectError, setConnectError] =
    useState("");

  const [
    disconnecting,
    setDisconnecting,
  ] = useState(false);

  const [symbol, setSymbol] =
    useState<LiveSymbol>("BTCUSDT");

  const [
    referencePrice,
    setReferencePrice,
  ] = useState<number | null>(null);

  const [marginInput, setMarginInput] =
    useState("50");

  const [leverage, setLeverage] =
    useState(5);

  const [
    stopLossInput,
    setStopLossInput,
  ] = useState("");

  const [
    takeProfitInput,
    setTakeProfitInput,
  ] = useState("");

  const [modal, setModal] =
    useState<ModalState | null>(
      null,
    );

  const [
    accountRefreshKey,
    setAccountRefreshKey,
  ] = useState(0);

  const refreshAccount =
    useCallback(() => {
      setAccountRefreshKey(
        (key) => key + 1,
      );
    }, []);

  useEffect(() => {
    let disposed = false;

    async function loadConnection() {
      try {
        const response = await fetch(
          "/api/trading/exchange/okx",
          {
            cache: "no-store",
            credentials:
              "same-origin",
          },
        );

        const payload =
          (await response.json()) as ConnectionApiResponse;

        if (disposed) {
          return;
        }

        if (
          !response.ok ||
          !payload.ok
        ) {
          setConnection(null);
          return;
        }

        setConnection(
          payload.connection ?? null,
        );
      }
      catch {
        if (!disposed) {
          setConnection(null);
        }
      }
      finally {
        if (!disposed) {
          setConnectionLoading(false);
        }
      }
    }

    void loadConnection();

    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    if (
      connection?.status !== "ACTIVE"
    ) {
      return;
    }

    let disposed = false;

    async function loadAccount() {
      try {
        const response = await fetch(
          "/api/trading/futures/live/account",
          {
            cache: "no-store",
            credentials:
              "same-origin",
          },
        );

        const payload =
          (await response.json()) as AccountApiResponse;

        if (disposed) {
          return;
        }

        if (
          !response.ok ||
          !payload.ok ||
          !payload.account
        ) {
          setAccountError(
            payload.error?.message ??
              "Unable to load your live account.",
          );
          return;
        }

        setAccountError("");
        setAccount(payload.account);
      }
      catch {
        if (!disposed) {
          setAccountError(
            "Network error loading your live account.",
          );
        }
      }
    }

    void loadAccount();

    const timer = window.setInterval(
      () => {
        void loadAccount();
      },
      15000,
    );

    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [
    connection?.status,
    accountRefreshKey,
  ]);

  useEffect(() => {
    let disposed = false;

    async function loadReferencePrice() {
      try {
        const endpoint = new URL(
          "/api/market/candles",
          window.location.origin,
        );

        endpoint.searchParams.set(
          "market",
          "crypto",
        );
        endpoint.searchParams.set(
          "symbol",
          symbol,
        );
        endpoint.searchParams.set(
          "interval",
          "1h",
        );
        endpoint.searchParams.set(
          "limit",
          "2",
        );

        const response = await fetch(
          endpoint,
          { cache: "no-store" },
        );

        const payload = (await response.json()) as {
          ok: boolean;
          summary?: {
            rawPrice?: string;
          };
        };

        if (
          disposed ||
          !response.ok ||
          !payload.ok
        ) {
          return;
        }

        const parsed = Number(
          payload.summary?.rawPrice,
        );

        if (Number.isFinite(parsed)) {
          setReferencePrice(parsed);
        }
      }
      catch {
        // Reference price is a display estimate only — a failure here
        // isn't worth surfacing as an error.
      }
    }

    void loadReferencePrice();

    return () => {
      disposed = true;
    };
  }, [symbol]);

  const position =
    account?.positions[0] ?? null;

  const margin = Math.max(
    0,
    Number(marginInput) || 0,
  );

  const notional =
    margin * leverage;

  const estimatedQuantity =
    referencePrice && referencePrice > 0
      ? notional / referencePrice
      : 0;

  const validMargin =
    margin > 0 && margin <= 5000;

  const validStopLoss =
    stopLossInput.trim() !== "" &&
    Number(stopLossInput) > 0;

  const validTakeProfit =
    takeProfitInput.trim() !== "" &&
    Number(takeProfitInput) > 0;

  const enoughBalance =
    !account ||
    margin <= account.availableBalance;

  const canOpen =
    !position &&
    validMargin &&
    validStopLoss &&
    validTakeProfit &&
    enoughBalance;

  async function handleConnect(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (connecting) {
      return;
    }

    setConnecting(true);
    setConnectError("");

    try {
      const response = await fetch(
        "/api/trading/exchange/okx/connect",
        {
          method: "POST",
          credentials:
            "same-origin",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            apiKey: apiKeyInput.trim(),
            apiSecret:
              apiSecretInput.trim(),
            passphrase:
              passphraseInput.trim(),
            isDemo: isDemoInput,
          }),
        },
      );

      const payload =
        (await response.json()) as ConnectionApiResponse;

      if (
        !response.ok ||
        !payload.ok
      ) {
        throw new Error(
          payload.error?.message ??
            "Could not connect your OKX account.",
        );
      }

      setApiKeyInput("");
      setApiSecretInput("");
      setPassphraseInput("");
      setConnection(
        payload.connection ?? null,
      );
    }
    catch (error) {
      setConnectError(
        error instanceof Error
          ? error.message
          : "Could not connect your OKX account.",
      );
    }
    finally {
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    if (disconnecting) {
      return;
    }

    if (
      position &&
      !window.confirm(
        "You have an open live position. Disconnecting stops ZAINEX from managing it — it will remain open on OKX itself. Continue?",
      )
    ) {
      return;
    }

    setDisconnecting(true);

    try {
      const response = await fetch(
        "/api/trading/exchange/okx/disconnect",
        {
          method: "POST",
          credentials:
            "same-origin",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            force: position !== null,
          }),
        },
      );

      const payload =
        (await response.json()) as ConnectionApiResponse;

      if (
        !response.ok ||
        !payload.ok
      ) {
        window.alert(
          payload.error?.message ??
            "Could not disconnect your OKX account.",
        );
        return;
      }

      setConnection(null);
      setAccount(null);
    }
    finally {
      setDisconnecting(false);
    }
  }

  function openConfirmation(
    direction: LiveDirection,
  ) {
    setModal({
      phase: "confirm",
      action: {
        kind: "OPEN",
        direction,
      },
    });
  }

  function closeConfirmation() {
    if (!position) {
      return;
    }

    setModal({
      phase: "confirm",
      action: {
        kind: "CLOSE",
        position,
      },
    });
  }

  function closeModal() {
    setModal(null);
  }

  const confirmAction =
    useCallback(async () => {
      if (!modal || modal.phase !== "confirm") {
        return;
      }

      const action = modal.action;

      setModal({
        phase: "pending",
        action,
      });

      try {
        if (action.kind === "OPEN") {
          const response = await fetch(
            "/api/trading/futures/live/orders",
            {
              method: "POST",
              credentials:
                "same-origin",
              headers: {
                "Content-Type":
                  "application/json",
              },
              body: JSON.stringify({
                symbol,
                direction:
                  action.direction,
                margin: marginInput,
                leverage,
                stopLoss:
                  stopLossInput,
                takeProfit:
                  takeProfitInput,
                clientOrderId:
                  clientOrderId(
                    "live-open",
                  ),
              }),
            },
          );

          const payload =
            (await response.json()) as ExecutionApiResponse;

          if (
            response.status === 503 &&
            payload.error?.code ===
              "OKX_ORDER_STATUS_UNKNOWN"
          ) {
            setModal({
              phase: "ambiguous",
              action,
              message:
                payload.error
                  .message ??
                "We could not confirm this order's status.",
            });
            refreshAccount();
            return;
          }

          if (
            !response.ok ||
            !payload.ok ||
            !payload.result
          ) {
            throw new Error(
              payload.error
                ?.message ??
                "The live order was not executed.",
            );
          }

          setAccount(
            payload.result.account,
          );

          setModal({
            phase: "success",
            action,
            result: payload.result,
          });

          setStopLossInput("");
          setTakeProfitInput("");
        }
        else {
          const response = await fetch(
            "/api/trading/futures/live/close",
            {
              method: "POST",
              credentials:
                "same-origin",
              headers: {
                "Content-Type":
                  "application/json",
              },
              body: JSON.stringify({
                positionId:
                  action.position.id,
                clientOrderId:
                  clientOrderId(
                    "live-close",
                  ),
              }),
            },
          );

          const payload =
            (await response.json()) as ExecutionApiResponse;

          if (
            response.status === 503 &&
            payload.error?.code ===
              "OKX_CLOSE_STATUS_UNKNOWN"
          ) {
            setModal({
              phase: "ambiguous",
              action,
              message:
                payload.error
                  .message ??
                "We could not confirm this close request's status.",
            });
            refreshAccount();
            return;
          }

          if (
            !response.ok ||
            !payload.ok ||
            !payload.result
          ) {
            throw new Error(
              payload.error
                ?.message ??
                "The live close was not executed.",
            );
          }

          setAccount(
            payload.result.account,
          );

          setModal({
            phase: "success",
            action,
            result: payload.result,
          });
        }
      }
      catch (error) {
        setModal({
          phase: "error",
          action,
          message:
            error instanceof Error
              ? error.message
              : "The live request failed.",
        });
      }
    }, [
      modal,
      symbol,
      marginInput,
      leverage,
      stopLossInput,
      takeProfitInput,
      refreshAccount,
    ]);

  const modalPortal =
    modal &&
    typeof document !== "undefined"
      ? createPortal(
          <div
            className={
              styles.modalBackdrop
            }
            onMouseDown={(event) => {
              if (
                event.target ===
                  event.currentTarget &&
                modal.phase !==
                  "pending"
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
              aria-labelledby="live-futures-modal-title"
            >
              <header
                className={
                  styles.modalHeader
                }
              >
                <div>
                  <span>
                    ZAINEX LIVE FUTURES
                  </span>

                  <h2 id="live-futures-modal-title">
                    {modal.phase ===
                    "confirm"
                      ? modal.action
                          .kind ===
                        "OPEN"
                        ? `Confirm live ${modal.action.direction}`
                        : "Close live position"
                      : modal.phase ===
                          "pending"
                        ? "Sending to OKX"
                        : modal.phase ===
                            "success"
                          ? "Order filled"
                          : modal.phase ===
                              "ambiguous"
                            ? "Status unknown"
                            : "Order failed"}
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
                  aria-label="Close live futures modal"
                >
                  X
                </button>
              </header>

              <div
                className={
                  liveStyles.liveLabel
                }
              >
                <i />
                LIVE — REAL MONEY ON
                OKX
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
                          ? symbol
                          : modal
                              .action
                              .position
                              .symbol}
                      </strong>

                      <span>
                        USDT-M
                        perpetual
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
                            Est. quantity
                          </span>
                          <strong>
                            {referencePrice
                              ? `~${formatNumber(estimatedQuantity, 8)}`
                              : "--"}
                          </strong>
                        </div>

                        <div>
                          <span>
                            Stop loss
                          </span>
                          <strong>
                            {stopLossInput}{" "}
                            USDT
                          </strong>
                        </div>

                        <div>
                          <span>
                            Take profit
                          </span>
                          <strong>
                            {takeProfitInput}{" "}
                            USDT
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
                            Unrealized PnL
                          </span>
                          <strong
                            className={pnlClass(
                              modal
                                .action
                                .position
                                .unrealizedPnl,
                            )}
                          >
                            {formatSignedUsdt(
                              modal
                                .action
                                .position
                                .unrealizedPnl,
                            )}
                          </strong>
                        </div>

                        <div>
                          <span>
                            Entry price
                          </span>
                          <strong>
                            {formatUsdt(
                              modal
                                .action
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
                              modal
                                .action
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
                    This places a real
                    order on your own
                    OKX account. ZAINEX
                    cannot undo it once
                    sent.
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
                    Sending to OKX
                  </strong>

                  <span>
                    Do not close this
                    window.
                  </span>
                </div>
              ) : null}

              {modal.phase ===
              "success" ? (
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
                      x @{" "}
                      {formatUsdt(
                        modal.result
                          .order
                          .executedPrice,
                        2,
                      )}
                    </span>
                  </div>
                </div>
              ) : null}

              {modal.phase ===
              "ambiguous" ? (
                <div
                  className={
                    liveStyles.ambiguous
                  }
                >
                  <i />

                  <div>
                    <strong>
                      Do not retry
                    </strong>

                    <span>
                      {modal.message}{" "}
                      This resolves
                      automatically
                      within a couple
                      of minutes —
                      check your
                      positions before
                      trying again.
                    </span>
                  </div>
                </div>
              ) : null}

              {modal.phase ===
              "error" ? (
                <div
                  className={
                    styles.error
                  }
                >
                  <i />

                  <div>
                    <strong>
                      NOT EXECUTED
                    </strong>

                    <span>
                      {modal.message}
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
                  "error" ||
                modal.phase ===
                  "ambiguous" ? (
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

  if (connectionLoading) {
    return (
      <div
        className={
          variant === "desktop"
            ? styles.root
            : styles.root
        }
      >
        <section
          className={styles.panel}
        >
          Checking your OKX
          connection...
        </section>
      </div>
    );
  }

  if (
    !connection ||
    connection.status !== "ACTIVE"
  ) {
    return (
      <div className={styles.root}>
        <div
          className={
            liveStyles.liveLabel
          }
        >
          <i />
          LIVE — REAL MONEY ON OKX
        </div>

        <section
          className={styles.panel}
        >
          <div
            className={
              liveStyles.connectPanel
            }
          >
            <p>
              Connect your own OKX
              account with a
              trade-only API key
              (withdrawal permission
              OFF). ZAINEX never
              holds your funds — it
              only places orders on
              your behalf, on your
              own account.
            </p>

            {connection?.status ===
              "INVALID" &&
            connection.lastErrorMessage ? (
              <div
                className={
                  styles.warning
                }
              >
                {
                  connection.lastErrorMessage
                }
              </div>
            ) : null}

            {connectError ? (
              <div
                className={
                  styles.warning
                }
              >
                {connectError}
              </div>
            ) : null}

            <form
              className={
                liveStyles.connectForm
              }
              onSubmit={(event) => {
                void handleConnect(
                  event,
                );
              }}
            >
              <label>
                <span>
                  OKX API key
                </span>
                <input
                  type="text"
                  autoComplete="off"
                  required
                  value={apiKeyInput}
                  onChange={(
                    event,
                  ) => {
                    setApiKeyInput(
                      event.target
                        .value,
                    );
                  }}
                />
              </label>

              <label>
                <span>
                  OKX API secret
                </span>
                <input
                  type="password"
                  autoComplete="off"
                  required
                  value={
                    apiSecretInput
                  }
                  onChange={(
                    event,
                  ) => {
                    setApiSecretInput(
                      event.target
                        .value,
                    );
                  }}
                />
              </label>

              <label>
                <span>
                  OKX passphrase
                </span>
                <input
                  type="password"
                  autoComplete="off"
                  required
                  value={
                    passphraseInput
                  }
                  onChange={(
                    event,
                  ) => {
                    setPassphraseInput(
                      event.target
                        .value,
                    );
                  }}
                />
              </label>

              <label
                className={
                  liveStyles.connectCheckbox
                }
              >
                <input
                  type="checkbox"
                  checked={
                    isDemoInput
                  }
                  onChange={(
                    event,
                  ) => {
                    setIsDemoInput(
                      event.target
                        .checked,
                    );
                  }}
                />
                <span>
                  This is an OKX
                  demo-trading key
                  (not mainnet)
                </span>
              </label>

              <button
                type="submit"
                className={
                  styles.primary
                }
                disabled={
                  connecting ||
                  apiKeyInput.trim() ===
                    "" ||
                  apiSecretInput.trim() ===
                    "" ||
                  passphraseInput.trim() ===
                    ""
                }
              >
                {connecting
                  ? "Connecting..."
                  : "Connect OKX account"}
              </button>
            </form>
          </div>
        </section>

        {modalPortal}
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <div
        className={
          liveStyles.liveLabel
        }
      >
        <i />
        LIVE — REAL MONEY ON OKX
      </div>

      <div
        className={
          liveStyles.connectStatusRow
        }
      >
        <div>
          <span>
            Connected as{" "}
            {connection.maskedApiKey}
          </span>
          <br />
          <strong>
            <span
              className={`${liveStyles.statusPill} ${liveStyles.statusActive}`}
            >
              {connection.isDemo
                ? "DEMO"
                : "MAINNET"}{" "}
              ACTIVE
            </span>
          </strong>
        </div>

        <button
          type="button"
          className={
            liveStyles.disconnectButton
          }
          disabled={disconnecting}
          onClick={() => {
            void handleDisconnect();
          }}
        >
          {disconnecting
            ? "Disconnecting..."
            : "Disconnect"}
        </button>
      </div>

      <section
        className={styles.panel}
      >
        <div
          className={
            styles.accountGrid
          }
        >
          <div>
            <span>Available</span>
            <strong>
              {account
                ? formatUsdt(
                    account.availableBalance,
                    2,
                  )
                : "--"}
            </strong>
          </div>

          <div>
            <span>Equity</span>
            <strong>
              {account
                ? formatUsdt(
                    account.totalEquity,
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
                    account.usedMargin,
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
                account?.realizedPnl ??
                  0,
              )}
            >
              {account
                ? formatSignedUsdt(
                    account.realizedPnl,
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

        {!position ? (
          <>
            <label>
              <span
                style={{
                  display: "block",
                  fontSize: "12px",
                  color:
                    "rgba(226, 232, 255, 0.72)",
                  marginBottom:
                    "6px",
                }}
              >
                Symbol
              </span>

              <select
                className={
                  liveStyles.symbolSelect
                }
                value={symbol}
                onChange={(
                  event,
                ) => {
                  setSymbol(
                    event.target
                      .value as LiveSymbol,
                  );
                }}
              >
                {SYMBOLS.map(
                  (item) => (
                    <option
                      key={item}
                      value={item}
                    >
                      {item}
                    </option>
                  ),
                )}
              </select>
            </label>

            {referencePrice ? (
              <p
                className={
                  styles.modalNote
                }
              >
                Reference price:{" "}
                {formatUsdt(
                  referencePrice,
                  2,
                )}{" "}
                (last hourly close —
                your real fill price
                comes from OKX)
              </p>
            ) : null}

            <FuturesAiSignalPanel
              symbol={symbol}
              symbolLabel={
                CRYPTO_SYMBOL_LABELS[
                  symbol
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
                        event.target
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
                  {LEVERAGE_PRESETS.map(
                    (value) => (
                      <button
                        key={value}
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
                        {value}x
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
                  Est. quantity
                </span>
                <strong>
                  {referencePrice
                    ? `~${formatNumber(estimatedQuantity, 8)}`
                    : "--"}
                </strong>
              </div>
            </div>

            <div
              className={
                styles.inputGrid
              }
            >
              <label>
                <span>
                  STOP LOSS
                  (required, price)
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
                    }}
                  />
                  <b>USDT</b>
                </div>
              </label>

              <label>
                <span>
                  TAKE PROFIT
                  (required, price)
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
                    }}
                  />
                  <b>USDT</b>
                </div>
              </label>
            </div>

            {!validMargin ? (
              <div
                className={
                  styles.warning
                }
              >
                Margin must be 1 to
                5,000 USDT.
              </div>
            ) : !enoughBalance ? (
              <div
                className={
                  styles.warning
                }
              >
                Insufficient available
                balance on your OKX
                account.
              </div>
            ) : !validStopLoss ||
              !validTakeProfit ? (
              <div
                className={
                  styles.warning
                }
              >
                Enter a stop loss and
                take profit price.
              </div>
            ) : null}

            <button
              type="button"
              className={`${styles.futuresButton} ${styles.shortButton}`}
              disabled={!canOpen}
              onClick={() => {
                openConfirmation(
                  "SHORT",
                );
              }}
            >
              <span>SHORT</span>
              <strong>
                {symbol}
              </strong>
              <small>
                Open short |{" "}
                {leverage}x
              </small>
            </button>

            <button
              type="button"
              className={`${styles.futuresButton} ${styles.longButton}`}
              disabled={!canOpen}
              onClick={() => {
                openConfirmation(
                  "LONG",
                );
              }}
            >
              <span>LONG</span>
              <strong>
                {symbol}
              </strong>
              <small>
                Open long |{" "}
                {leverage}x
              </small>
            </button>
          </>
        ) : (
          <article
            className={
              styles.positionCard
            }
          >
            <header>
              <div>
                <span>
                  LIVE OPEN POSITION
                </span>
                <strong>
                  {position.direction}{" "}
                  {position.symbol}
                  {" |"}{" "}
                  {position.leverage}x
                </strong>
              </div>

              <b
                className={pnlClass(
                  position.unrealizedPnl,
                )}
              >
                {formatSignedUsdt(
                  position.unrealizedPnl,
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
                    position.entryPrice,
                    2,
                  )}
                </strong>
              </span>

              <span>
                Mark
                <strong>
                  {formatUsdt(
                    position.markPrice,
                    2,
                  )}
                </strong>
              </span>

              <span>
                Liquidation
                <strong>
                  {formatUsdt(
                    position.liquidationPrice,
                    2,
                  )}
                </strong>
              </span>

              <span>
                Stop loss
                <strong>
                  {position.stopLoss >
                  0
                    ? formatUsdt(
                        position.stopLoss,
                        2,
                      )
                    : "NOT SET"}
                </strong>
              </span>

              <span>
                Take profit
                <strong>
                  {position.takeProfit >
                  0
                    ? formatUsdt(
                        position.takeProfit,
                        2,
                      )
                    : "NOT SET"}
                </strong>
              </span>

              <span>
                Margin
                <strong>
                  {formatUsdt(
                    position.margin,
                    2,
                  )}
                </strong>
              </span>

              <span>
                Notional
                <strong>
                  {formatUsdt(
                    position.notional,
                    2,
                  )}
                </strong>
              </span>

              <span>
                ROE
                <strong
                  className={pnlClass(
                    position.roePercent,
                  )}
                >
                  {position.roePercent >
                  0
                    ? "+"
                    : ""}
                  {formatNumber(
                    position.roePercent,
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
              CLOSE LIVE POSITION
            </button>
          </article>
        )}

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
                LIVE OKX FEED
              </span>
              <strong>
                LIVE EXECUTION LOGS
              </strong>
            </div>

            <b>
              {account
                ? `Latest ${Math.min(account.trades.length, 10)} of ${account.trades.length}`
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
              <span>Pair</span>
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
                  Loading live
                  executions...
                </div>
              ) : account.trades
                  .length > 0 ? (
                account.trades
                  .slice(0, 10)
                  .map((trade) => (
                    <div
                      className={
                        styles.executionLogRow
                      }
                      key={trade.id}
                    >
                      <span>
                        {new Date(
                          trade.executedAt,
                        ).toLocaleString()}
                      </span>

                      <span>
                        {trade.symbol}
                      </span>

                      <strong>
                        {trade.action}
                      </strong>

                      <span>
                        {
                          trade.direction
                        }
                      </span>

                      <span>
                        {
                          trade.leverage
                        }
                        x
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
                        {trade.action !==
                        "OPEN"
                          ? formatSignedUsdt(
                              trade.realizedPnl,
                            )
                          : "OPEN"}
                      </b>
                    </div>
                  ))
              ) : (
                <div
                  className={
                    styles.executionLogEmpty
                  }
                >
                  No live executions
                  yet.
                </div>
              )}
            </div>
          </div>
        </section>
      </section>

      {modalPortal}
    </div>
  );
}
