"use client";

/* ZAINEX_CASHOUT_REQUEST_V1 */

import type {
  FormEvent,
} from "react";

import {
  useEffect,
  useState,
} from "react";

import {
  useCurrency,
} from "@/components/currency-provider";

import styles from "./cashout-request-panel.module.css";

type CashoutLog = {
  id: number;
  amount: number;
  destinationNote: string | null;
  status: string;
  adminNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
};

type CashoutResponse = {
  ok: boolean;
  idempotentReplay?: boolean;
  request?: CashoutLog;
  availableBalance?: number;
  logs?: CashoutLog[];
  error?: {
    code?: string;
    message?: string;
  };
};

type CashoutRequestPanelProps = {
  availableBalance: number;
};

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

function statusBadgeClass(
  status: string,
  styleSheet: Record<
    string,
    string
  >,
): string {
  if (status === "approved") {
    return styleSheet.approvedBadge;
  }

  if (status === "rejected") {
    return styleSheet.rejectedBadge;
  }

  return styleSheet.pendingBadge;
}

export function CashoutRequestPanel({
  availableBalance,
}: CashoutRequestPanelProps) {
  const {
    formatUsd,
    toUsd,
    convertUsd,
    currencySymbol,
    currency,
  } = useCurrency();

  const [amount, setAmount] =
    useState("");

  const [
    destinationNote,
    setDestinationNote,
  ] = useState("");

  const [
    availableOverride,
    setAvailableOverride,
  ] = useState<number | null>(
    null,
  );

  const liveAvailable =
    availableOverride ??
    availableBalance;

  const [logs, setLogs] =
    useState<CashoutLog[]>([]);

  const [loadingLogs, setLoadingLogs] =
    useState(true);

  const [submitting, setSubmitting] =
    useState(false);

  const [message, setMessage] =
    useState("");

  const [error, setError] =
    useState("");

  useEffect(() => {
    let disposed = false;

    async function loadCashouts() {
      try {
        const response = await fetch(
          "/api/trading/futures/wallet/cashout",
          {
            cache: "no-store",
            credentials:
              "same-origin",
          },
        );

        const payload =
          (await response.json()) as CashoutResponse;

        if (
          disposed ||
          !response.ok ||
          !payload.ok
        ) {
          return;
        }

        setLogs(payload.logs ?? []);
      } catch {
        if (!disposed) {
          setError(
            "Unable to load cashout logs.",
          );
        }
      } finally {
        if (!disposed) {
          setLoadingLogs(false);
        }
      }
    }

    const handleRefresh = () => {
      void loadCashouts();
    };

    void loadCashouts();

    const timer = window.setInterval(
      () => {
        void loadCashouts();
      },
      15_000,
    );

    window.addEventListener(
      "focus",
      handleRefresh,
    );

    window.addEventListener(
      "zainex:wallet-data-changed",
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
        "zainex:wallet-data-changed",
        handleRefresh,
      );
    };
  }, []);

  const numericAmount = toUsd(
    Number(amount),
  );

  const amountIsValid =
    Number.isFinite(numericAmount) &&
    numericAmount >= 1 &&
    numericAmount <= liveAvailable;

  const formIsValid = amountIsValid;

  const availableAfter =
    amountIsValid
      ? liveAvailable - numericAmount
      : liveAvailable;

  async function submitCashout(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (
      submitting ||
      !formIsValid
    ) {
      return;
    }

    setSubmitting(true);
    setMessage("");
    setError("");

    try {
      const response = await fetch(
        "/api/trading/futures/wallet/cashout",
        {
          method: "POST",
          credentials:
            "same-origin",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            amount:
              numericAmount.toFixed(2),
            destinationNote:
              destinationNote.trim() ||
              undefined,
            clientRequestId:
              crypto.randomUUID(),
          }),
        },
      );

      const payload =
        (await response.json()) as CashoutResponse;

      if (
        !response.ok ||
        !payload.ok
      ) {
        throw new Error(
          payload.error?.message ??
            "Cashout request failed.",
        );
      }

      if (
        typeof payload.availableBalance ===
        "number"
      ) {
        setAvailableOverride(
          payload.availableBalance,
        );
      }

      if (payload.request) {
        setLogs((current) => [
          payload.request as CashoutLog,
          ...current,
        ].slice(0, 10));
      }

      setAmount("");
      setDestinationNote("");

      setMessage(
        `Cashout request for ${formatUsd(
          numericAmount,
        )} submitted — pending admin review.`,
      );

      window.dispatchEvent(
        new Event(
          "zainex:wallet-data-changed",
        ),
      );
    } catch (cashoutError) {
      setError(
        cashoutError instanceof Error
          ? cashoutError.message
          : "Cashout request failed.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className={styles.section}>
      <div className={styles.heading}>
        <div>
          <span>
            WALLET CASHOUT
          </span>

          <h2>
            Request a
            <em> withdrawal.</em>
          </h2>

          <p>
            Submit a cashout request from
            your available wallet balance.
            The requested amount is held
            aside immediately; our team
            sends the funds manually and
            approves the request once
            confirmed — usually within a
            few hours.
          </p>
        </div>
      </div>

      <form
        className={styles.form}
        onSubmit={submitCashout}
      >
        <label htmlFor="cashout-amount">
          Amount to cash out
        </label>

        <div className={styles.amountInput}>
          <span>{currencySymbol}</span>

          <input
            id="cashout-amount"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            value={amount}
            onChange={(event) => {
              setAmount(
                event.target.value.replace(
                  /[^0-9.]/g,
                  "",
                ),
              );

              setMessage("");
              setError("");
            }}
          />
        </div>

        <div className={styles.quickAmounts}>
          <button
            type="button"
            disabled={
              liveAvailable < 1
            }
            onClick={() => {
              setAmount(
                liveAvailable > 0
                  ? convertUsd(
                      liveAvailable,
                    ).toFixed(2)
                  : "",
              );

              setMessage("");
              setError("");
            }}
          >
            MAX
          </button>
        </div>

        <label htmlFor="cashout-destination">
          Where should we send it?{" "}
          <small>(optional for now)</small>
        </label>

        <textarea
          id="cashout-destination"
          className={
            styles.destinationInput
          }
          placeholder={
            currency === "PHP"
              ? "e.g. GCash 0917xxxxxxx, or a bank account — payment options will be finalized soon."
              : "e.g. your bank account details — payment options will be finalized soon."
          }
          value={destinationNote}
          maxLength={500}
          onChange={(event) => {
            setDestinationNote(
              event.target.value,
            );

            setMessage("");
            setError("");
          }}
        />

        <div className={styles.preview}>
          <div>
            <span>
              Available balance
            </span>

            <strong>
              {formatUsd(
                liveAvailable,
              )}
            </strong>
          </div>

          <div>
            <span>
              Available after
            </span>

            <strong>
              {formatUsd(
                Math.max(
                  0,
                  availableAfter,
                ),
              )}
            </strong>
          </div>
        </div>

        {amount !== "" &&
        !amountIsValid ? (
          <p className={styles.validation}>
            Enter an amount from $1 up to{" "}
            {formatUsd(liveAvailable)}.
          </p>
        ) : null}

        {message ? (
          <p
            className={styles.success}
            role="status"
          >
            {message}
          </p>
        ) : null}

        {error ? (
          <p
            className={styles.error}
            role="alert"
          >
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          className={styles.submit}
          disabled={
            !formIsValid ||
            submitting
          }
        >
          {submitting
            ? "Submitting..."
            : formIsValid
              ? `Request ${formatUsd(
                  numericAmount,
                )} cashout`
              : "Enter an amount"}
        </button>

        <p className={styles.note}>
          Payment options are still being
          finalized — for now, just tell us
          where to send it and our team will
          follow up.
        </p>
      </form>

      <section className={styles.logs}>
        <header>
          <div>
            <span>
              CASHOUT REQUEST LOG
            </span>

            <h3>
              Latest withdrawal requests
            </h3>
          </div>

          <small>
            Latest 10 records
          </small>
        </header>

        {loadingLogs ? (
          <p className={styles.empty}>
            Loading cashout logs...
          </p>
        ) : null}

        {!loadingLogs &&
        logs.length === 0 ? (
          <p className={styles.empty}>
            No cashout requests yet.
          </p>
        ) : null}

        {!loadingLogs &&
        logs.length > 0 ? (
          <div className={styles.logList}>
            {logs.map((log) => (
              <article key={log.id}>
                <div
                  className={statusBadgeClass(
                    log.status,
                    styles,
                  )}
                >
                  {log.status.toUpperCase()}
                </div>

                <div className={styles.logMain}>
                  <strong>
                    {formatUsd(
                      log.amount,
                    )}
                  </strong>

                  <span>
                    {log.destinationNote ||
                      "No destination note"}
                  </span>

                  {log.adminNote ? (
                    <small>
                      Admin: {log.adminNote}
                    </small>
                  ) : null}
                </div>

                <time>
                  {formatDate(
                    log.createdAt,
                  )}
                </time>
              </article>
            ))}
          </div>
        ) : null}
      </section>
    </section>
  );
}
