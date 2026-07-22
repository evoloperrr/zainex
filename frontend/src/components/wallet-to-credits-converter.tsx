"use client";

/* ZAINEX_WALLET_TO_CREDITS_UI_V1 */

import type {
  FormEvent,
} from "react";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useCurrency,
} from "@/components/currency-provider";

import styles from "./wallet-to-credits-converter.module.css";

type ConversionState = {
  walletBalance: number;
  availableBalance: number;
  futuresLockedBalance: number;
  strategyLockedBalance: number;
  credits: number;
};

type ConversionLog = {
  id: number;
  eventType: string;
  amountUsd: number;
  creditsAdded: number;
  walletBalanceBefore: number;
  walletBalanceAfter: number;
  availableBalanceBefore: number;
  availableBalanceAfter: number;
  creditsBefore: number;
  creditsAfter: number;
  referenceKey: string;
  occurredAt: string;
};

type ConversionResponse = {
  ok: boolean;
  idempotentReplay?: boolean;
  state?: ConversionState;
  conversion?: ConversionLog;
  logs?: ConversionLog[];
  error?: {
    code?: string;
    message?: string;
  };
};

type WalletToCreditsConverterProps = {
  availableBalance: number;
  credits: number;
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

export function WalletToCreditsConverter({
  availableBalance,
  credits,
}: WalletToCreditsConverterProps) {
  const {
    formatUsd,
    formatCredits,
  } = useCurrency();

  const [amount, setAmount] =
    useState("");

  const [
    liveAvailable,
    setLiveAvailable,
  ] = useState(availableBalance);

  const [
    liveCredits,
    setLiveCredits,
  ] = useState(credits);

  const [logs, setLogs] =
    useState<ConversionLog[]>([]);

  const [loadingLogs, setLoadingLogs] =
    useState(true);

  const [submitting, setSubmitting] =
    useState(false);

  const [message, setMessage] =
    useState("");

  const [error, setError] =
    useState("");

  useEffect(() => {
    setLiveAvailable(
      availableBalance,
    );
  }, [availableBalance]);

  useEffect(() => {
    setLiveCredits(credits);
  }, [credits]);

  useEffect(() => {
    let disposed = false;

    async function loadConversions() {
      try {
        const response = await fetch(
          "/api/trading/futures/wallet/convert",
          {
            cache: "no-store",
            credentials:
              "same-origin",
          },
        );

        const payload =
          (await response.json()) as
            ConversionResponse;

        if (
          disposed ||
          !response.ok ||
          !payload.ok
        ) {
          return;
        }

        if (payload.state) {
          setLiveAvailable(
            payload.state
              .availableBalance,
          );

          setLiveCredits(
            payload.state.credits,
          );
        }

        setLogs(payload.logs ?? []);
      }
      catch {
        if (!disposed) {
          setError(
            "Unable to load conversion logs.",
          );
        }
      }
      finally {
        if (!disposed) {
          setLoadingLogs(false);
        }
      }
    }

    const handleFocus = () => {
      void loadConversions();
    };

    void loadConversions();

    const timer = window.setInterval(
      () => {
        void loadConversions();
      },
      15_000,
    );

    window.addEventListener(
      "focus",
      handleFocus,
    );

    return () => {
      disposed = true;

      window.clearInterval(timer);

      window.removeEventListener(
        "focus",
        handleFocus,
      );
    };
  }, []);

  const parsedAmount =
    Number(amount);

  const maximumAmount =
    Math.max(
      0,
      Math.floor(liveAvailable),
    );

  const amountIsValid =
    Number.isInteger(parsedAmount) &&
    parsedAmount >= 1 &&
    parsedAmount <= maximumAmount;

  const availableAfter =
    amountIsValid
      ? liveAvailable -
        parsedAmount
      : liveAvailable;

  const creditsAfter =
    amountIsValid
      ? liveCredits +
        parsedAmount
      : liveCredits;

  const quickAmounts = useMemo(
    () => [
      10,
      25,
      50,
      100,
    ],
    [],
  );

  async function submitConversion(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (
      submitting ||
      !amountIsValid
    ) {
      return;
    }

    setSubmitting(true);
    setMessage("");
    setError("");

    try {
      const response = await fetch(
        "/api/trading/futures/wallet/convert",
        {
          method: "POST",
          credentials:
            "same-origin",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            amount: parsedAmount,
            clientRequestId:
              crypto.randomUUID(),
          }),
        },
      );

      const payload =
        (await response.json()) as
          ConversionResponse;

      if (
        !response.ok ||
        !payload.ok ||
        !payload.state
      ) {
        throw new Error(
          payload.error?.message ??
            "Wallet conversion failed.",
        );
      }

      setLiveAvailable(
        payload.state
          .availableBalance,
      );

      setLiveCredits(
        payload.state.credits,
      );

      setLogs(payload.logs ?? []);

      setAmount("");

      setMessage(
        `${formatUsd(
          parsedAmount,
        )} converted to ${formatCredits(
          parsedAmount,
        )} AI credits.`,
      );

      window.dispatchEvent(
        new Event(
          "zainex:wallet-converted",
        ),
      );
    }
    catch (conversionError) {
      setError(
        conversionError instanceof
          Error
          ? conversionError.message
          : "Wallet conversion failed.",
      );
    }
    finally {
      setSubmitting(false);
    }
  }

  return (
    <section className={styles.section}>
      <div className={styles.heading}>
        <div>
          <span>
            WALLET TO AI CREDITS
          </span>

          <h2>
            Convert wallet funds
            <em> 1:1.</em>
          </h2>

          <p>
            Every whole 1 USD from your
            available wallet becomes
            exactly 1 AI credit.
            Locked trading and strategy
            funds are never included.
          </p>
        </div>

        <strong className={styles.rate}>
          1 USD = 1 CREDIT
        </strong>
      </div>

      <div className={styles.converter}>
        <form
          className={styles.form}
          onSubmit={submitConversion}
        >
          <label htmlFor="wallet-credit-amount">
            Amount to convert
          </label>

          <div className={styles.inputRow}>
            <span>$</span>

            <input
              id="wallet-credit-amount"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="0"
              value={amount}
              onChange={(event) => {
                setAmount(
                  event.target.value
                    .replace(
                      /[^\d]/g,
                      "",
                    )
                    .replace(
                      /^0+(?=\d)/,
                      "",
                    ),
                );

                setMessage("");
                setError("");
              }}
            />

            <small>USD</small>
          </div>

          <div className={styles.quickAmounts}>
            {quickAmounts.map(
              (quickAmount) => (
                <button
                  key={quickAmount}
                  type="button"
                  disabled={
                    quickAmount >
                    maximumAmount
                  }
                  onClick={() => {
                    setAmount(
                      String(
                        quickAmount,
                      ),
                    );
                    setMessage("");
                    setError("");
                  }}
                >
                  ${quickAmount}
                </button>
              ),
            )}

            <button
              type="button"
              disabled={
                maximumAmount < 1
              }
              onClick={() => {
                setAmount(
                  maximumAmount > 0
                    ? String(
                        maximumAmount,
                      )
                    : "",
                );
                setMessage("");
                setError("");
              }}
            >
              MAX
            </button>
          </div>

          <div className={styles.preview}>
            <div>
              <span>
                Available wallet
              </span>

              <strong>
                {formatUsd(
                  liveAvailable,
                )}
              </strong>
            </div>

            <div>
              <span>
                AI credits
              </span>

              <strong>
                {formatCredits(
                  liveCredits,
                )}
              </strong>
            </div>

            <div>
              <span>
                Available after
              </span>

              <strong>
                {formatUsd(
                  availableAfter,
                )}
              </strong>
            </div>

            <div>
              <span>
                Credits after
              </span>

              <strong>
                {formatCredits(
                  creditsAfter,
                )}
              </strong>
            </div>
          </div>

          {amount !== "" &&
          !amountIsValid ? (
            <p
              className={
                styles.validation
              }
            >
              Enter a whole amount from
              $1 up to{" "}
              {formatUsd(
                maximumAmount,
              )}.
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
              !amountIsValid ||
              submitting
            }
          >
            {submitting
              ? "Converting..."
              : amountIsValid
                ? `Convert ${formatUsd(
                    parsedAmount,
                  )} to ${formatCredits(
                    parsedAmount,
                  )} credits`
                : "Enter conversion amount"}
          </button>
        </form>

        <aside className={styles.rules}>
          <span>CONVERSION RULES</span>

          <div>
            <strong>1:1 fixed rate</strong>
            <small>
              One whole USD equals one
              AI credit.
            </small>
          </div>

          <div>
            <strong>
              Available balance only
            </strong>
            <small>
              Open-position margin and
              strategy principal stay
              locked.
            </small>
          </div>

          <div>
            <strong>
              Permanent conversion
            </strong>
            <small>
              Converted AI credits are
              used for ZAINEX strategy
              subscriptions.
            </small>
          </div>
        </aside>
      </div>

      <section className={styles.logs}>
        <header>
          <div>
            <span>
              CONVERSION LEDGER
            </span>

            <h3>
              Latest wallet-to-credit logs
            </h3>
          </div>

          <small>
            Latest 10 records
          </small>
        </header>

        {loadingLogs ? (
          <p className={styles.empty}>
            Loading conversion logs...
          </p>
        ) : null}

        {!loadingLogs &&
        logs.length === 0 ? (
          <p className={styles.empty}>
            No wallet-to-credit
            conversions yet.
          </p>
        ) : null}

        {!loadingLogs &&
        logs.length > 0 ? (
          <div className={styles.logList}>
            {logs.map((log) => (
              <article key={log.id}>
                <div
                  className={
                    styles.logBadge
                  }
                >
                  WALLET TO CREDITS
                </div>

                <div
                  className={
                    styles.logMain
                  }
                >
                  <strong>
                    {formatUsd(
                      log.amountUsd,
                    )}{" "}
                    →{" "}
                    {formatCredits(
                      log.creditsAdded,
                    )}{" "}
                    credits
                  </strong>

                  <span>
                    Available{" "}
                    {formatUsd(
                      log.availableBalanceBefore,
                    )}{" "}
                    →{" "}
                    {formatUsd(
                      log.availableBalanceAfter,
                    )}
                  </span>
                </div>

                <div
                  className={
                    styles.logCredits
                  }
                >
                  <strong>
                    +
                    {formatCredits(
                      log.creditsAdded,
                    )}
                  </strong>

                  <span>
                    {formatCredits(
                      log.creditsBefore,
                    )}{" "}
                    →{" "}
                    {formatCredits(
                      log.creditsAfter,
                    )}
                  </span>
                </div>

                <time>
                  {formatDate(
                    log.occurredAt,
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