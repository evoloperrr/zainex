"use client";

/* ZAINEX_ADMIN_CONSOLE_V1 */

import {
  Fragment,
  useEffect,
  useState,
} from "react";

import { useCurrency } from "@/components/currency-provider";

import styles from "../admin.module.css";

type AdminUser = {
  id: number;
  name: string;
  email: string;
  role: string;
  isAdmin: boolean;
  walletBalance: number;
  aiCredits: number;
  vipTier: string | null;
  vipExpiresAt: string | null;
  createdAt: string;
};

type UsersResponse = {
  ok: boolean;
  page: number;
  perPage: number;
  total: number;
  users: AdminUser[];
  error?: {
    message?: string;
  };
};

type OpenAction =
  | {
      userId: number;
      kind: "vip";
    }
  | {
      userId: number;
      kind: "credit";
    }
  | {
      userId: number;
      kind: "name";
    }
  | {
      userId: number;
      kind: "role";
    }
  | null;

const PER_PAGE = 20;

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

function vipPillClass(
  user: AdminUser,
): string {
  if (!user.vipTier) {
    return styles.pillNeutral;
  }

  const expiresAt =
    user.vipExpiresAt
      ? new Date(
          user.vipExpiresAt,
        )
      : null;

  const active =
    expiresAt !== null &&
    expiresAt.getTime() >
      Date.now();

  return active
    ? styles.pillGood
    : styles.pillWarn;
}

export default function AdminUsersPage() {
  const { formatUsd } = useCurrency();

  const [search, setSearch] =
    useState("");

  const [
    searchInput,
    setSearchInput,
  ] = useState("");

  const [page, setPage] =
    useState(1);

  const [data, setData] =
    useState<UsersResponse | null>(
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

  const [vipPlan, setVipPlan] =
    useState("VIP 1");

  const [vipMonths, setVipMonths] =
    useState("1");

  const [creditAmount, setCreditAmount] =
    useState("");

  const [creditNote, setCreditNote] =
    useState("");

  const [nameInput, setNameInput] =
    useState("");

  const [roleValue, setRoleValue] =
    useState("ADMIN");

  const [submitting, setSubmitting] =
    useState(false);

  const [
    rowFeedback,
    setRowFeedback,
  ] = useState<{
    userId: number;
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

    if (search.trim() !== "") {
      params.set(
        "search",
        search.trim(),
      );
    }

    fetch(
      `/api/admin/users?${params.toString()}`,
      {
        cache: "no-store",
      },
    )
      .then(async (response) => {
        const payload =
          (await response.json()) as UsersResponse;

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
              "Unable to load users.",
          );
          return;
        }

        setError("");
        setData(payload);
      })
      .catch(() => {
        if (!disposed) {
          setError(
            "Unable to reach the admin users endpoint.",
          );
        }
      });

    return () => {
      disposed = true;
    };
  }, [search, page, refreshKey]);

  function refresh() {
    setRefreshKey(
      (value) => value + 1,
    );
  }

  async function submitUpdateName(
    user: AdminUser,
  ) {
    const name = nameInput.trim();

    if (name === "") {
      setRowFeedback({
        userId: user.id,
        ok: false,
        message:
          "Enter a name.",
      });
      return;
    }

    setSubmitting(true);
    setRowFeedback(null);

    try {
      const response = await fetch(
        "/api/admin/users/update-name",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            targetEmail: user.email,
            name,
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
          userId: user.id,
          ok: false,
          message:
            payload.error
              ?.message ??
            "Could not update the name.",
        });
        return;
      }

      setRowFeedback({
        userId: user.id,
        ok: true,
        message: `Name updated to ${name}.`,
      });

      setOpenAction(null);
      setNameInput("");
      refresh();
    } catch {
      setRowFeedback({
        userId: user.id,
        ok: false,
        message:
          "Network error while updating the name.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function submitUpdateRole(
    user: AdminUser,
  ) {
    setSubmitting(true);
    setRowFeedback(null);

    try {
      const response = await fetch(
        "/api/admin/users/update-role",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            targetEmail: user.email,
            role: roleValue,
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
          userId: user.id,
          ok: false,
          message:
            payload.error
              ?.message ??
            "Could not update the role.",
        });
        return;
      }

      setRowFeedback({
        userId: user.id,
        ok: true,
        message: `Role updated to ${roleValue}.`,
      });

      setOpenAction(null);
      refresh();
    } catch {
      setRowFeedback({
        userId: user.id,
        ok: false,
        message:
          "Network error while updating the role.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function submitGrantVip(
    user: AdminUser,
  ) {
    setSubmitting(true);
    setRowFeedback(null);

    try {
      const response = await fetch(
        "/api/admin/users/grant-vip",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            targetEmail: user.email,
            planName: vipPlan,
            months:
              Number(vipMonths) ||
              1,
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
          userId: user.id,
          ok: false,
          message:
            payload.error
              ?.message ??
            "Could not grant VIP.",
        });
        return;
      }

      setRowFeedback({
        userId: user.id,
        ok: true,
        message: `Granted ${vipPlan} until ${formatDate(
          payload.user
            ?.vipExpiresAt ??
            null,
        )}.`,
      });

      setOpenAction(null);
      refresh();
    } catch {
      setRowFeedback({
        userId: user.id,
        ok: false,
        message:
          "Network error while granting VIP.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function submitCreditWallet(
    user: AdminUser,
  ) {
    const amount = Number(
      creditAmount,
    );

    if (
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      setRowFeedback({
        userId: user.id,
        ok: false,
        message:
          "Enter a valid amount.",
      });
      return;
    }

    setSubmitting(true);
    setRowFeedback(null);

    try {
      const response = await fetch(
        "/api/admin/users/credit-wallet",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            targetEmail: user.email,
            amount,
            note: creditNote,
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
        setRowFeedback({
          userId: user.id,
          ok: false,
          message:
            payload.error
              ?.message ??
            "Could not credit wallet.",
        });
        return;
      }

      setRowFeedback({
        userId: user.id,
        ok: true,
        message: `Wallet balance now ${formatUsd(
          payload.walletBalanceAfter ??
            0,
        )}.`,
      });

      setOpenAction(null);
      setCreditAmount("");
      setCreditNote("");
      refresh();
    } catch {
      setRowFeedback({
        userId: user.id,
        ok: false,
        message:
          "Network error while crediting the wallet.",
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
      <div
        className={styles.toolbar}
      >
        <input
          type="search"
          placeholder="Search by name or email…"
          className={
            styles.searchInput
          }
          value={searchInput}
          onChange={(event) => {
            setSearchInput(
              event.target.value,
            );
          }}
          onKeyDown={(event) => {
            if (
              event.key === "Enter"
            ) {
              setPage(1);
              setSearch(
                searchInput,
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
            setSearch(searchInput);
          }}
        >
          Search
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
          Loading users…
        </p>
      ) : data.users.length ===
        0 ? (
        <p
          className={styles.empty}
        >
          No users match that
          search.
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
                <th>Role</th>
                <th>
                  Wallet balance
                </th>
                <th>
                  AI credits
                </th>
                <th>VIP</th>
                <th>
                  VIP expires
                </th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.users.map(
                (user) => (
                  <Fragment
                    key={user.id}
                  >
                    <tr>
                      <td>
                        {user.name}
                      </td>
                      <td>
                        {
                          user.email
                        }
                      </td>
                      <td>
                        {
                          user.role
                        }
                        {user.isAdmin
                          ? " / ADMIN"
                          : ""}
                      </td>
                      <td>
                        {formatUsd(
                          user.walletBalance,
                        )}
                      </td>
                      <td>
                        {
                          user.aiCredits
                        }
                      </td>
                      <td>
                        <span
                          className={`${styles.pill} ${vipPillClass(
                            user,
                          )}`}
                        >
                          {user.vipTier ??
                            "FREE"}
                        </span>
                      </td>
                      <td>
                        {formatDate(
                          user.vipExpiresAt,
                        )}
                      </td>
                      <td>
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
                              setNameInput(
                                user.name,
                              );
                              setOpenAction(
                                openAction?.userId ===
                                  user.id &&
                                openAction.kind ===
                                  "name"
                                  ? null
                                  : {
                                      userId:
                                        user.id,
                                      kind: "name",
                                    },
                              );
                            }}
                          >
                            Edit name
                          </button>

                          {user.role !==
                          "ROOT" ? (
                            <button
                              type="button"
                              className={
                                styles.rowActionButton
                              }
                              onClick={() => {
                                setRowFeedback(
                                  null,
                                );
                                setRoleValue(
                                  user.isAdmin
                                    ? user.role
                                    : "ADMIN",
                                );
                                setOpenAction(
                                  openAction?.userId ===
                                    user.id &&
                                  openAction.kind ===
                                    "role"
                                    ? null
                                    : {
                                        userId:
                                          user.id,
                                        kind: "role",
                                      },
                                );
                              }}
                            >
                              Change role
                            </button>
                          ) : null}

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
                                openAction?.userId ===
                                  user.id &&
                                openAction.kind ===
                                  "vip"
                                  ? null
                                  : {
                                      userId:
                                        user.id,
                                      kind: "vip",
                                    },
                              );
                            }}
                          >
                            Grant VIP
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
                                openAction?.userId ===
                                  user.id &&
                                openAction.kind ===
                                  "credit"
                                  ? null
                                  : {
                                      userId:
                                        user.id,
                                      kind: "credit",
                                    },
                              );
                            }}
                          >
                            Credit
                            wallet
                          </button>
                        </div>
                      </td>
                    </tr>

                    {openAction?.userId ===
                      user.id &&
                    openAction.kind ===
                      "name" ? (
                      <tr
                        key={`${user.id}-name-form`}
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
                              placeholder="Display name"
                              value={
                                nameInput
                              }
                              onChange={(
                                event,
                              ) => {
                                setNameInput(
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
                                void submitUpdateName(
                                  user,
                                );
                              }}
                            >
                              Confirm
                              name
                            </button>

                            {rowFeedback?.userId ===
                            user.id ? (
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

                    {openAction?.userId ===
                      user.id &&
                    openAction.kind ===
                      "role" ? (
                      <tr
                        key={`${user.id}-role-form`}
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
                            <select
                              value={
                                roleValue
                              }
                              onChange={(
                                event,
                              ) => {
                                setRoleValue(
                                  event
                                    .target
                                    .value,
                                );
                              }}
                            >
                              <option value="USER">
                                USER
                                (remove
                                admin)
                              </option>
                              <option value="WORKER">
                                WORKER
                              </option>
                              <option value="ADMIN">
                                ADMIN
                              </option>
                            </select>

                            <button
                              type="button"
                              disabled={
                                submitting
                              }
                              onClick={() => {
                                void submitUpdateRole(
                                  user,
                                );
                              }}
                            >
                              Confirm
                              role
                            </button>

                            {rowFeedback?.userId ===
                            user.id ? (
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

                    {openAction?.userId ===
                      user.id &&
                    openAction.kind ===
                      "vip" ? (
                      <tr
                        key={`${user.id}-vip-form`}
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
                            <select
                              value={
                                vipPlan
                              }
                              onChange={(
                                event,
                              ) => {
                                setVipPlan(
                                  event
                                    .target
                                    .value,
                                );
                              }}
                            >
                              <option value="VIP 1">
                                VIP 1
                              </option>
                              <option value="VIP 2">
                                VIP 2
                              </option>
                              <option value="VIP 3">
                                VIP 3
                              </option>
                            </select>

                            <input
                              type="number"
                              min={
                                1
                              }
                              max={
                                24
                              }
                              value={
                                vipMonths
                              }
                              onChange={(
                                event,
                              ) => {
                                setVipMonths(
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
                            </span>

                            <button
                              type="button"
                              disabled={
                                submitting
                              }
                              onClick={() => {
                                void submitGrantVip(
                                  user,
                                );
                              }}
                            >
                              Confirm
                              grant
                            </button>

                            {rowFeedback?.userId ===
                            user.id ? (
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

                    {openAction?.userId ===
                      user.id &&
                    openAction.kind ===
                      "credit" ? (
                      <tr
                        key={`${user.id}-credit-form`}
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
                              type="number"
                              min="0.01"
                              step="0.01"
                              placeholder="Amount (USD)"
                              value={
                                creditAmount
                              }
                              onChange={(
                                event,
                              ) => {
                                setCreditAmount(
                                  event
                                    .target
                                    .value,
                                );
                              }}
                              style={{
                                width:
                                  "130px",
                              }}
                            />

                            <input
                              type="text"
                              placeholder="Note (optional)"
                              value={
                                creditNote
                              }
                              onChange={(
                                event,
                              ) => {
                                setCreditNote(
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
                                void submitCreditWallet(
                                  user,
                                );
                              }}
                            >
                              Confirm
                              credit
                            </button>

                            {rowFeedback?.userId ===
                            user.id ? (
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
            {data.total} users)
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
