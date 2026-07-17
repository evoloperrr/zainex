"use client";

/* ZAINEX_WALLET_ACTION_CENTER_V1 */

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  createPortal,
} from "react-dom";

import {
  CreditTransferPanel,
} from "@/components/credit-transfer-panel";

import {
  WalletToCreditsConverter,
} from "@/components/wallet-to-credits-converter";

import styles from "./wallet-action-center.module.css";

type WalletAction =
  | "convert"
  | "transfer"
  | null;

type ConversionLog = {
  id: number;
  amountUsd: number;
  creditsAdded: number;
  creditsBefore: number;
  creditsAfter: number;
  occurredAt: string;
};

type ConversionResponse = {
  ok: boolean;
  logs?: ConversionLog[];
};

type TransferLog = {
  id: number;
  direction: "SENT" | "RECEIVED";
  amount: number;
  counterparty: {
    name: string;
    email: string;
  };
  creditsBefore: number;
  creditsAfter: number;
  occurredAt: string;
};

type TransferResponse = {
  ok: boolean;
  logs?: TransferLog[];
};

type ActivityKind =
  | "CONVERTED"
  | "SENT"
  | "RECEIVED";

type ActivityRow = {
  key: string;
  kind: ActivityKind;
  title: string;
  detail: string;
  change: string;
  balance: string;
  occurredAt: string;
};

type WalletActionCenterProps = {
  walletBalance: number;
  availableBalance: number;
  credits: number;
};

function formatUsd(
  value: number,
): string {
  return new Intl.NumberFormat(
    "en-US",
    {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    },
  ).format(
    Number.isFinite(value)
      ? value
      : 0,
  );
}

function formatCredits(
  value: number,
): string {
  return Math.max(
    0,
    Math.trunc(value),
  ).toLocaleString("en-US");
}

function dateValue(
  value: string,
): number {
  const parsed = new Date(value);

  return Number.isNaN(
    parsed.getTime(),
  )
    ? 0
    : parsed.getTime();
}

function formatDate(
  value: string,
): string {
  const parsed = new Date(value);

  if (
    Number.isNaN(
      parsed.getTime(),
    )
  ) {
    return value;
  }

  return parsed.toLocaleString(
    "en-US",
    {
      month: "short",
      day: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    },
  );
}

function combineLogs(
  conversions: ConversionLog[],
  transfers: TransferLog[],
): ActivityRow[] {
  const conversionRows =
    conversions.map(
      (log): ActivityRow => ({
        key: `conversion-${log.id}`,
        kind: "CONVERTED",
        title:
          `${formatUsd(
            log.amountUsd,
          )} converted`,
        detail:
          `${formatCredits(
            log.creditsAdded,
          )} AI credits added`,
        change:
          `+${formatCredits(
            log.creditsAdded,
          )} credits`,
        balance:
          `${formatCredits(
            log.creditsBefore,
          )} → ${formatCredits(
            log.creditsAfter,
          )}`,
        occurredAt:
          log.occurredAt,
      }),
    );

  const transferRows =
    transfers.map(
      (log): ActivityRow => {
        const counterparty =
          log.counterparty.name ||
          log.counterparty.email ||
          "ZAINEX user";

        return {
          key:
            `transfer-${log.id}-${log.direction}`,
          kind: log.direction,
          title:
            `${formatCredits(
              log.amount,
            )} credits`,
          detail:
            `${log.direction === "SENT"
              ? "To"
              : "From"} ${counterparty}`,
          change:
            `${log.direction === "SENT"
              ? "-"
              : "+"}${formatCredits(
              log.amount,
            )} credits`,
          balance:
            `${formatCredits(
              log.creditsBefore,
            )} → ${formatCredits(
              log.creditsAfter,
            )}`,
          occurredAt:
            log.occurredAt,
        };
      },
    );

  return [
    ...conversionRows,
    ...transferRows,
  ]
    .sort(
      (left, right) =>
        dateValue(
          right.occurredAt,
        ) -
        dateValue(
          left.occurredAt,
        ),
    )
    .slice(0, 10);
}

export function WalletActionCenter({
  walletBalance,
  availableBalance,
  credits,
}: WalletActionCenterProps) {
  const [
    openAction,
    setOpenAction,
  ] = useState<WalletAction>(null);

  const [
    conversionLogs,
    setConversionLogs,
  ] = useState<ConversionLog[]>([]);

  const [
    transferLogs,
    setTransferLogs,
  ] = useState<TransferLog[]>([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    error,
    setError,
  ] = useState("");

  async function loadLogs() {
    try {
      const [
        conversionResponse,
        transferResponse,
      ] = await Promise.all([
        fetch(
          "/api/trading/futures/wallet/convert",
          {
            cache: "no-store",
            credentials:
              "same-origin",
          },
        ),
        fetch(
          "/api/trading/futures/wallet/transfers",
          {
            cache: "no-store",
            credentials:
              "same-origin",
          },
        ),
      ]);

      const [
        conversionPayload,
        transferPayload,
      ] = await Promise.all([
        conversionResponse.json() as
          Promise<ConversionResponse>,
        transferResponse.json() as
          Promise<TransferResponse>,
      ]);

      if (
        conversionResponse.ok &&
        conversionPayload.ok
      ) {
        setConversionLogs(
          conversionPayload.logs ?? [],
        );
      }

      if (
        transferResponse.ok &&
        transferPayload.ok
      ) {
        setTransferLogs(
          transferPayload.logs ?? [],
        );
      }

      if (
        !conversionResponse.ok &&
        !transferResponse.ok
      ) {
        throw new Error(
          "Wallet activity is unavailable.",
        );
      }

      setError("");
    }
    catch {
      setError(
        "Unable to load wallet activity.",
      );
    }
    finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let disposed = false;

    async function refresh() {
      if (!disposed) {
        await loadLogs();
      }
    }

    void refresh();

    const timer =
      window.setInterval(
        () => {
          void refresh();
        },
        15_000,
      );

    function handleRefresh() {
      void refresh();

      window.dispatchEvent(
        new Event(
          "zainex:wallet-data-changed",
        ),
      );
    }

    window.addEventListener(
      "focus",
      handleRefresh,
    );

    window.addEventListener(
      "zainex:wallet-converted",
      handleRefresh,
    );

    window.addEventListener(
      "zainex:credits-transferred",
      handleRefresh,
    );

    return () => {
      disposed = true;

      window.clearInterval(timer);

      window.removeEventListener(
        "focus",
        handleRefresh,
      );

      window.removeEventListener(
        "zainex:wallet-converted",
        handleRefresh,
      );

      window.removeEventListener(
        "zainex:credits-transferred",
        handleRefresh,
      );
    };
  }, []);

  useEffect(() => {
    function handleOpen(
      event: Event,
    ) {
      const action =
        (
          event as CustomEvent<string>
        ).detail;

      if (
        action === "convert" ||
        action === "transfer"
      ) {
        setOpenAction(action);
      }
    }

    window.addEventListener(
      "zainex:open-wallet-action",
      handleOpen as EventListener,
    );

    return () => {
      window.removeEventListener(
        "zainex:open-wallet-action",
        handleOpen as EventListener,
      );
    };
  }, []);

  useEffect(() => {
    if (!openAction) {
      return;
    }

    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow =
      "hidden";

    function handleEscape(
      event: KeyboardEvent,
    ) {
      if (event.key === "Escape") {
        setOpenAction(null);
      }
    }

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
  }, [openAction]);

  const activity = useMemo(
    () =>
      combineLogs(
        conversionLogs,
        transferLogs,
      ),
    [
      conversionLogs,
      transferLogs,
    ],
  );

  const modal =
    openAction &&
    typeof document !== "undefined"
      ? createPortal(
          <div
            className={
              styles.modalBackdrop
            }
            onMouseDown={(event) => {
              if (
                event.target ===
                event.currentTarget
              ) {
                setOpenAction(null);
              }
            }}
          >
            <section
              className={styles.modal}
              role="dialog"
              aria-modal="true"
              aria-label={
                openAction === "convert"
                  ? "Convert wallet funds to AI credits"
                  : "Transfer AI credits by email"
              }
            >
              <button
                type="button"
                className={
                  styles.closeButton
                }
                aria-label="Close"
                onClick={() => {
                  setOpenAction(null);
                }}
              >
                ×
              </button>

              {openAction ===
              "convert" ? (
                <WalletToCreditsConverter
                  availableBalance={
                    availableBalance
                  }
                  credits={credits}
                />
              ) : (
                <CreditTransferPanel
                  credits={credits}
                />
              )}
            </section>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <section className={styles.activity}>
        <header
          className={
            styles.activityHeader
          }
        >
          <div>
            <span>
              WALLET ACTIVITY
            </span>

            <h2>
              Conversion and transfer logs
            </h2>
          </div>

          <small>
            Latest 10 overall
          </small>
        </header>

        <div
          className={
            styles.balanceSummary
          }
        >
          <div>
            <span>Wallet</span>
            <strong>
              {formatUsd(
                walletBalance,
              )}
            </strong>
          </div>

          <div>
            <span>
              Available
            </span>
            <strong>
              {formatUsd(
                availableBalance,
              )}
            </strong>
          </div>

          <div>
            <span>
              AI credits
            </span>
            <strong>
              {formatCredits(
                credits,
              )}
            </strong>
          </div>
        </div>

        {loading ? (
          <p className={styles.empty}>
            Loading wallet activity...
          </p>
        ) : null}

        {!loading && error ? (
          <p
            className={styles.error}
            role="alert"
          >
            {error}
          </p>
        ) : null}

        {!loading &&
        !error &&
        activity.length === 0 ? (
          <p className={styles.empty}>
            No conversion or transfer
            activity yet.
          </p>
        ) : null}

        {!loading &&
        !error &&
        activity.length > 0 ? (
          <div
            className={
              styles.tableWrap
            }
          >
            <table>
              <thead>
                <tr>
                  <th>TYPE</th>
                  <th>DETAILS</th>
                  <th>CHANGE</th>
                  <th>CREDIT BALANCE</th>
                  <th>DATE</th>
                </tr>
              </thead>

              <tbody>
                {activity.map((row) => (
                  <tr key={row.key}>
                    <td>
                      <span
                        className={
                          row.kind ===
                          "CONVERTED"
                            ? styles.converted
                            : row.kind ===
                                "SENT"
                              ? styles.sent
                              : styles.received
                        }
                      >
                        {row.kind}
                      </span>
                    </td>

                    <td>
                      <strong>
                        {row.title}
                      </strong>

                      <small>
                        {row.detail}
                      </small>
                    </td>

                    <td>
                      <strong
                        className={
                          row.kind ===
                          "SENT"
                            ? styles.debit
                            : styles.credit
                        }
                      >
                        {row.change}
                      </strong>
                    </td>

                    <td>
                      {row.balance}
                    </td>

                    <td>
                      {formatDate(
                        row.occurredAt,
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      {modal}
    </>
  );
}
