import {
  auth,
  signIn,
} from "@/auth";

import Link from "next/link";

import {
  redirect,
} from "next/navigation";

import styles from "./auth.module.css";

// ZAINEX_GOOGLE_AUTH_A2
// ZAINEX_THREE_LEVEL_REFERRALS_V1
// ZAINEX_PREMIUM_ANIMATED_AUTH_UI_V1

type AuthPageProps = {
  searchParams: Promise<{
    ref?: string | string[];
    error?: string | string[];
  }>;
};

function firstParameter(
  value: string | string[] | undefined,
): string {
  return Array.isArray(value)
    ? value[0] ?? ""
    : value ?? "";
}

function normalizeReferralCode(
  value: string | string[] | undefined,
): string {
  const normalized =
    firstParameter(value)
      .trim()
      .toUpperCase();

  return /^[A-Z0-9]{6,32}$/.test(
    normalized,
  )
    ? normalized
    : "";
}

export default async function AuthPage({
  searchParams,
}: AuthPageProps) {
  const parameters =
    await searchParams;

  const referralCode =
    normalizeReferralCode(
      parameters.ref,
    );

  const errorCode =
    firstParameter(
      parameters.error,
    ).trim();

  const provisioningFailed =
    errorCode ===
    "ProvisioningFailed";

  const linkTarget =
    referralCode
      ? `/api/auth/zainex-link?ref=${encodeURIComponent(
          referralCode,
        )}`
      : "/api/auth/zainex-link";

  const session = await auth();

  const email =
    session?.user?.email
      ?.trim()
      .toLowerCase() ?? "";

  if (email !== "" && !provisioningFailed) {
    redirect(linkTarget);
  }

  return (
    <main className={styles.page}>
      <div
        className={styles.grid}
        aria-hidden="true"
      />

      <div
        className={styles.noise}
        aria-hidden="true"
      />

      <div
        className={styles.auroraOne}
        aria-hidden="true"
      />

      <div
        className={styles.auroraTwo}
        aria-hidden="true"
      />

      <div
        className={styles.beam}
        aria-hidden="true"
      />

      <div
        className={styles.particles}
        aria-hidden="true"
      >
        {Array.from({
          length: 14,
        }).map((_, index) => (
          <span key={index} />
        ))}
      </div>

      <section className={styles.shell}>
        <div className={styles.experience}>
          <header className={styles.topline}>
            <Link
              href="/"
              className={styles.brand}
              aria-label="ZAINEX home"
            >
              <span className={styles.brandMark}>
                Z
              </span>

              <span className={styles.brandCopy}>
                <strong className="zainex-wordmark"><span className="zainex-wordmark-silver">Z</span><span className="zainex-wordmark-ai">AI</span><span className="zainex-wordmark-silver">NEX</span></strong>

                <small>
                  INTELLIGENT MARKET SYSTEM
                </small>
              </span>
            </Link>

            <div className={styles.systemState}>
              <i />

              <span>
                SYSTEM ONLINE
              </span>
            </div>
          </header>

          <div className={styles.hero}>
            <p className={styles.eyebrow}>
              AUTHENTICATED INTELLIGENCE
            </p>

            <h1>
              Enter the command layer for
              <span>
                {" "}
                disciplined AI trading.
              </span>
            </h1>

            <p className={styles.heroCopy}>
              One verified identity connects your
              private paper wallet, deterministic
              risk controls, referral network, and
              manual execution environment.
            </p>
          </div>

          <div className={styles.capabilities}>
            <article>
              <span>01</span>

              <div>
                <strong>
                  Verified identity
                </strong>

                <small>
                  Google-authenticated access
                </small>
              </div>
            </article>

            <article>
              <span>02</span>

              <div>
                <strong>
                  Private environment
                </strong>

                <small>
                  Isolated wallet and session
                </small>
              </div>
            </article>

            <article>
              <span>03</span>

              <div>
                <strong>
                  Manual authority
                </strong>

                <small>
                  No autonomous execution
                </small>
              </div>
            </article>
          </div>

          <div
            className={styles.visualStage}
            aria-hidden="true"
          >
            <div className={styles.scanLine} />

            <div className={styles.routeOne} />
            <div className={styles.routeTwo} />
            <div className={styles.routeThree} />

            <div className={styles.orbit}>
              <div className={styles.ringOne} />
              <div className={styles.ringTwo} />
              <div className={styles.ringThree} />

              <div className={styles.core}>
                <span className={styles.coreMark}>
                  AI
                </span>

                <span className={styles.coreCopy}>
                  <strong>
                    ZAINEX
                  </strong>

                  <small>
                    INTELIBRAIN
                  </small>
                </span>
              </div>

              <span
                className={`${styles.node} ${styles.nodeOne}`}
              />

              <span
                className={`${styles.node} ${styles.nodeTwo}`}
              />

              <span
                className={`${styles.node} ${styles.nodeThree}`}
              />

              <span
                className={`${styles.node} ${styles.nodeFour}`}
              />
            </div>

            <div className={styles.marketStrip}>
              <span>
                7 CRYPTO PAIRS
                <strong>LIVE DATA</strong>
              </span>

              <span>
                RISK GATE
                <strong>ENFORCED</strong>
              </span>

              <span>
                EXECUTION
                <strong>MANUAL</strong>
              </span>
            </div>
          </div>
        </div>

        <aside className={styles.access}>
          <div className={styles.accessInner}>
            <div className={styles.accessHeader}>
              <span>
                SECURE ACCESS
              </span>

              <b>
                01
              </b>
            </div>

            <p className={styles.accessEyebrow}>
              ZAINEX AUTHENTICATION
            </p>

            <h2>
              Continue to your
              <span> intelligence workspace.</span>
            </h2>

            <p className={styles.accessCopy}>
              Sign in using your authorized Google
              identity. ZAINEX will resolve your
              private account and protected session.
            </p>

            {referralCode ? (
              <div className={styles.referral}>
                <span className={styles.referralIcon}>
                  R
                </span>

                <div>
                  <small>
                    REFERRAL INVITE DETECTED
                  </small>

                  <strong>
                    {referralCode}
                  </strong>
                </div>

                <i />
              </div>
            ) : null}

            {provisioningFailed ? (
              <div
                className={styles.error}
                role="alert"
              >
                <span>!</span>

                <p>
                  ZAINEX could not finish account
                  provisioning. Please retry the
                  secure Google sign-in.
                </p>
              </div>
            ) : null}

            <form
              className={styles.form}
              action={async () => {
                "use server";

                await signIn(
                  "google",
                  {
                    redirectTo:
                      linkTarget,
                  },
                );
              }}
            >
              <button
                type="submit"
                className={styles.googleButton}
              >
                <span className={styles.googleIcon}>
                  <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      fill="#4285F4"
                      d="M21.8 10.2h-9.6v3.9h5.5c-.5 2.5-2.6 3.9-5.5 3.9a6 6 0 1 1 0-12c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 1 0 22 12c0-.6-.1-1.2-.2-1.8Z"
                    />
                  </svg>
                </span>

                <span className={styles.buttonCopy}>
                  <strong>
                    Sign in with Google
                  </strong>

                  <small>
                    Continue securely
                  </small>
                </span>


              </button>
            </form>

            <div className={styles.divider}>
              <span />
              <small>
                PROTECTED WORKSPACE
              </small>
              <span />
            </div>

            <div className={styles.securityList}>
              <article>
                <span className={styles.securityIcon}>
                  01
                </span>

                <div>
                  <strong>
                    Identity protected
                  </strong>

                  <small>
                    Verified Google account
                  </small>
                </div>

                <i />
              </article>

              <article>
                <span className={styles.securityIcon}>
                  02
                </span>

                <div>
                  <strong>
                    Session isolated
                  </strong>

                  <small>
                    Private account boundary
                  </small>
                </div>

                <i />
              </article>

              <article>
                <span className={styles.securityIcon}>
                  03
                </span>

                <div>
                  <strong>
                    Execution controlled
                  </strong>

                  <small>
                    Manual approval required
                  </small>
                </div>

                <i />
              </article>
            </div>

            <p className={styles.finePrint}>
              By continuing, you enter a paper-trading
              environment. ZAINEX does not execute
              autonomous live trades.
            </p>

            <Link
              href="/"
              className={styles.backLink}
            >
              <span>&lt;-</span>
              Return to ZAINEX overview
            </Link>
          </div>
        </aside>
      </section>
    </main>
  );
}