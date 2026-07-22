"use client";

/* ZAINEX_ADMIN_CONSOLE_V1 */

import {
  Fragment,
  useEffect,
  useState,
} from "react";

import styles from "../admin.module.css";

type Cashin = {
  id: number;
  userEmail: string | null;
  purpose: string;
  planName: string | null;
  amount: number;
  hasProofImage: boolean;
  proofImage: string | null;
  status: string;
  adminNote: string | null;
  reviewerEmail: string | null;
  reviewedAt: string | null;
  createdAt: string;
};

type CashinsResponse = {
  ok: boolean;
  page: number;
  perPage: number;
  total: number;
  cashins: Cashin[];
  error?: {
    message?: string;
  };
};

type OpenAction =
  | {
      cashinId: number;
      kind: "approve";
    }
  | {
      cashinId: number;
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

function formatUsd(
  value: number,
): string {
  return new Intl.NumberFormat(
    "en-US",
    {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    },
  ).format(value);
}

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

export default function AdminMerchantCashinsPage() {
  const [status, setStatus] =
    useState("pending");

  const [page, setPage] =
    useState(1);

  const [data, setData] =
    useState<CashinsResponse | null>(
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

  const [months, setMonths] =
    useState("1");

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
    cashinId: number;
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
      `/api/admin/merchant-cashins?${params.toString()}`,
      {
        cache: "no-store",
      },
    )
      .then(async (response) => {
        const payload =
          (await response.json()) as CashinsResponse;

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
              "Unable to load merchant cash-ins.",
          );
          return;
        }

        setError("");
        setData(payload);
      })
      .catch(() => {
        if (!disposed) {
          setError(
            "Unable to reach the merchant cash-ins endpoint.",
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
    cashin: Cashin,
  ) {
    setSubmitting(true);
    setRowFeedback(null);

    try {
      const response = await fetch(
        `/api/admin/merchant-cashins/${cashin.id}/approve`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            months:
              Number(months) || 1,
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
          cashinId: cashin.id,
          ok: false,
          message:
            payload.error
              ?.message ??
            "Could not approve this cash-in.",
        });
        return;
      }

      setRowFeedback({
        cashinId: cashin.id,
        ok: true,
        message:
          "Approved.",
      });

      setOpenAction(null);
      refresh();
    } catch {
      setRowFeedback({
        cashinId: cashin.id,
        ok: false,
        message:
          "Network error while approving.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function submitReject(
    cashin: Cashin,
  ) {
    setSubmitting(true);
    setRowFeedback(null);

    try {
      const response = await fetch(
        `/api/admin/merchant-cashins/${cashin.id}/reject`,
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
          cashinId: cashin.id,
          ok: false,
          message:
            payload.error
              ?.message ??
            "Could not reject this cash-in.",
        });
        return;
      }

      setRowFeedback({
        cashinId: cashin.id,
        ok: true,
        message: "Rejected.",
      });

      setOpenAction(null);
      setRejectNote("");
      refresh();
    } catch {
      setRowFeedback({
        cashinId: cashin.id,
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
        Manual "Pay via Merchant"
        (GoTyme) submissions.
        Approving credits the
        wallet or grants VIP the
        same way the equivalent
        manual action on the
        Users tab does.
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
          Loading cash-ins…
        </p>
      ) : data.cashins.length ===
        0 ? (
        <p
          className={styles.empty}
        >
          No cash-ins match that
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
                <th>
                  Purpose
                </th>
                <th>Amount</th>
                <th>Proof</th>
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
              {data.cashins.map(
                (cashin) => (
                  <Fragment
                    key={
                      cashin.id
                    }
                  >
                    <tr>
                      <td>
                        {cashin.userEmail ??
                          "—"}
                      </td>
                      <td>
                        {cashin.purpose ===
                        "subscription"
                          ? cashin.planName ??
                            "subscription"
                          : "wallet top-up"}
                      </td>
                      <td>
                        {formatUsd(
                          cashin.amount,
                        )}
                      </td>
                      <td>
                        {cashin.hasProofImage &&
                        cashin.proofImage ? (
                          <a
                            href={
                              cashin.proofImage
                            }
                            target="_blank"
                            rel="noreferrer"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={
                                cashin.proofImage
                              }
                              alt="Payment proof screenshot"
                              style={{
                                width:
                                  "40px",
                                height:
                                  "40px",
                                borderRadius:
                                  "6px",
                                objectFit:
                                  "cover",
                              }}
                            />
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        <span
                          className={`${styles.pill} ${statusPillClass(
                            cashin.status,
                          )}`}
                        >
                          {
                            cashin.status
                          }
                        </span>
                      </td>
                      <td>
                        {cashin.reviewerEmail ??
                          "—"}
                      </td>
                      <td>
                        {formatDate(
                          cashin.createdAt,
                        )}
                      </td>
                      <td>
                        {cashin.status ===
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
                                  openAction?.cashinId ===
                                    cashin.id &&
                                  openAction.kind ===
                                    "approve"
                                    ? null
                                    : {
                                        cashinId:
                                          cashin.id,
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
                                  openAction?.cashinId ===
                                    cashin.id &&
                                  openAction.kind ===
                                    "reject"
                                    ? null
                                    : {
                                        cashinId:
                                          cashin.id,
                                        kind: "reject",
                                      },
                                );
                              }}
                            >
                              Reject
                            </button>
                          </div>
                        ) : (
                          cashin.adminNote ??
                          "—"
                        )}
                      </td>
                    </tr>

                    {openAction?.cashinId ===
                      cashin.id &&
                    openAction.kind ===
                      "approve" ? (
                      <tr
                        key={`${cashin.id}-approve-form`}
                      >
                        <td
                          colSpan={
                            8
                          }
                        >
                          <div
                            className={
                              styles.inlineForm
                            }
                          >
                            {cashin.purpose ===
                            "subscription" ? (
                              <>
                                <input
                                  type="number"
                                  min={
                                    1
                                  }
                                  max={
                                    24
                                  }
                                  value={
                                    months
                                  }
                                  onChange={(
                                    event,
                                  ) => {
                                    setMonths(
                                      event
                                        .target
                                        .value,
                                    );
                                  }}
                                  style={{
                                    width:
                                      "70px",
                                  }}
                                />
                                <span>
                                  month(s)
                                  of{" "}
                                  {cashin.planName}
                                </span>
                              </>
                            ) : (
                              <span>
                                Credit{" "}
                                {formatUsd(
                                  cashin.amount,
                                )}{" "}
                                to
                                their
                                wallet
                              </span>
                            )}

                            <button
                              type="button"
                              disabled={
                                submitting
                              }
                              onClick={() => {
                                void submitApprove(
                                  cashin,
                                );
                              }}
                            >
                              Confirm
                              approve
                            </button>

                            {rowFeedback?.cashinId ===
                            cashin.id ? (
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

                    {openAction?.cashinId ===
                      cashin.id &&
                    openAction.kind ===
                      "reject" ? (
                      <tr
                        key={`${cashin.id}-reject-form`}
                      >
                        <td
                          colSpan={
                            8
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
                                  cashin,
                                );
                              }}
                            >
                              Confirm
                              reject
                            </button>

                            {rowFeedback?.cashinId ===
                            cashin.id ? (
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
            {data.total} cash-ins)
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
