"use client";

/* ZAINEX_ADMIN_CONSOLE_V1 */

import {
  useEffect,
  useState,
} from "react";

import { useCurrency } from "@/components/currency-provider";

import styles from "../admin.module.css";

type CryptoPayment = {
  id: number;
  userEmail: string | null;
  purpose: string;
  planName: string | null;
  priceAmount: number;
  payCurrency: string | null;
  payAmount: string | null;
  status: string;
  providerPaymentId: string | null;
  creditedAt: string | null;
  createdAt: string;
};

type CryptoPaymentsResponse = {
  ok: boolean;
  page: number;
  perPage: number;
  total: number;
  payments: CryptoPayment[];
  error?: {
    message?: string;
  };
};

const PER_PAGE = 20;

const STATUS_OPTIONS = [
  "",
  "waiting",
  "confirming",
  "sending",
  "finished",
  "confirmed",
  "failed",
  "expired",
];

function formatDate(
  value: string | null,
): string {
  if (!value) {
    return "—";
  }

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
  if (
    status === "finished" ||
    status === "confirmed"
  ) {
    return styles.pillGood;
  }

  if (
    status === "failed" ||
    status === "expired"
  ) {
    return styles.pillBad;
  }

  return styles.pillWarn;
}

export default function AdminCryptoPaymentsPage() {
  const { formatUsd } = useCurrency();

  const [status, setStatus] =
    useState("");

  const [page, setPage] =
    useState(1);

  const [data, setData] =
    useState<CryptoPaymentsResponse | null>(
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

    if (status !== "") {
      params.set("status", status);
    }

    fetch(
      `/api/admin/crypto-payments?${params.toString()}`,
      {
        cache: "no-store",
      },
    )
      .then(async (response) => {
        const payload =
          (await response.json()) as CryptoPaymentsResponse;

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
              "Unable to load crypto payments.",
          );
          return;
        }

        setError("");
        setData(payload);
      })
      .catch(() => {
        if (!disposed) {
          setError(
            "Unable to reach the admin crypto payments endpoint.",
          );
        }
      });

    return () => {
      disposed = true;
    };
  }, [status, page]);

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
        <select
          className={
            styles.selectInput
          }
          value={status}
          onChange={(event) => {
            setPage(1);
            setStatus(
              event.target.value,
            );
          }}
        >
          {STATUS_OPTIONS.map(
            (option) => (
              <option
                key={option}
                value={option}
              >
                {option === ""
                  ? "All statuses"
                  : option}
              </option>
            ),
          )}
        </select>
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
          Loading crypto
          payments…
        </p>
      ) : data.payments.length ===
        0 ? (
        <p
          className={styles.empty}
        >
          No crypto payments yet.
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
                <th>Purpose</th>
                <th>
                  Plan / amount
                </th>
                <th>
                  Crypto amount
                </th>
                <th>Status</th>
                <th>Created</th>
                <th>
                  Credited
                </th>
              </tr>
            </thead>
            <tbody>
              {data.payments.map(
                (payment) => (
                  <tr
                    key={
                      payment.id
                    }
                  >
                    <td>
                      {payment.userEmail ??
                        "—"}
                    </td>
                    <td>
                      {payment.purpose ===
                      "subscription"
                        ? payment.planName ??
                          "subscription"
                        : "wallet top-up"}
                    </td>
                    <td>
                      {formatUsd(
                        payment.priceAmount,
                      )}
                    </td>
                    <td>
                      {payment.payAmount ??
                        "—"}{" "}
                      {payment.payCurrency?.toUpperCase() ??
                        ""}
                    </td>
                    <td>
                      <span
                        className={`${styles.pill} ${statusPillClass(
                          payment.status,
                        )}`}
                      >
                        {
                          payment.status
                        }
                      </span>
                    </td>
                    <td>
                      {formatDate(
                        payment.createdAt,
                      )}
                    </td>
                    <td>
                      {formatDate(
                        payment.creditedAt,
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
            {data.total} payments)
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
