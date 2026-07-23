"use client";

/* ZAINEX_ADMIN_CONSOLE_V1 */

import {
  useEffect,
  useState,
} from "react";

import { useCurrency } from "@/components/currency-provider";

import styles from "../admin.module.css";

type LedgerRow = {
  id: number;
  userEmail: string | null;
  eventType: string;
  direction: string;
  asset: string;
  amount: number;
  walletBalanceBefore: number;
  walletBalanceAfter: number;
  referenceKey: string;
  description: string | null;
  occurredAt: string;
};

type LedgerResponse = {
  ok: boolean;
  page: number;
  perPage: number;
  total: number;
  transactions: LedgerRow[];
  error?: {
    message?: string;
  };
};

const PER_PAGE = 25;

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

function directionPillClass(
  direction: string,
): string {
  if (
    direction === "CREDIT"
  ) {
    return styles.pillGood;
  }

  if (
    direction === "DEBIT"
  ) {
    return styles.pillBad;
  }

  return styles.pillNeutral;
}

export default function AdminWalletLedgerPage() {
  const { formatUsd } = useCurrency();

  const [eventType, setEventType] =
    useState("");

  const [
    eventTypeInput,
    setEventTypeInput,
  ] = useState("");

  const [page, setPage] =
    useState(1);

  const [data, setData] =
    useState<LedgerResponse | null>(
      null,
    );

  const [error, setError] =
    useState("");

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

    if (eventType.trim() !== "") {
      params.set(
        "eventType",
        eventType.trim(),
      );
    }

    fetch(
      `/api/admin/wallet-ledger?${params.toString()}`,
      {
        cache: "no-store",
      },
    )
      .then(async (response) => {
        const payload =
          (await response.json()) as LedgerResponse;

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
              "Unable to load the wallet ledger.",
          );
          return;
        }

        setError("");
        setData(payload);
      })
      .catch(() => {
        if (!disposed) {
          setError(
            "Unable to reach the admin wallet ledger endpoint.",
          );
        }
      });

    return () => {
      disposed = true;
    };
  }, [eventType, page]);

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
      <div
        className={styles.toolbar}
      >
        <input
          type="text"
          placeholder="Filter by event type (e.g. ADMIN_MANUAL_CREDIT)…"
          className={
            styles.searchInput
          }
          value={eventTypeInput}
          onChange={(event) => {
            setEventTypeInput(
              event.target.value,
            );
          }}
          onKeyDown={(event) => {
            if (
              event.key === "Enter"
            ) {
              setPage(1);
              setEventType(
                eventTypeInput,
              );
            }
          }}
        />

        <button
          type="button"
          className={
            styles.pageButton
          }
          onClick={() => {
            setPage(1);
            setEventType(
              eventTypeInput,
            );
          }}
        >
          Filter
        </button>
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
          Loading wallet
          ledger…
        </p>
      ) : data.transactions
          .length === 0 ? (
        <p
          className={styles.empty}
        >
          No matching
          transactions.
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
                <th>User</th>
                <th>Event</th>
                <th>
                  Direction
                </th>
                <th>Amount</th>
                <th>
                  Balance after
                </th>
                <th>
                  Reference
                </th>
                <th>Occurred</th>
              </tr>
            </thead>
            <tbody>
              {data.transactions.map(
                (row) => (
                  <tr key={row.id}>
                    <td>
                      {row.userEmail ??
                        "—"}
                    </td>
                    <td>
                      {
                        row.eventType
                      }
                    </td>
                    <td>
                      <span
                        className={`${styles.pill} ${directionPillClass(
                          row.direction,
                        )}`}
                      >
                        {
                          row.direction
                        }
                      </span>
                    </td>
                    <td>
                      {formatUsd(
                        row.amount,
                      )}{" "}
                      {row.asset}
                    </td>
                    <td>
                      {formatUsd(
                        row.walletBalanceAfter,
                      )}
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
            {data.total}{" "}
            transactions)
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
