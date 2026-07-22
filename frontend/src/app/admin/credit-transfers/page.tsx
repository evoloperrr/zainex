"use client";

/* ZAINEX_ADMIN_CONSOLE_V1 */

import {
  useEffect,
  useState,
} from "react";

import styles from "../admin.module.css";

type TransferRow = {
  id: number;
  senderEmail: string | null;
  recipientEmail: string | null;
  amount: number;
  status: string;
  referenceKey: string;
  occurredAt: string;
};

type TransfersResponse = {
  ok: boolean;
  page: number;
  perPage: number;
  total: number;
  transfers: TransferRow[];
  error?: {
    message?: string;
  };
};

const PER_PAGE = 25;

function formatCredits(
  value: number,
): string {
  return new Intl.NumberFormat(
    "en-US",
  ).format(value);
}

function formatDate(
  value: string,
): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString(
    "en-US",
    {
      dateStyle: "medium",
      timeStyle: "short",
    },
  );
}

function statusPillClass(
  status: string,
): string {
  if (status === "COMPLETED") {
    return styles.pillGood;
  }

  if (
    status === "FAILED" ||
    status === "CANCELLED"
  ) {
    return styles.pillBad;
  }

  return styles.pillNeutral;
}

export default function AdminCreditTransfersPage() {
  const [page, setPage] =
    useState(1);

  const [data, setData] =
    useState<TransfersResponse | null>(
      null,
    );

  const [error, setError] =
    useState("");

  const [refreshKey, setRefreshKey] =
    useState(0);

  const [
    recipientEmail,
    setRecipientEmail,
  ] = useState("");

  const [
    sendAmount,
    setSendAmount,
  ] = useState("");

  const [submitting, setSubmitting] =
    useState(false);

  const [
    sendFeedback,
    setSendFeedback,
  ] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  useEffect(() => {
    let disposed = false;

    const params = new URLSearchParams();
    params.set(
      "page",
      String(page),
    );
    params.set(
      "perPage",
      String(PER_PAGE),
    );

    fetch(
      `/api/admin/credit-transfers?${params.toString()}`,
      {
        cache: "no-store",
      },
    )
      .then(async (response) => {
        const payload =
          (await response.json()) as TransfersResponse;

        if (disposed) {
          return;
        }

        if (
          !response.ok ||
          !payload.ok
        ) {
          setError(
            payload.error
              ?.message ??
              "Unable to load credit transfers.",
          );
          return;
        }

        setError("");
        setData(payload);
      })
      .catch(() => {
        if (!disposed) {
          setError(
            "Unable to reach the credit transfers endpoint.",
          );
        }
      });

    return () => {
      disposed = true;
    };
  }, [page, refreshKey]);

  async function submitTransfer() {
    const email = recipientEmail
      .trim()
      .toLowerCase();

    const amount = Number(
      sendAmount,
    );

    if (email === "") {
      setSendFeedback({
        ok: false,
        message:
          "Enter a recipient email.",
      });
      return;
    }

    if (
      !Number.isInteger(amount) ||
      amount <= 0
    ) {
      setSendFeedback({
        ok: false,
        message:
          "Enter a whole number of credits.",
      });
      return;
    }

    setSubmitting(true);
    setSendFeedback(null);

    try {
      const response = await fetch(
        "/api/trading/futures/wallet/transfers",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            recipientEmail: email,
            amount,
            clientRequestId:
              crypto.randomUUID(),
          }),
        },
      );

      const payload =
        await response.json();

      if (
        !response.ok ||
        !payload.ok
      ) {
        setSendFeedback({
          ok: false,
          message:
            payload.error
              ?.message ??
            "Could not send the credits.",
        });
        return;
      }

      setSendFeedback({
        ok: true,
        message: `Sent ${
          payload.transfer
            ?.amount ?? sendAmount
        } credits to ${
          payload.transfer
            ?.counterparty
            ?.email ?? email
        }.`,
      });

      setRecipientEmail("");
      setSendAmount("");
      setPage(1);
      setRefreshKey(
        (value) => value + 1,
      );
    } catch {
      setSendFeedback({
        ok: false,
        message:
          "Network error while sending the credits.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  const totalPages = data
    ? Math.max(
        1,
        Math.ceil(
          data.total / PER_PAGE,
        ),
      )
    : 1;

  return (
    <>
      <p
        className={
          styles.sectionTitle
        }
      >
        Admin-to-user (and
        user-to-user) AI credit
        transfers.
      </p>

      <div
        className={
          styles.inlineForm
        }
        style={{
          marginBottom: "20px",
          borderTop: "none",
          borderRadius: "14px",
          border:
            "1px solid var(--z-border)",
        }}
      >
        <input
          type="email"
          placeholder="Recipient email"
          value={recipientEmail}
          onChange={(event) => {
            setRecipientEmail(
              event.target.value,
            );
          }}
          style={{
            minWidth: "220px",
          }}
        />

        <input
          type="number"
          min="1"
          step="1"
          placeholder="Credits"
          value={sendAmount}
          onChange={(event) => {
            setSendAmount(
              event.target.value,
            );
          }}
          style={{
            width: "120px",
          }}
        />

        <button
          type="button"
          disabled={submitting}
          onClick={() => {
            void submitTransfer();
          }}
        >
          Send credits
        </button>

        {sendFeedback ? (
          <span
            className={`${
              styles.feedback
            } ${
              sendFeedback.ok
                ? styles.feedbackOk
                : styles.feedbackError
            }`}
          >
            {sendFeedback.message}
          </span>
        ) : null}
      </div>

      {error ? (
        <p
          className={styles.empty}
        >
          {error}
        </p>
      ) : !data ? (
        <p
          className={styles.empty}
        >
          Loading credit
          transfers…
        </p>
      ) : data.transfers.length ===
        0 ? (
        <p
          className={styles.empty}
        >
          No credit transfers
          yet.
        </p>
      ) : (
        <div
          className={
            styles.tableWrap
          }
        >
          <table
            className={
              styles.table
            }
          >
            <thead>
              <tr>
                <th>From</th>
                <th>To</th>
                <th>Credits</th>
                <th>Status</th>
                <th>
                  Reference
                </th>
                <th>Occurred</th>
              </tr>
            </thead>
            <tbody>
              {data.transfers.map(
                (row) => (
                  <tr key={row.id}>
                    <td>
                      {row.senderEmail ??
                        "—"}
                    </td>
                    <td>
                      {row.recipientEmail ??
                        "—"}
                    </td>
                    <td>
                      {formatCredits(
                        row.amount,
                      )}
                    </td>
                    <td>
                      <span
                        className={`${styles.pill} ${statusPillClass(
                          row.status,
                        )}`}
                      >
                        {
                          row.status
                        }
                      </span>
                    </td>
                    <td>
                      {
                        row.referenceKey
                      }
                    </td>
                    <td>
                      {formatDate(
                        row.occurredAt,
                      )}
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}

      {data ? (
        <div
          className={
            styles.pageControls
          }
        >
          <button
            type="button"
            className={
              styles.pageButton
            }
            disabled={page <= 1}
            onClick={() => {
              setPage(
                (value) =>
                  Math.max(
                    1,
                    value - 1,
                  ),
              );
            }}
          >
            Previous
          </button>

          <span>
            Page {page} of{" "}
            {totalPages} (
            {data.total} transfers)
          </span>

          <button
            type="button"
            className={
              styles.pageButton
            }
            disabled={
              page >= totalPages
            }
            onClick={() => {
              setPage(
                (value) =>
                  value + 1,
              );
            }}
          >
            Next
          </button>
        </div>
      ) : null}
    </>
  );
}
