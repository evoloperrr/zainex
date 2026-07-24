"use client";

/* ZAINEX_WALLET_AI_CREDITS_ROUTE_V1_3 */

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import Link from "next/link";

import {
  DesktopSidebar,
} from "../../components/market-dashboard";

import { CurrencySwitcher } from "@/components/currency-switcher";
import { useCurrency } from "@/components/currency-provider";
import { SharedProfileMenu } from "@/components/shared-profile-menu";
import { WalletActionCenter } from "@/components/wallet-action-center";
import { AdminWalletTransfer } from "@/components/admin-wallet-transfer";

import styles from "./wallet.module.css";

type WalletUser = {
  id: number;
  name: string;
  email: string;
  role: string;
  isAdmin: boolean;
  avatarUrl: string | null;
  walletBalance: number;
  credits: number;
};

type CurrentStrategyResponse = {
  ok: boolean;
  currentStrategy?: {
    tier?: string;
    defaulted?: boolean;
    activatedAt?: string | null;
  };
};

type WalletAccount = {
  currency: string;
  initialBalance: number;
  availableBalance: number;
  usedMargin: number;
  strategyLocked: number;
  cashoutLocked: number;
  totalEquity: number;
  realizedPnl: number;
  unrealizedPnl: number;
  user: WalletUser | null;
  storage: {
    kind: string;
    durable: boolean;
  };
};

type WalletResponse = {
  ok: boolean;
  account?: WalletAccount;
  error?: {
    message?: string;
  };
};

/* ZAINEX_WALLET_GOOGLE_IDENTITY_V1 */
type GoogleSessionResponse = {
  user?: {
    name?: string | null;
    email?: string | null;
  };
};
function formatActivatedAt(
  value: string | null,
): string {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString(
    "en-US",
    {
      month: "short",
      day: "2-digit",
      year: "numeric",
    },
  );
}

function getInitials(
  name: string | null | undefined,
): string {
  const parts = (name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) {
    return "ZT";
  }

  if (parts.length === 1) {
    return parts[0]
      .slice(0, 1)
      .toUpperCase();
  }

  return (
    parts[0][0] +
    parts[parts.length - 1][0]
  ).toUpperCase();
}

type WalletContentProps = {
  mountActionCenter?: boolean;
};

function WalletContent({
  mountActionCenter = true,
}: WalletContentProps) {
  const {
    formatUsd: formatDisplayCurrency,
    formatCredits,
  } = useCurrency();

  function formatUsd(
    value: number | null | undefined,
  ): string {
    const safeValue =
      typeof value === "number" &&
      Number.isFinite(value)
        ? value
        : 0;

    return formatDisplayCurrency(
      safeValue,
    );
  }

  const [account, setAccount] =
    useState<WalletAccount | null>(null);

  const [
    currentStrategyTier,
    setCurrentStrategyTier,
  ] = useState<string | null>(null);

  const [
    currentStrategyActivatedAt,
    setCurrentStrategyActivatedAt,
  ] = useState<string | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [
    googleIdentity,
    setGoogleIdentity,
  ] = useState({
    name: "",
    email: "",
  });

  useEffect(() => {
    let disposed = false;

    async function loadGoogleIdentity() {
      try {
        const response = await fetch(
          "/api/auth/session",
          {
            cache: "no-store",
            credentials:
              "same-origin",
          },
        );

        if (!response.ok) {
          return;
        }

        const payload =
          (await response.json()) as
            GoogleSessionResponse;

        if (disposed) {
          return;
        }

        setGoogleIdentity({
          name:
            payload.user?.name
              ?.trim() || "",
          email:
            payload.user?.email
              ?.trim() || "",
        });
      } catch {
        // Keep the Google identity
        // loading placeholders.
      }
    }

    void loadGoogleIdentity();

    return () => {
      disposed = true;
    };
  }, []);
  useEffect(() => {
    let disposed = false;

    async function loadWallet() {
      try {
        const response = await fetch(
          "/api/trading/futures/account",
          {
            cache: "no-store",
          },
        );

        const payload =
          (await response.json()) as WalletResponse;

        if (
          !response.ok ||
          !payload.ok ||
          !payload.account
        ) {
          throw new Error(
            payload.error?.message ??
              "Unable to load wallet.",
          );
        }

        if (!disposed) {
          setAccount(payload.account);
          setError("");
        }
      } catch (walletError) {
        if (!disposed) {
          setError(
            walletError instanceof Error
              ? walletError.message
              : "Unable to load wallet.",
          );
        }
      } finally {
        if (!disposed) {
          setLoading(false);
        }
      }
    }

    void loadWallet();

    const timer = window.setInterval(
      () => {
        void loadWallet();
      },
      5000,
    );

    const handleWalletChanged = () => {
      void loadWallet();
    };

    window.addEventListener(
      "zainex:wallet-data-changed",
      handleWalletChanged,
    );

    return () => {
      disposed = true;
      window.clearInterval(timer);

      window.removeEventListener(
        "zainex:wallet-data-changed",
        handleWalletChanged,
      );
    };
  }, []);

  useEffect(() => {
    let disposed = false;

    async function loadCurrentStrategy() {
      try {
        const response = await fetch(
          "/api/trading/futures/strategies/current",
          {
            cache: "no-store",
          },
        );

        const payload =
          (await response.json()) as CurrentStrategyResponse;

        if (
          disposed ||
          !response.ok ||
          !payload.ok
        ) {
          return;
        }

        setCurrentStrategyTier(
          payload.currentStrategy
            ?.defaulted
            ? null
            : payload.currentStrategy
                ?.tier ?? null,
        );

        setCurrentStrategyActivatedAt(
          payload.currentStrategy
            ?.activatedAt ?? null,
        );
      } catch {
        // Keep whatever tier was last
        // successfully loaded.
      }
    }

    void loadCurrentStrategy();

    const timer = window.setInterval(
      () => {
        void loadCurrentStrategy();
      },
      5000,
    );

    const handleWalletChanged = () => {
      void loadCurrentStrategy();
    };

    window.addEventListener(
      "zainex:wallet-data-changed",
      handleWalletChanged,
    );

    return () => {
      disposed = true;
      window.clearInterval(timer);

      window.removeEventListener(
        "zainex:wallet-data-changed",
        handleWalletChanged,
      );
    };
  }, []);

  const user = account?.user ?? null;

  const initials = useMemo(
    () => getInitials(user?.name),
    [user?.name],
  );

  return (
    <div className={styles.page}>
      <div
        className={styles.glow}
        aria-hidden="true"
      />

      <header className={styles.header}>
        <Link href="/" className={styles.brand}>
          <span className={styles.logo}>Z</span>

          <span className={styles.brandText}>
            <strong className="zainex-wordmark"><span className="zainex-wordmark-silver">Z</span><span className="zainex-wordmark-ai">AI</span><span className="zainex-wordmark-silver">NEX</span></strong>
            <small>AI INTELITRADE</small>
          </span>
        </Link>

        <div className={styles.headerRight}>
          <CurrencySwitcher />

          <span className={styles.connected}>
            <i />
            Database wallet connected
          </span>

          <Link href="/" className={styles.back}>
            Back to terminal
          </Link>

          <SharedProfileMenu />
        </div>
      </header>

      <div className={styles.content}>
        <section className={styles.hero}>
          <div>
            <span className={styles.eyebrow}>
              WALLET AND AI CREDITS
            </span>

            <h1>
              Your connected
              <span> ZAINEX wallet.</span>
            </h1>

            <p>
              View your Futures wallet,
              available funds, total equity, margin,
              profit and loss, and separate AI credits.
            </p>
          </div>

          <aside className={styles.identity}>
            <span>ACTIVE ACCOUNT</span>

            <strong>
              {googleIdentity.name || "Loading Google user"}
            </strong>

            <small>
              {googleIdentity.email || "Resolving Google session"}
            </small>

            <div>
              <i />
            </div>
          </aside>
        </section>

        {loading ? (
          <section className={styles.message}>
            Loading wallet and credits...
          </section>
        ) : null}

        {!loading && error ? (
          <section
            className={`${styles.message} ${styles.error}`}
            role="alert"
          >
            {error}
          </section>
        ) : null}

        {!loading && !error && account ? (
          <>
            {/* ZAINEX_ROOT_ADMIN_WALLET_TRANSFER_V1 */}
            <AdminWalletTransfer
              isAdmin={
                user?.isAdmin === true
              }
              availableBalance={
                account.availableBalance
              }
            />

            <section className={styles.cards}>
              <article className={styles.walletCard}>
                <span>WALLET BALANCE</span>
                <strong>
                  {formatUsd(
                    account.availableBalance,
                  )}
                </strong>
                <small>
                  What you can spend right now —
                  funds locked in an active strategy
                  or a pending cashout are already
                  set aside and excluded here
                </small>

                <div className={styles.cardActionRow}>
                  <button
                    type="button"
                    className={styles.cardAction}
                    aria-label="Convert wallet funds to AI credits"
                    onClick={() => {
                      window.dispatchEvent(
                        new CustomEvent(
                          "zainex:open-wallet-action",
                          {
                            detail: "convert",
                          },
                        ),
                      );
                    }}
                  >
                    <i aria-hidden="true">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                      >
                        <path d="M7 7h10" />
                        <path d="m14 4 3 3-3 3" />
                        <path d="M17 17H7" />
                        <path d="m10 14-3 3 3 3" />
                      </svg>
                    </i>

                    <span>Convert</span>
                  </button>

                  <button
                    type="button"
                    className={styles.cardAction}
                    aria-label="Request a wallet cashout"
                    onClick={() => {
                      window.dispatchEvent(
                        new CustomEvent(
                          "zainex:open-wallet-action",
                          {
                            detail: "cashout",
                          },
                        ),
                      );
                    }}
                  >
                    <i aria-hidden="true">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                      >
                        <path d="M12 4v16" />
                        <path d="m7 9 5-5 5 5" />
                        <path d="M5 20h14" />
                      </svg>
                    </i>

                    <span>Cash out</span>
                  </button>
                </div>
              </article>

              <article
                className={`${styles.walletCard} ${styles.creditCard}`}
              >
                <span>AI CREDITS</span>
                <strong>
                  {formatCredits(user?.credits)}
                </strong>
                <small>
                  Separate from your trading funds
                </small>

                <button
                  type="button"
                  className={styles.cardAction}
                  aria-label="Transfer AI credits by email"
                  onClick={() => {
                    window.dispatchEvent(
                      new CustomEvent(
                        "zainex:open-wallet-action",
                        {
                          detail: "transfer",
                        },
                      ),
                    );
                  }}
                >
                  <i aria-hidden="true">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                    >
                      <path d="M5 12h13" />
                      <path d="m14 8 4 4-4 4" />
                      <circle cx="6" cy="6" r="2.5" />
                      <circle cx="18" cy="18" r="2.5" />
                    </svg>
                  </i>

                  <span>Transfer</span>
                </button>
              </article>

              <article className={styles.walletCard}>
                <span>TOTAL EQUITY</span>
                <strong>
                  {formatUsd(account.totalEquity)}
                </strong>
                <small>
                  Your full account value — wallet
                  balance plus funds locked in active
                  strategies, a pending cashout, and
                  any open Futures PnL
                </small>
              </article>
            </section>

            <section className={styles.metrics}>
              <div>
                <span>INITIAL BALANCE</span>
                <strong>
                  {formatUsd(account.initialBalance)}
                </strong>
              </div>

              <div>
                <span>USED MARGIN</span>
                <strong>
                  {formatUsd(account.usedMargin)}
                </strong>
              </div>

              <div>
                <span>IN ACTIVE STRATEGIES</span>
                <strong>
                  {formatUsd(
                    account.strategyLocked,
                  )}
                </strong>
              </div>

              <div>
                <span>PENDING CASHOUT</span>
                <strong>
                  {formatUsd(
                    account.cashoutLocked,
                  )}
                </strong>
              </div>

              <div>
                <span>REALIZED PNL</span>
                <strong
                  className={
                    account.realizedPnl > 0
                      ? styles.positive
                      : account.realizedPnl < 0
                        ? styles.negative
                        : ""
                  }
                >
                  {formatUsd(account.realizedPnl)}
                </strong>
              </div>

              <div>
                <span>UNREALIZED PNL</span>
                <strong
                  className={
                    account.unrealizedPnl > 0
                      ? styles.positive
                      : account.unrealizedPnl < 0
                        ? styles.negative
                        : ""
                  }
                >
                  {formatUsd(
                    account.unrealizedPnl,
                  )}
                </strong>
              </div>
            </section>

            <section className={styles.metrics}>
              <div>
                <span>ACCOUNT ROLE</span>
                <strong>
                  {user?.isAdmin
                    ? `${user.role} / ADMIN`
                    : user?.role ?? "-"}
                </strong>
              </div>

              <div>
                <span>VIP TIER</span>
                <strong
                  className={
                    currentStrategyTier
                      ? styles.positive
                      : ""
                  }
                >
                  {currentStrategyTier ??
                    "FREE"}
                </strong>
              </div>

              {currentStrategyTier ? (
                <div>
                  <span>
                    STRATEGY ACTIVATED
                  </span>
                  <strong>
                    {formatActivatedAt(
                      currentStrategyActivatedAt,
                    )}
                  </strong>
                </div>
              ) : null}

              <div>
                <span>CURRENCY</span>
                <strong>{account.currency}</strong>
              </div>

              <div>
                <span>STORAGE</span>
                <strong>
                  {account.storage.kind}
                </strong>
              </div>

              <div>
                <span>DURABILITY</span>
                <strong>
                  {account.storage.durable
                    ? "Database durable"
                    : "Not durable"}
                </strong>
              </div>
            </section>

            {mountActionCenter ? (
              <WalletActionCenter
                walletBalance={
                  user?.walletBalance ?? 0
                }
                availableBalance={
                  account.availableBalance
                }
                credits={
                  user?.credits ?? 0
                }
              />
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

export default function WalletPage() {
  return (
    <main className="zainex-app">
      <div className="desktop-app-frame">
        <DesktopSidebar activeLabel="Wallets" />

        <section
          className={`desktop-shell ${styles.desktopContent}`}
        >
          <WalletContent mountActionCenter />
        </section>
      </div>

      <div className={styles.mobileContent}>
        <WalletContent mountActionCenter={false} />
      </div>
    </main>
  );
}