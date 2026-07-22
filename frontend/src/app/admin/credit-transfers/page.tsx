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
  }, [page]);

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
        User-to-user AI credit
        transfers.
      </p>

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
