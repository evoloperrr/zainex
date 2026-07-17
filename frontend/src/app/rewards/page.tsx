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
  error?: {
    message?: string;
  };
};

function NetworkContent() {
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
              "Referral network is unavailable.",
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
            : "Referral network is unavailable.",
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
          <span className={chromeStyles.secure}>
            <i />
            Three-level network
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
              <span> ZAINEX network.</span>
            </h1>

            <p>
              Share your permanent invite link and
              view referrals through Level 1,
              Level 2, and Level 3. Members beyond
              Level 3 are never included.
            </p>
          </div>

          <aside className={styles.depth}>
            <span>NETWORK DEPTH</span>
            <strong>3 Levels</strong>
            <small>Hard backend limit</small>
          </aside>
        </section>

        {loading ? (
          <section className={styles.message}>
            Loading referral network...
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
                    LEVEL {level.level}
                  </span>

                  <strong>
                    {level.count}
                  </strong>

                  <small>
                    {level.level === 1
                      ? "Direct invites"
                      : level.level === 2
                        ? "Second-level members"
                        : "Third-level members"}
                  </small>
                </article>
              ))}

              <article>
                <span>TOTAL NETWORK</span>
                <strong>
                  {payload.totalMembers ?? 0}
                </strong>
                <small>
                  Levels 1-3 only
                </small>
              </article>
            </section>

            <section className={styles.network}>
              <header>
                <div>
                  <span>NETWORK DIRECTORY</span>
                  <h2>
                    Your three referral levels
                  </h2>
                </div>

                <b>
                  LEVEL 4 EXCLUDED
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
                          LEVEL {level.level}
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
                        No members at this level yet.
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
                  Three levels only
                </strong>
                <p>
                  Level 4 and deeper members are not
                  returned or counted.
                </p>
              </div>

              <div>
                <span>03</span>
                <strong>
                  Rewards rules later
                </strong>
                <p>
                  No commission rate has been assumed
                  or credited in this first scope.
                </p>
              </div>
            </section>

            <p className={styles.inviter}>
              Your inviter:
              {" "}
              <strong>
                {payload.inviter
                  ? `${payload.inviter.name} Â· ${payload.inviter.email}`
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