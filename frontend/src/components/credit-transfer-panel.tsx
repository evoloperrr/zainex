"use client";

/* ZAINEX_USER_CREDIT_TRANSFER_UI_V1 */

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

import styles from "./credit-transfer-panel.module.css";

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
  status: string;
  referenceKey: string;
  occurredAt: string;
};

type TransferResponse = {
  ok: boolean;
  idempotentReplay?: boolean;
  sender?: {
    id: number;
    name: string;
    email: string;
    credits: number;
  };
  transfer?: TransferLog;
  logs?: TransferLog[];
  error?: {
    code?: string;
    message?: string;
  };
};

type CreditTransferPanelProps = {
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

export function CreditTransferPanel({
  credits,
}: CreditTransferPanelProps) {
  const { formatCredits } =
    useCurrency();

  const [
    recipientEmail,
    setRecipientEmail,
  ] = useState("");

  const [amount, setAmount] =
    useState("");

  const [liveCredits, setLiveCredits] =
    useState(credits);

  const [senderEmail, setSenderEmail] =
    useState("");

  const [logs, setLogs] =
    useState<TransferLog[]>([]);

  const [loadingLogs, setLoadingLogs] =
    useState(true);

  const [submitting, setSubmitting] =
    useState(false);

  const [message, setMessage] =
    useState("");

  const [error, setError] =
    useState("");

  useEffect(() => {
    setLiveCredits(credits);
  }, [credits]);

  useEffect(() => {
    let disposed = false;

    async function loadTransfers() {
      try {
        const response = await fetch(
          "/api/trading/futures/wallet/transfers",
          {
            cache: "no-store",
            credentials:
              "same-origin",
          },
        );

        const payload =
          (await response.json()) as
            TransferResponse;

        if (
          disposed ||
          !response.ok ||
          !payload.ok
        ) {
          return;
        }

        if (payload.sender) {
          setLiveCredits(
            payload.sender.credits,
          );

          setSenderEmail(
            payload.sender.email
              .trim()
              .toLowerCase(),
          );
        }

        setLogs(payload.logs ?? []);
      }
      catch {
        if (!disposed) {
          setError(
            "Unable to load credit transfer logs.",
          );
        }
      }
      finally {
        if (!disposed) {
          setLoadingLogs(false);
        }
      }
    }

    const handleRefresh = () => {
      void loadTransfers();
    };

    void loadTransfers();

    const timer = window.setInterval(
      () => {
        void loadTransfers();
      },
      15_000,
    );

    window.addEventListener(
      "focus",
      handleRefresh,
    );

    window.addEventListener(
      "zainex:wallet-converted",
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
    };
  }, []);

  const parsedAmount =
    Number(amount);

  const normalizedRecipient =
    recipientEmail
      .trim()
      .toLowerCase();

  const emailLooksValid =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      normalizedRecipient,
    );

  const isSelfTransfer =
    senderEmail !== "" &&
    normalizedRecipient ===
      senderEmail;

  const amountIsValid =
    Number.isInteger(parsedAmount) &&
    parsedAmount >= 1 &&
    parsedAmount <= liveCredits;

  const formIsValid =
    emailLooksValid &&
    !isSelfTransfer &&
    amountIsValid;

  const creditsAfter =
    amountIsValid
      ? liveCredits -
        parsedAmount
      : liveCredits;

  async function submitTransfer(
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
        "/api/trading/futures/wallet/transfers",
        {
          method: "POST",
          credentials:
            "same-origin",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            recipientEmail:
              normalizedRecipient,
            amount:
              parsedAmount,
            clientRequestId:
              crypto.randomUUID(),
          }),
        },
      );

      const payload =
        (await response.json()) as
          TransferResponse;

      if (
        !response.ok ||
        !payload.ok ||
        !payload.sender
      ) {
        throw new Error(
          payload.error?.message ??
            "Credit transfer failed.",
        );
      }

      setLiveCredits(
        payload.sender.credits,
      );

      setLogs(payload.logs ?? []);

      setRecipientEmail("");
      setAmount("");

      setMessage(
        `${formatCredits(
          parsedAmount,
        )} AI credits sent successfully.`,
      );

      window.dispatchEvent(
        new Event(
          "zainex:credits-transferred",
        ),
      );
    }
    catch (transferError) {
      setError(
        transferError instanceof Error
          ? transferError.message
          : "Credit transfer failed.",
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
            USER CREDIT TRANSFER
          </span>

          <h2>
            Send AI credits
            <em> by email.</em>
          </h2>

          <p>
            Transfer whole AI credits to
            another existing ZAINEX user.
            Wallet funds and trading
            balances are not affected.
          </p>
        </div>

        <strong className={styles.rate}>
          NO TRANSFER FEE
        </strong>
      </div>

      <form
        className={styles.form}
        onSubmit={submitTransfer}
      >
        <label htmlFor="credit-recipient-email">
          Recipient ZAINEX email
        </label>

        <div className={styles.emailInput}>
          <span>@</span>

          <input
            id="credit-recipient-email"
            type="email"
            autoComplete="email"
            spellCheck={false}
            placeholder="user@example.com"
            value={recipientEmail}
            onChange={(event) => {
              setRecipientEmail(
                event.target.value,
              );

              setMessage("");
              setError("");
            }}
          />
        </div>

        <label htmlFor="credit-transfer-amount">
          Credits to transfer
        </label>

        <div className={styles.amountInput}>
          <span>✦</span>

          <input
            id="credit-transfer-amount"
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

          <small>CREDITS</small>
        </div>

        <div className={styles.quickAmounts}>
          {[10, 25, 50, 100].map(
            (quickAmount) => (
              <button
                key={quickAmount}
                type="button"
                disabled={
                  quickAmount >
                  liveCredits
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
                {quickAmount}
              </button>
            ),
          )}

          <button
            type="button"
            disabled={
              liveCredits < 1
            }
            onClick={() => {
              setAmount(
                liveCredits > 0
                  ? String(
                      liveCredits,
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
              Current credits
            </span>

            <strong>
              {formatCredits(
                liveCredits,
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

          <div>
            <span>Transfer fee</span>
            <strong>0</strong>
          </div>
        </div>

        {isSelfTransfer ? (
          <p className={styles.validation}>
            You cannot transfer credits
            to your own email address.
          </p>
        ) : null}

        {recipientEmail !== "" &&
        !emailLooksValid ? (
          <p className={styles.validation}>
            Enter a valid recipient email.
          </p>
        ) : null}

        {amount !== "" &&
        !amountIsValid ? (
          <p className={styles.validation}>
            Enter a whole amount from
            1 up to{" "}
            {formatCredits(
              liveCredits,
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
            !formIsValid ||
            submitting
          }
        >
          {submitting
            ? "Transferring..."
            : formIsValid
              ? `Send ${formatCredits(
                  parsedAmount,
                )} credits`
              : "Enter recipient and amount"}
        </button>

        <p className={styles.note}>
          The recipient email must already
          belong to a ZAINEX user.
        </p>
      </form>

      <section className={styles.logs}>
        <header>
          <div>
            <span>
              CREDIT TRANSFER LEDGER
            </span>

            <h3>
              Latest sent and received logs
            </h3>
          </div>

          <small>
            Latest 10 records
          </small>
        </header>

        {loadingLogs ? (
          <p className={styles.empty}>
            Loading transfer logs...
          </p>
        ) : null}

        {!loadingLogs &&
        logs.length === 0 ? (
          <p className={styles.empty}>
            No credit transfers yet.
          </p>
        ) : null}

        {!loadingLogs &&
        logs.length > 0 ? (
          <div className={styles.logList}>
            {logs.map((log) => (
              <article key={log.id}>
                <div
                  className={
                    log.direction ===
                    "SENT"
                      ? styles.sentBadge
                      : styles.receivedBadge
                  }
                >
                  {log.direction}
                </div>

                <div className={styles.logMain}>
                  <strong>
                    {formatCredits(
                      log.amount,
                    )}{" "}
                    credits
                  </strong>

                  <span>
                    {log.counterparty.name ||
                      log.counterparty.email}
                  </span>

                  <small>
                    {log.counterparty.email}
                  </small>
                </div>

                <div
                  className={
                    styles.logBalance
                  }
                >
                  <strong>
                    {log.direction ===
                    "SENT"
                      ? "-"
                      : "+"}
                    {formatCredits(
                      log.amount,
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