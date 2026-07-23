"use client";

/* ZAINEX_ADMIN_CONSOLE_V1 */

import {
  useEffect,
  useState,
} from "react";

import { useCurrency } from "@/components/currency-provider";

import styles from "./admin.module.css";

type OverviewResponse = {
  ok: boolean;
  totalUsers: number;
  totalWalletBalance: number;
  totalAiCredits: number;
  vipBreakdown: Array<{
    tier: string;
    count: number;
  }>;
  pendingCryptoPayments: number;
  recentSignups: Array<{
    id: number;
    name: string;
    email: string;
    createdAt: string;
  }>;
  error?: {
    message?: string;
  };
};

function formatNumber(
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

export default function AdminOverviewPage() {
  const { formatUsd } = useCurrency();

  const [data, setData] =
    useState<OverviewResponse | null>(
      null,
    );

  const [error, setError] =
    useState("");

  useEffect(() => {
    let disposed = false;

    fetch("/api/admin/overview", {
      cache: "no-store",
    })
      .then(async (response) => {
        const payload =
          (await response.json()) as OverviewResponse;

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
              "Unable to load the admin overview.",
          );
          return;
        }

        setData(payload);
      })
      .catch(() => {
        if (!disposed) {
          setError(
            "Unable to reach the admin overview endpoint.",
          );
        }
      });

    return () => {
      disposed = true;
    };
  }, []);

  if (error) {
    return (
      <p className={styles.empty}>
        {error}
      </p>
    );
  }

  if (!data) {
    return (
      <p className={styles.empty}>
        Loading overview…
      </p>
    );
  }

  return (
    <>
      <div
        className={styles.statGrid}
      >
        <div
          className={
            styles.statCard
          }
        >
          <span>Total users</span>
          <strong>
            {formatNumber(
              data.totalUsers,
            )}
          </strong>
        </div>

        <div
          className={
            styles.statCard
          }
        >
          <span>
            Total wallet balance
          </span>
          <strong>
            {formatUsd(
              data.totalWalletBalance,
            )}
          </strong>
        </div>

        <div
          className={
            styles.statCard
          }
        >
          <span>
            Total AI credits
            issued
          </span>
          <strong>
            {formatNumber(
              data.totalAiCredits,
            )}
          </strong>
        </div>

        <div
          className={
            styles.statCard
          }
        >
          <span>
            Pending crypto
            payments
          </span>
          <strong>
            {formatNumber(
              data.pendingCryptoPayments,
            )}
          </strong>
        </div>
      </div>

      <section
        className={styles.section}
      >
        <h2
          className={
            styles.sectionTitle
          }
        >
          Active VIP tiers
        </h2>

        {data.vipBreakdown.length ===
        0 ? (
          <p
            className={
              styles.empty
            }
          >
            No active VIP
            subscriptions yet.
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
                  <th>Tier</th>
                  <th>
                    Active users
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.vipBreakdown.map(
                  (row) => (
                    <tr
                      key={
                        row.tier
                      }
                    >
                      <td>
                        {row.tier}
                      </td>
                      <td>
                        {formatNumber(
                          row.count,
                        )}
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section
        className={styles.section}
      >
        <h2
          className={
            styles.sectionTitle
          }
        >
          Recent signups
        </h2>

        {data.recentSignups
          .length === 0 ? (
          <p
            className={
              styles.empty
            }
          >
            No signups yet.
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
                  <th>Name</th>
                  <th>Email</th>
                  <th>
                    Signed up
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.recentSignups.map(
                  (row) => (
                    <tr
                      key={row.id}
                    >
                      <td>
                        {row.name}
                      </td>
                      <td>
                        {row.email}
                      </td>
                      <td>
                        {formatDate(
                          row.createdAt,
                        )}
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
