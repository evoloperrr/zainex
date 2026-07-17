import {
  auth,
} from "@/auth";

import Link from "next/link";

import {
  redirect,
} from "next/navigation";

import styles from "./profile.module.css";

// ZAINEX_PROFILE_SETTINGS_PAGE_V1

export default async function ProfilePage() {
  const session = await auth();

  const email =
    session?.user?.email
      ?.trim() ?? "";

  if (!email) {
    redirect("/auth");
  }

  const name =
    session?.user?.name
      ?.trim() ||
    email.split("@")[0] ||
    "ZAINEX Trader";

  const initial =
    name
      .slice(0, 1)
      .toUpperCase() || "Z";

  return (
    <main className={styles.page}>
      <div
        className={styles.glowOne}
        aria-hidden="true"
      />

      <div
        className={styles.glowTwo}
        aria-hidden="true"
      />

      <header className={styles.header}>
        <Link
          href="/"
          className={styles.brand}
        >
          Z<span>AI</span>NEX
        </Link>

        <Link
          href="/"
          className={styles.back}
        >
          Back to terminal
        </Link>
      </header>

      <div className={styles.layout}>
        <aside className={styles.sidebar}>
          <div className={styles.identity}>
            <span className={styles.avatar}>
              {initial}
            </span>

            <div>
              <strong>{name}</strong>
              <small>{email}</small>
            </div>
          </div>

          <nav
            className={styles.navigation}
            aria-label="Profile settings"
          >
            <a href="#account">
              Profile settings
            </a>

            <a href="#security">
              Account & security
            </a>

            <a href="#appearance">
              Appearance
            </a>

            <Link href="/wallet">
              Wallet & credits
            </Link>

            <Link href="/ai-strategies">
              AI strategies
            </Link>

            <Link href="/billing">
              Billing
            </Link>
          </nav>
        </aside>

        <section className={styles.content}>
          <div className={styles.heading}>
            <span>ACCOUNT SETTINGS</span>

            <h1>
              Profile and
              <em> preferences.</em>
            </h1>

            <p>
              Review the Google identity
              connected to your protected
              ZAINEX paper-trading account.
            </p>
          </div>

          <article
            id="account"
            className={styles.card}
          >
            <div className={styles.cardHeading}>
              <div>
                <span>PROFILE</span>
                <h2>Account identity</h2>
              </div>

              <b>CONNECTED</b>
            </div>

            <div className={styles.fields}>
              <div>
                <span>Display name</span>
                <strong>{name}</strong>
              </div>

              <div>
                <span>Google email</span>
                <strong>{email}</strong>
              </div>

              <div>
                <span>Account role</span>
                <strong>ROOT</strong>
              </div>

              <div>
                <span>Trading mode</span>
                <strong>PAPER</strong>
              </div>
            </div>
          </article>

          <article
            id="security"
            className={styles.card}
          >
            <div className={styles.cardHeading}>
              <div>
                <span>SECURITY</span>
                <h2>Account protection</h2>
              </div>

              <b>ACTIVE</b>
            </div>

            <div className={styles.securityRows}>
              <div>
                <span>Authentication</span>
                <strong>
                  Google sign-in only
                </strong>
              </div>

              <div>
                <span>Authorized account</span>
                <strong>{email}</strong>
              </div>

              <div>
                <span>Trading approval</span>
                <strong>
                  Manual approval required
                </strong>
              </div>
            </div>
          </article>

          <article
            id="appearance"
            className={styles.card}
          >
            <div className={styles.cardHeading}>
              <div>
                <span>APPEARANCE</span>
                <h2>Interface preferences</h2>
              </div>

              <b>ZAINEX</b>
            </div>

            <div className={styles.appearance}>
              <div>
                <span>Current theme</span>
                <strong>
                  ZAINEX dark gradient
                </strong>
              </div>

              <div className={styles.themePreview}>
                <i />
                <i />
                <i />
              </div>
            </div>
          </article>

          <section className={styles.quickLinks}>
            <Link href="/wallet">
              <span>WALLET</span>
              <strong>
                Wallet and AI credits
              </strong>
            </Link>

            <Link href="/ai-strategies">
              <span>STRATEGIES</span>
              <strong>
                Active AI strategies
              </strong>
            </Link>

            <Link href="/billing">
              <span>BILLING</span>
              <strong>
                Subscription settings
              </strong>
            </Link>
          </section>
        </section>
      </div>
    </main>
  );
}