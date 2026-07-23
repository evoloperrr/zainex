"use client";

/* ZAINEX_CASHOUT_REQUEST_V1 */

import {
  Fragment,
  useEffect,
  useState,
} from "react";

import { useCurrency } from "@/components/currency-provider";

import styles from "../admin.module.css";

type Cashout = {
  id: number;
  userEmail: string | null;
  amount: number;
  destinationNote: string | null;
  status: string;
  adminNote: string | null;
  reviewerEmail: string | null;
  reviewedAt: string | null;
  createdAt: string;
};

type CashoutsResponse = {
  ok: boolean;
  page: number;
  perPage: number;
  total: number;
  cashouts: Cashout[];
  error?: {
    message?: string;
  };
};

type OpenAction =
  | {
      cashoutId: number;
      kind: "approve";
    }
  | {
      cashoutId: number;
      kind: "reject";
    }
  | null;

const PER_PAGE = 20;

const STATUS_OPTIONS = [
  "pending",
  "approved",
  "rejected",
  "",
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
  if (status === "approved") {
    return styles.pillGood;
  }

  if (status === "rejected") {
    return styles.pillBad;
  }

  return styles.pillWarn;
}

export default function AdminCashoutsPage() {
  const { formatUsd } = useCurrency();

  const [status, setStatus] =
    useState("pending");

  const [page, setPage] =
    useState(1);

  const [data, setData] =
    useState<CashoutsResponse | null>(
      null,
    );

  const [error, setError] =
    useState("");

  const [refreshKey, setRefreshKey] =
    useState(0);

  const [
    openAction,
    setOpenAction,
  ] = useState<OpenAction>(null);

  const [
    rejectNote,
    setRejectNote,
  ] = useState("");

  const [submitting, setSubmitting] =
    useState(false);

  const [
    rowFeedback,
    setRowFeedback,
  ] = useState<{
    cashoutId: number;
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

    if (status !== "") {
      params.set("status", status);
    }

    fetch(
      `/api/admin/cashout-requests?${params.toString()}`,
      {
        cache: "no-store",
      },
    )
      .then(async (response) => {
        const payload =
          (await response.json()) as CashoutsResponse;

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
              "Unable to load cashout requests.",
          );
          return;
        }

        setError("");
        setData(payload);
      })
      .catch(() => {
        if (!disposed) {
          setError(
            "Unable to reach the cashout requests endpoint.",
          );
        }
      });

    return () => {
      disposed = true;
    };
  }, [status, page, refreshKey]);

  function refresh() {
    setRefreshKey(
      (value) => value + 1,
    );
  }

  async function submitApprove(
    cashout: Cashout,
  ) {
    setSubmitting(true);
    setRowFeedback(null);

    try {
      const response = await fetch(
        `/api/admin/cashout-requests/${cashout.id}/approve`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
        },
      );

      const payload =
        await response.json();

      if (
        !response.ok ||
        !payload.ok
      ) {
        setRowFeedback({
          cashoutId: cashout.id,
          ok: false,
          message:
            payload.error
              ?.message ??
            "Could not approve this cashout.",
        });
        return;
      }

      setRowFeedback({
        cashoutId: cashout.id,
        ok: true,
        message:
          "Approved.",
      });

      setOpenAction(null);
      refresh();
    } catch {
      setRowFeedback({
        cashoutId: cashout.id,
        ok: false,
        message:
          "Network error while approving.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function submitReject(
    cashout: Cashout,
  ) {
    setSubmitting(true);
    setRowFeedback(null);

    try {
      const response = await fetch(
        `/api/admin/cashout-requests/${cashout.id}/reject`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            note: rejectNote,
          }),
        },
      );

      const payload =
        await response.json();

      if (
        !response.ok ||
        !payload.ok
      ) {
        setRowFeedback({
          cashoutId: cashout.id,
          ok: false,
          message:
            payload.error
              ?.message ??
            "Could not reject this cashout.",
        });
        return;
      }

      setRowFeedback({
        cashoutId: cashout.id,
        ok: true,
        message: "Rejected — funds released back to their wallet.",
      });

      setOpenAction(null);
      setRejectNote("");
      refresh();
    } catch {
      setRowFeedback({
        cashoutId: cashout.id,
        ok: false,
        message:
          "Network error while rejecting.",
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
        User-initiated wallet withdrawal
        requests. Approving debits the
        user&rsquo;s total wallet balance —
        send the funds manually first, then
        approve here to finalize the ledger.
        Payment rails aren&rsquo;t finalized
        yet, so check the destination note
        for where the user wants it sent.
      </p>

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
          Loading cashout requests…
        </p>
      ) : data.cashouts.length ===
        0 ? (
        <p
          className={styles.empty}
        >
          No cashout requests match that
          filter.
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
                <th>Amount</th>
                <th>
                  Destination
                </th>
                <th>Status</th>
                <th>
                  Reviewed by
                </th>
                <th>
                  Submitted
                </th>
                <th>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {data.cashouts.map(
                (cashout) => (
                  <Fragment
                    key={
                      cashout.id
                    }
                  >
                    <tr>
                      <td>
                        {cashout.userEmail ??
                          "—"}
                      </td>
                      <td>
                        {formatUsd(
                          cashout.amount,
                        )}
                      </td>
                      <td>
                        {cashout.destinationNote ??
                          "—"}
                      </td>
                      <td>
                        <span
                          className={`${styles.pill} ${statusPillClass(
                            cashout.status,
                          )}`}
                        >
                          {
                            cashout.status
                          }
                        </span>
                      </td>
                      <td>
                        {cashout.reviewerEmail ??
                          "—"}
                      </td>
                      <td>
                        {formatDate(
                          cashout.createdAt,
                        )}
                      </td>
                      <td>
                        {cashout.status ===
                        "pending" ? (
                          <div
                            className={
                              styles.rowActions
                            }
                          >
                            <button
                              type="button"
                              className={
                                styles.rowActionButton
                              }
                              onClick={() => {
                                setRowFeedback(
                                  null,
                                );
                                setOpenAction(
                                  openAction?.cashoutId ===
                                    cashout.id &&
                                  openAction.kind ===
                                    "approve"
                                    ? null
                                    : {
                                        cashoutId:
                                          cashout.id,
                                        kind: "approve",
                                      },
                                );
                              }}
                            >
                              Approve
                            </button>

                            <button
                              type="button"
                              className={
                                styles.rowActionButton
                              }
                              onClick={() => {
                                setRowFeedback(
                                  null,
                                );
                                setOpenAction(
                                  openAction?.cashoutId ===
                                    cashout.id &&
                                  openAction.kind ===
                                    "reject"
                                    ? null
                                    : {
                                        cashoutId:
                                          cashout.id,
                                        kind: "reject",
                                      },
                                );
                              }}
                            >
                              Reject
                            </button>
                          </div>
                        ) : (
                          cashout.adminNote ??
                          "—"
                        )}
                      </td>
                    </tr>

                    {openAction?.cashoutId ===
                      cashout.id &&
                    openAction.kind ===
                      "approve" ? (
                      <tr
                        key={`${cashout.id}-approve-form`}
                      >
                        <td
                          colSpan={
                            7
                          }
                        >
                          <div
                            className={
                              styles.inlineForm
                            }
                          >
                            <span>
                              Debit{" "}
                              {formatUsd(
                                cashout.amount,
                              )}{" "}
                              from their
                              wallet — confirm
                              only after the
                              funds have
                              actually been
                              sent.
                            </span>

                            <button
                              type="button"
                              disabled={
                                submitting
                              }
                              onClick={() => {
                                void submitApprove(
                                  cashout,
                                );
                              }}
                            >
                              Confirm
                              approve
                            </button>

                            {rowFeedback?.cashoutId ===
                            cashout.id ? (
                              <span
                                className={`${
                                  styles.feedback
                                } ${
                                  rowFeedback.ok
                                    ? styles.feedbackOk
                                    : styles.feedbackError
                                }`}
                              >
                                {
                                  rowFeedback.message
                                }
                              </span>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ) : null}

                    {openAction?.cashoutId ===
                      cashout.id &&
                    openAction.kind ===
                      "reject" ? (
                      <tr
                        key={`${cashout.id}-reject-form`}
                      >
                        <td
                          colSpan={
                            7
                          }
                        >
                          <div
                            className={
                              styles.inlineForm
                            }
                          >
                            <input
                              type="text"
                              placeholder="Reason (optional)"
                              value={
                                rejectNote
                              }
                              onChange={(
                                event,
                              ) => {
                                setRejectNote(
                                  event
                                    .target
                                    .value,
                                );
                              }}
                              style={{
                                flex: 1,
                                minWidth:
                                  "160px",
                              }}
                            />

                            <button
                              type="button"
                              disabled={
                                submitting
                              }
                              onClick={() => {
                                void submitReject(
                                  cashout,
                                );
                              }}
                            >
                              Confirm
                              reject
                            </button>

                            {rowFeedback?.cashoutId ===
                            cashout.id ? (
                              <span
                                className={`${
                                  styles.feedback
                                } ${
                                  rowFeedback.ok
                                    ? styles.feedbackOk
                                    : styles.feedbackError
                                }`}
                              >
                                {
                                  rowFeedback.message
                                }
                              </span>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
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
            {data.total} cashouts)
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
