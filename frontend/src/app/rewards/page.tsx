"use client";

/* ZAINEX_THREE_LEVEL_REFERRALS_V1 */

import Link from "next/link";
import {
  useEffect,
  useState,
} from "react";

import {
  DesktopSidebar,
} from "@/components/market-dashboard";

import {
  SharedProfileMenu,
} from "@/components/shared-profile-menu";

import { CurrencySwitcher } from "@/components/currency-switcher";
import { useCurrency } from "@/components/currency-provider";

import chromeStyles from "../billing/billing.module.css";
import styles from "./rewards.module.css";

type ReferralMember = {
  id: number;
  name: string;
  email: string;
  inviterId: number;
  joinedAt: string | null;
};

type ReferralLevel = {
  level: number;
  count: number;
  members: ReferralMember[];
};

type StrategyIncomeEntry = {
  id: number;
  activationId: number | null;
  sourceUser: {
    id: number;
    name: string;
    email: string;
  } | null;
  tier: string | null;
  tradingAmount: number;
  percentage: number;
  incomeAmount: number;
  walletBalanceAfter: number;
  creditedAt: string | null;
};

type StrategyIncomeReport = {
  ratePercentage: number;
  totalIncome: number;
  creditedActivations: number;
  currency: string;
  recent: StrategyIncomeEntry[];
};

type CreditIncomeEntry = {
  id: number;
  sourceUser: {
    id: number;
    name: string;
    email: string;
  } | null;
  level: number;
  percentage: number;
  baseCredits: number;
  rewardCredits: number;
  balanceAfter: number;
  sourceType: string;
  creditedAt: string | null;
};

type CreditIncomeReport = {
  balance: number;
  totalEarned: number;
  rewardCount: number;
  rates: {
    level1: number;
    level2: number;
    level3: number;
  };
  recent: CreditIncomeEntry[];
};

type ReferralPayload = {
  ok?: boolean;
  maxDepth?: number;
  levelFourIncluded?: boolean;
  referralCode?: string;
  invitePath?: string;
  totalMembers?: number;
  inviter?: {
    id: number;
    name: string;
    email: string;
  } | null;
  levels?: ReferralLevel[];
  strategyIncomeReport?: StrategyIncomeReport;
  creditIncomeReport?: CreditIncomeReport;
  error?: {
    message?: string;
  };
};

function formatCreditAmount(value: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 8,
  }).format(value);
}

function NetworkContent() {
  const { formatUsd } = useCurrency();

  const [
    payload,
    setPayload,
  ] = useState<ReferralPayload | null>(
    null,
  );

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    error,
    setError,
  ] = useState("");

  const [
    copied,
    setCopied,
  ] = useState(false);

  const [
    inviteLink,
    setInviteLink,
  ] = useState("");

  useEffect(() => {
    const controller =
      new AbortController();

    async function load(): Promise<void> {
      try {
        const response =
          await fetch(
            "/api/referrals/network",
            {
              cache: "no-store",
              signal:
                controller.signal,
            },
          );

        const nextPayload =
          (await response.json()) as
            ReferralPayload;

        if (
          !response.ok ||
          nextPayload.ok !== true
        ) {
          throw new Error(
            nextPayload.error
              ?.message ??
              "Referral circle is unavailable.",
          );
        }

        setPayload(nextPayload);

        setInviteLink(
          `${window.location.origin}${
            nextPayload.invitePath ?? ""
          }`,
        );
      }
      catch (caught) {
        if (
          caught instanceof Error &&
          caught.name === "AbortError"
        ) {
          return;
        }

        setError(
          caught instanceof Error
            ? caught.message
            : "Referral circle is unavailable.",
        );
      }
      finally {
        setLoading(false);
      }
    }

    void load();

    return () => {
      controller.abort();
    };
  }, []);

  async function copyInvite(): Promise<void> {
    if (!inviteLink) {
      return;
    }

    try {
      await navigator.clipboard.writeText(
        inviteLink,
      );

      setCopied(true);

      window.setTimeout(
        () => {
          setCopied(false);
        },
        1800,
      );
    }
    catch {
      setCopied(false);
    }
  }

  const levels =
    payload?.levels ?? [];

  return (
    <div className={styles.page}>
      <div
        className={styles.glow}
        aria-hidden="true"
      />

      <header className={chromeStyles.header}>
        <Link
          href="/dashboard"
          className={chromeStyles.brand}
        >
          <span className={chromeStyles.logo}>
            Z
          </span>

          <span className={chromeStyles.brandText}>
            <strong className="zainex-wordmark"><span className="zainex-wordmark-silver">Z</span><span className="zainex-wordmark-ai">AI</span><span className="zainex-wordmark-silver">NEX</span></strong>
            <small>AI INTELITRADE</small>
          </span>
        </Link>

        <div className={chromeStyles.headerRight}>
          <CurrencySwitcher />

          <span className={chromeStyles.secure}>
            <i />
            Three-ring circle
          </span>

          <Link
            href="/market"
            className={chromeStyles.back}
          >
            Back to terminal
          </Link>

          <SharedProfileMenu />
        </div>
      </header>

      <div className={styles.content}>
        <section className={styles.hero}>
          <div>
            <span className={styles.eyebrow}>
              REWARDS & REFERRALS
            </span>

            <h1>
              Grow your
              <span> ZAINEX circle.</span>
            </h1>

            <p>
              Share your permanent invite link and
              view referrals through Ring 1,
              Ring 2, and Ring 3. Members beyond
              Ring 3 are never included. Direct
              inviters earn 10% of every referred
              strategy trading amount.
            </p>
          </div>

          <aside className={styles.depth}>
            <span>CIRCLE DEPTH</span>
            <strong>3 Rings</strong>
            <small>Hard backend limit</small>
          </aside>
        </section>

        {loading ? (
          <section className={styles.message}>
            Loading referral circle...
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

        {!loading && !error && payload ? (
          <>
            <section className={styles.invite}>
              <div>
                <span>PERSONAL INVITE LINK</span>
                <strong>
                  {payload.referralCode ??
                    "--"}
                </strong>
                <small>
                  New accounts created through this
                  link will be permanently assigned
                  to you as direct referrals.
                </small>
              </div>

              <div className={styles.copyArea}>
                <input
                  value={inviteLink}
                  readOnly
                  aria-label="Personal referral invite link"
                />

                <button
                  type="button"
                  onClick={() => {
                    void copyInvite();
                  }}
                  disabled={!inviteLink}
                >
                  {copied
                    ? "Copied"
                    : "Copy link"}
                </button>
              </div>
            </section>

            <section className={styles.metrics}>
              {levels.map((level) => (
                <article key={level.level}>
                  <span>
                    RING {level.level}
                  </span>

                  <strong>
                    {level.count}
                  </strong>

                  <small>
                    {level.level === 1
                      ? "Direct invites"
                      : level.level === 2
                        ? "Second-ring members"
                        : "Third-ring members"}
                  </small>
                </article>
              ))}

              <article>
                <span>TOTAL CIRCLE</span>
                <strong>
                  {payload.totalMembers ?? 0}
                </strong>
                <small>
                  Rings 1-3 only
                </small>
              </article>
            </section>

            <section className={styles.incomeReport}>
              <header className={styles.incomeHeader}>
                <div>
                  <span>STRATEGY REFERRAL INCOME</span>
                  <h2>Direct inviter earnings</h2>
                  <p>
                    One-time 10% wallet income from each new
                    strategy activation made by your direct
                    referrals.
                  </p>
                </div>

                <b>LIVE WALLET LEDGER</b>
              </header>

              <div className={styles.incomeSummary}>
                <article>
                  <span>TOTAL INCOME</span>
                  <strong>
                    {formatUsd(
                      payload.strategyIncomeReport?.totalIncome ?? 0,
                    )}
                  </strong>
                  <small>Credited to your wallet</small>
                </article>

                <article>
                  <span>PAID ACTIVATIONS</span>
                  <strong>
                    {payload.strategyIncomeReport
                      ?.creditedActivations ?? 0}
                  </strong>
                  <small>Duplicate-protected rewards</small>
                </article>

                <article>
                  <span>DIRECT RATE</span>
                  <strong>
                    {payload.strategyIncomeReport
                      ?.ratePercentage ?? 10}%
                  </strong>
                  <small>Based on trading amount</small>
                </article>
              </div>

              <div className={styles.incomeLedger}>
                <div className={styles.incomeLedgerHead}>
                  <strong>Recent income</strong>
                  <span>Latest 10 credits</span>
                </div>

                {(payload.strategyIncomeReport?.recent ?? [])
                  .length === 0 ? (
                  <p className={styles.incomeEmpty}>
                    No strategy referral income yet. A report
                    will appear here after a direct referral
                    activates a strategy.
                  </p>
                ) : (
                  <div className={styles.incomeRows}>
                    {(payload.strategyIncomeReport?.recent ?? []).map(
                      (entry) => (
                        <article key={entry.id}>
                          <div className={styles.incomeMember}>
                            <i>
                              {(entry.sourceUser?.name ?? "R")
                                .slice(0, 1)
                                .toUpperCase()}
                            </i>

                            <div>
                              <strong>
                                {entry.sourceUser?.name ??
                                  "Referral member"}
                              </strong>
                              <small>
                                {entry.sourceUser?.email ??
                                  "Account unavailable"}
                              </small>
                            </div>
                          </div>

                          <div className={styles.incomeBasis}>
                            <span>{entry.tier ?? "STRATEGY"}</span>
                            <strong>
                              {entry.percentage}% of {formatUsd(
                                entry.tradingAmount,
                              )}
                            </strong>
                          </div>

                          <div className={styles.incomeCredit}>
                            <strong>
                              +{formatUsd(entry.incomeAmount)}
                            </strong>
                            <small>
                              Wallet {formatUsd(
                                entry.walletBalanceAfter,
                              )}
                            </small>
                          </div>

                          <time>
                            {entry.creditedAt
                              ? new Intl.DateTimeFormat("en-US", {
                                  month: "short",
                                  day: "2-digit",
                                  year: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                }).format(new Date(entry.creditedAt))
                              : "--"}
                          </time>
                        </article>
                      ),
                    )}
                  </div>
                )}
              </div>
            </section>

            <section
              className={`${styles.incomeReport} ${styles.creditIncomeReport}`}
            >
              <header className={styles.incomeHeader}>
                <div>
                  <span>AI CREDIT REFERRAL INCOME</span>
                  <h2>Three-ring credit rewards</h2>
                  <p>
                    Paid strategy activations reward the chain
                    from the credits consumed: Ring 1 gets 25%,
                    Ring 2 gets 15%, and Ring 3 gets 5%.
                  </p>
                </div>

                <b>REFERRAL CREDIT LEDGER</b>
              </header>

              <div className={styles.incomeSummary}>
                <article>
                  <span>CREDIT BALANCE</span>
                  <strong>
                    {formatCreditAmount(
                      payload.creditIncomeReport?.balance ?? 0,
                    )} credits
                  </strong>
                  <small>Separate referral-credit balance</small>
                </article>

                <article>
                  <span>LIFETIME EARNED</span>
                  <strong>
                    {formatCreditAmount(
                      payload.creditIncomeReport?.totalEarned ?? 0,
                    )} credits
                  </strong>
                  <small>
                    {payload.creditIncomeReport?.rewardCount ?? 0}
                    {" "}reward records
                  </small>
                </article>

                <article>
                  <span>RING RATES</span>
                  <strong className={styles.rateLine}>
                    {payload.creditIncomeReport?.rates.level1 ?? 25}%
                    <i>/</i>
                    {payload.creditIncomeReport?.rates.level2 ?? 15}%
                    <i>/</i>
                    {payload.creditIncomeReport?.rates.level3 ?? 5}%
                  </strong>
                  <small>Ring 1 / Ring 2 / Ring 3</small>
                </article>
              </div>

              <div className={styles.incomeLedger}>
                <div className={styles.incomeLedgerHead}>
                  <strong>Recent credit income</strong>
                  <span>Latest 10 rewards</span>
                </div>

                {(payload.creditIncomeReport?.recent ?? []).length ===
                0 ? (
                  <p className={styles.incomeEmpty}>
                    No credit referral income yet. Rewards will
                    appear here when members in Rings 1-3 use
                    credits to activate a paid strategy.
                  </p>
                ) : (
                  <div className={styles.incomeRows}>
                    {(payload.creditIncomeReport?.recent ?? []).map(
                      (entry) => (
                        <article key={entry.id}>
                          <div className={styles.incomeMember}>
                            <i>
                              {(entry.sourceUser?.name ?? "R")
                                .slice(0, 1)
                                .toUpperCase()}
                            </i>

                            <div>
                              <strong>
                                {entry.sourceUser?.name ??
                                  "Referral member"}
                              </strong>
                              <small>
                                {entry.sourceUser?.email ??
                                  "Account unavailable"}
                              </small>
                            </div>
                          </div>

                          <div className={styles.incomeBasis}>
                            <span>RING {entry.level}</span>
                            <strong>
                              {entry.percentage}% of {formatCreditAmount(
                                entry.baseCredits,
                              )} credits
                            </strong>
                          </div>

                          <div className={styles.incomeCredit}>
                            <strong>
                              +{formatCreditAmount(entry.rewardCredits)}
                              {" "}credits
                            </strong>
                            <small>
                              Balance {formatCreditAmount(
                                entry.balanceAfter,
                              )} credits
                            </small>
                          </div>

                          <time>
                            {entry.creditedAt
                              ? new Intl.DateTimeFormat("en-US", {
                                  month: "short",
                                  day: "2-digit",
                                  year: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                }).format(new Date(entry.creditedAt))
                              : "--"}
                          </time>
                        </article>
                      ),
                    )}
                  </div>
                )}
              </div>
            </section>

            <section className={styles.network}>
              <header>
                <div>
                  <span>CIRCLE DIRECTORY</span>
                  <h2>
                    Your three referral rings
                  </h2>
                </div>

                <b>
                  RING 4 EXCLUDED
                </b>
              </header>

              <div className={styles.levels}>
                {levels.map((level) => (
                  <article
                    key={level.level}
                    className={styles.level}
                  >
                    <div className={styles.levelHead}>
                      <div>
                        <span>
                          RING {level.level}
                        </span>
                        <strong>
                          {level.count} member
                          {level.count === 1
                            ? ""
                            : "s"}
                        </strong>
                      </div>

                      <i>
                        {String(
                          level.level,
                        ).padStart(2, "0")}
                      </i>
                    </div>

                    {level.members.length === 0 ? (
                      <p className={styles.empty}>
                        No members in this ring yet.
                      </p>
                    ) : (
                      <div className={styles.members}>
                        {level.members.map(
                          (member) => (
                            <div
                              key={member.id}
                              className={styles.member}
                            >
                              <span
                                className={styles.initial}
                              >
                                {member.name
                                  .slice(0, 1)
                                  .toUpperCase()}
                              </span>

                              <div>
                                <strong>
                                  {member.name}
                                </strong>
                                <small>
                                  {member.email}
                                </small>
                              </div>

                              <time>
                                {member.joinedAt
                                  ? new Date(
                                      member.joinedAt,
                                    ).toLocaleDateString(
                                      "en-US",
                                    )
                                  : "--"}
                              </time>
                            </div>
                          ),
                        )}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </section>

            <section className={styles.rules}>
              <div>
                <span>01</span>
                <strong>
                  One permanent inviter
                </strong>
                <p>
                  An account can receive an inviter
                  only during its first creation.
                </p>
              </div>

              <div>
                <span>02</span>
                <strong>
                  Three rings only
                </strong>
                <p>
                  Ring 4 and deeper members are not
                  returned or counted.
                </p>
              </div>

              <div>
                <span>03</span>
                <strong>
                  10% direct strategy income
                </strong>
                <p>
                  New strategy activations credit 10%
                  of the trading amount to the direct
                  inviter wallet once.
                </p>
              </div>
            </section>

            <p className={styles.inviter}>
              Your inviter:
              {" "}
              <strong>
                {payload.inviter
                  ? `${payload.inviter.name} · ${payload.inviter.email}`
                  : "No inviter assigned"}
              </strong>
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}

export default function RewardsPage() {
  return (
    <main className="zainex-app">
      <div className="desktop-app-frame">
        <DesktopSidebar
          activeLabel="Rewards"
        />

        <section
          className={`desktop-shell ${styles.desktopContent}`}
        >
          <NetworkContent />
        </section>
      </div>

      <div className={styles.mobileContent}>
        <NetworkContent />
      </div>
    </main>
  );
}
