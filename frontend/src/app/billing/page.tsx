/* ZAINEX_BILLING_PRICES_STRATEGY_TIERS_V2_1 */
/* ZAINEX DEDICATED BILLING V4 */

import Link from "next/link";
import { DesktopSidebar } from "../../components/market-dashboard";
import { SharedProfileMenu } from "@/components/shared-profile-menu";

import styles from "./billing.module.css";

const plans = [
  {
    name: "FREE TIER",
    price: "$0",
    period: "Free access",
    description:
      "Explore the core AI Intelitrade terminal before upgrading.",
    features: [
      "Core trading dashboard",
      "Basic AI signal previews",
      "Standard watchlist access",
      "Community market updates",
    ],
    action: "Current plan",
    current: true,
    featured: false,
  },
  {
    name: "VIP 1",
    price: "$5",
    period: "per month",
    description:
      "Starter intelligence for clearer market context and daily guidance.",
    features: [
      "Enhanced AI market insights",
      "Personal asset watchlist",
      "Basic strategy summaries",
      "Standard signal alerts",
    ],
    action: "Choose VIP 1",
    current: false,
    featured: false,
  },
  {
    name: "VIP 2",
    price: "$15",
    period: "per month",
    description:
      "Advanced intelligence for active traders requiring deeper analysis.",
    features: [
      "Advanced AI signal filtering",
      "Expanded market intelligence",
      "Priority strategy tools",
      "Faster signal notifications",
    ],
    action: "Choose VIP 2",
    current: false,
    featured: true,
  },
  {
    name: "VIP 3",
    price: "$45",
    period: "per month",
    description:
      "Elite AI Intelitrade access with maximum limits and priority service.",
    features: [
      "Elite AI trade intelligence",
      "Complete strategy access",
      "Maximum signal limits",
      "Premium support priority",
    ],
    action: "Choose VIP 3",
    current: false,
    featured: false,
  },
];

function CardIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="5.5" width="18" height="13" rx="2.7" />
      <path d="M3 9.5h18" />
      <path d="M7 14h3.5" />
      <circle cx="16.5" cy="14" r="1.5" />
    </svg>
  );
}

function BillingContent() {
  return (
    <div className={styles.page}>
      <div className={styles.glow} aria-hidden="true" />

      <header className={styles.header}>
        <Link href="/" className={styles.brand}>
          <span className={styles.logo}>Z</span>

          <span className={styles.brandText}>
            <strong className="zainex-wordmark"><span className="zainex-wordmark-silver">Z</span><span className="zainex-wordmark-ai">AI</span><span className="zainex-wordmark-silver">NEX</span></strong>
            <small>AI INTELITRADE</small>
          </span>
        </Link>

        <div className={styles.headerRight}>
          <span className={styles.secure}>
            <i />
            Secure billing
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
              <CardIcon />
              AI INTELITRADE SUBSCRIPTIONS
            </span>

            <h1>
              Unlock smarter
              <span> trading intelligence.</span>
            </h1>

            <p>
              Choose the access level that matches your trading
              workflow. Benefits are temporary preview content
              until the payment system is connected.
            </p>
          </div>

          <aside className={styles.current}>
            <span>CURRENT ACCESS</span>
            <strong>FREE TIER</strong>
            <small>Core terminal enabled</small>

            <div>
              <i />
            </div>
          </aside>
        </section>

        <section
          className={styles.plans}
          aria-label="AI Intelitrade subscription plans"
        >
          {plans.map((plan) => (
            <article
              key={plan.name}
              className={`${styles.card} ${
                plan.featured ? styles.featured : ""
              }`}
            >
              {plan.featured ? (
                <span className={styles.badge}>
                  MOST POPULAR
                </span>
              ) : null}

              <span className={styles.planName}>
                {plan.name}
              </span>

              <div className={styles.price}>
                <strong>{plan.price}</strong>
                <small>{plan.period}</small>
              </div>

              <p>{plan.description}</p>

              <div className={styles.divider} />

              <ul>
                {plan.features.map((feature) => (
                  <li key={feature}>
                    <span>{"\u2713"}</span>
                    {feature}
                  </li>
                ))}
              </ul>

              <button
                type="button"
                disabled={plan.current}
                className={
                  plan.current ? styles.currentButton : ""
                }
              >
                {plan.action}
              </button>
            </article>
          ))}
        </section>

        <section className={styles.summary}>
          <div>
            <span>PAYMENT STATUS</span>
            <strong>Preview mode</strong>
          </div>

          <div>
            <span>BILLING CYCLE</span>
            <strong>Monthly</strong>
          </div>

          <div>
            <span>SUPPORTED MARKETS</span>
            <strong>Crypto, Forex and Stocks</strong>
          </div>

          <div>
            <span>UPGRADE ACCESS</span>
            <strong>Instant after payment</strong>
          </div>
        </section>
      </div>
    </div>
  );
}

export default function BillingPage() {
  return (
    <main className="zainex-app">
      <div className="desktop-app-frame">
        <DesktopSidebar activeLabel="Billing" />

        <section
          className={`desktop-shell ${styles.desktopContent}`}
        >
          <BillingContent />
        </section>
      </div>

      <div className={styles.mobileContent}>
        <BillingContent />
      </div>
    </main>
  );
}