"use client";

/* ZAINEX_ROOT_ADMIN_WALLET_TRANSFER_V1 */

import {
  FormEvent,
  useEffect,
  useState,
} from "react";

import {
  createPortal,
} from "react-dom";

import styles from "./admin-wallet-transfer.module.css";

type AdminTransferLog = {
  id: number;
  amount: string;
  status: string;
  occurredAt: string;
  recipient: {
    name: string;
    email: string;
  };
};

type AdminTransferResponse = {
  ok?: boolean;
  admin?: {
    walletBalance?: string;
    availableBalance?: string;
  };
  logs?: AdminTransferLog[];
  transfer?: {
    amount?: string;
    recipient?: {
      name?: string;
      email?: string;
    };
  };
  error?: {
    message?: string;
  };
};

type AdminWalletTransferProps = {
  isAdmin: boolean;
  availableBalance: number;
};

function formatUsd(
  value: number | string,
): string {
  const numeric =
    Number(value);

  return new Intl.NumberFormat(
    "en-US",
    {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    },
  ).format(
    Number.isFinite(numeric)
      ? numeric
      : 0,
  );
}

function formatDate(
  value: string,
): string {
  const date =
    new Date(value);

  return Number.isNaN(
    date.getTime(),
  )
    ? "-"
    : date.toLocaleString(
        "en-US",
        {
          month: "short",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        },
      );
}

export function AdminWalletTransfer({
  isAdmin,
  availableBalance,
}: AdminWalletTransferProps) {
  const [
    mounted,
    setMounted,
  ] = useState(false);

  const [
    open,
    setOpen,
  ] = useState(false);

  const [
    recipientEmail,
    setRecipientEmail,
  ] = useState("");

  const [
    amount,
    setAmount,
  ] = useState("");

  const [
    pending,
    setPending,
  ] = useState(false);

  const [
    message,
    setMessage,
  ] = useState("");

  const [
    error,
    setError,
  ] = useState("");

  const [
    logs,
    setLogs,
  ] = useState<AdminTransferLog[]>([]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isAdmin) {
      return;
    }

    let disposed = false;

    async function loadLogs(): Promise<void> {
      try {
        const response =
          await fetch(
            "/api/trading/futures/wallet/admin-transfers",
            {
              cache: "no-store",
            },
          );

        const payload =
          (await response.json()) as
            AdminTransferResponse;

        if (
          !disposed &&
          response.ok &&
          payload.ok === true
        ) {
          setLogs(
            payload.logs ?? [],
          );
        }
      }
      catch {
        // Keep admin UI usable.
      }
    }

    void loadLogs();

    return () => {
      disposed = true;
    };
  }, [isAdmin]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow =
      "hidden";

    function onKeyDown(
      event: KeyboardEvent,
    ): void {
      if (
        event.key === "Escape" &&
        !pending
      ) {
        setOpen(false);
      }
    }

    window.addEventListener(
      "keydown",
      onKeyDown,
    );

    return () => {
      document.body.style.overflow =
        previousOverflow;

      window.removeEventListener(
        "keydown",
        onKeyDown,
      );
    };
  }, [open, pending]);

  if (!isAdmin) {
    return null;
  }

  async function submit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();

    if (pending) {
      return;
    }

    setPending(true);
    setError("");
    setMessage("");

    try {
      const response =
        await fetch(
          "/api/trading/futures/wallet/admin-transfers",
          {
            method: "POST",
            cache: "no-store",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              recipientEmail:
                recipientEmail
                  .trim()
                  .toLowerCase(),
              amount:
                amount.trim(),
              clientRequestId:
                crypto.randomUUID(),
            }),
          },
        );

      const payload =
        (await response.json()) as
          AdminTransferResponse;

      if (
        !response.ok ||
        payload.ok !== true
      ) {
        throw new Error(
          payload.error?.message ??
            "Admin transfer failed.",
        );
      }

      const sent =
        payload.transfer?.amount ??
        amount;

      const recipient =
        payload.transfer
          ?.recipient?.email ??
        recipientEmail;

      setMessage(
        `${formatUsd(
          sent,
        )} transferred to ${recipient}.`,
      );

      setLogs(
        payload.logs ?? [],
      );

      setRecipientEmail("");
      setAmount("");

      window.dispatchEvent(
        new Event(
          "zainex:wallet-data-changed",
        ),
      );
    }
    catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Admin transfer failed.",
      );
    }
    finally {
      setPending(false);
    }
  }

  const modal =
    mounted && open
      ? createPortal(
          <div
            className={styles.overlay}
            role="presentation"
            onMouseDown={(event) => {
              if (
                event.target ===
                  event.currentTarget &&
                !pending
              ) {
                setOpen(false);
              }
            }}
          >
            <section
              className={styles.modal}
              role="dialog"
              aria-modal="true"
              aria-labelledby="admin-transfer-title"
            >
              <header className={styles.modalHeader}>
                <div>
                  <span>
                    ROOT ADMIN FUNCTION
                  </span>

                  <h2 id="admin-transfer-title">
                    Transfer wallet funds
                  </h2>

                  <p>
                    Send paper USDT from the root
                    administrator wallet to an
                    existing ZAINEX user.
                  </p>
                </div>

                <button
                  type="button"
                  className={styles.close}
                  onClick={() => {
                    if (!pending) {
                      setOpen(false);
                    }
                  }}
                  aria-label="Close admin transfer"
                >
                  X
                </button>
              </header>

              <div className={styles.balance}>
                <span>
                  ADMIN AVAILABLE BALANCE
                </span>

                <strong>
                  {formatUsd(
                    availableBalance,
                  )}
                </strong>

                <small>
                  Paper wallet only. No live funds.
                </small>
              </div>

              <form
                className={styles.form}
                onSubmit={(event) => {
                  void submit(event);
                }}
              >
                <label>
                  <span>
                    Recipient email
                  </span>

                  <input
                    type="email"
                    required
                    autoComplete="off"
                    value={recipientEmail}
                    placeholder="user@example.com"
                    onChange={(event) => {
                      setRecipientEmail(
                        event.target.value,
                      );
                    }}
                  />
                </label>

                <label>
                  <span>
                    Amount in USDT
                  </span>

                  <input
                    type="text"
                    required
                    inputMode="decimal"
                    pattern="[0-9]+([.][0-9]{1,8})?"
                    value={amount}
                    placeholder="0.00"
                    onChange={(event) => {
                      setAmount(
                        event.target.value,
                      );
                    }}
                  />
                </label>

                {error ? (
                  <p
                    className={styles.error}
                    role="alert"
                  >
                    {error}
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

                <button
                  type="submit"
                  className={styles.submit}
                  disabled={pending}
                >
                  {pending
                    ? "Processing transfer..."
                    : "Transfer to user"}
                </button>
              </form>

              <section className={styles.history}>
                <header>
                  <span>
                    ADMIN TRANSFER HISTORY
                  </span>

                  <small>
                    Latest 10
                  </small>
                </header>

                {logs.length === 0 ? (
                  <p className={styles.empty}>
                    No admin wallet transfers yet.
                  </p>
                ) : (
                  <div className={styles.rows}>
                    {logs.map((log) => (
                      <article key={log.id}>
                        <div>
                          <strong>
                            {log.recipient.name ||
                              log.recipient.email}
                          </strong>

                          <small>
                            {log.recipient.email}
                          </small>
                        </div>

                        <div>
                          <strong>
                            {formatUsd(
                              log.amount,
                            )}
                          </strong>

                          <small>
                            {formatDate(
                              log.occurredAt,
                            )}
                          </small>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </section>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <section className={styles.adminBar}>
        <div className={styles.adminIdentity}>
          <span className={styles.badge}>
            ADMIN
          </span>

          <div>
            <strong>
              Root wallet administration
            </strong>

            <small>
              Protected server-authorized function
            </small>
          </div>
        </div>

        <div className={styles.adminActions}>
          <span>
            Available:
            {" "}
            <strong>
              {formatUsd(
                availableBalance,
              )}
            </strong>
          </span>

          <button
            type="button"
            onClick={() => {
              setError("");
              setMessage("");
              setOpen(true);
            }}
          >
            Transfer admin to user
          </button>
        </div>
      </section>

      {modal}
    </>
  );
}