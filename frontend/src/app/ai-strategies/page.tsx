/* ZAINEX_STRATEGY_ACTIVATION_FRONTEND_V2_3 */
/* ZAINEX_BILLING_PRICES_STRATEGY_TIERS_V2_1 */
/* ZAINEX AI STRATEGY CARDS V2 */

import Link from "next/link";

import {
  DesktopSidebar,
} from "../../components/market-dashboard";

import { CurrencySwitcher } from "@/components/currency-switcher";
import { SharedProfileMenu } from "@/components/shared-profile-menu";

import styles from "../billing/billing.module.css";
import {
  StrategyActivationGrid,
} from "./strategy-activation-grid";

function AiStrategiesContent() {
  return (
    <div className={styles.page}>
      <div
        className={styles.glow}
        aria-hidden="true"
      />

      <header className={styles.header}>
        <Link
          href="/market"
          className={styles.brand}
        >
          <span className={styles.logo}>
            Z
          </span>

          <span className={styles.brandText}>
            <strong className="zainex-wordmark"><span className="zainex-wordmark-silver">Z</span><span className="zainex-wordmark-ai">AI</span><span className="zainex-wordmark-silver">NEX</span></strong>
            <small>AI INTELITRADE</small>
          </span>
        </Link>

        <div className={styles.headerRight}>
          <CurrencySwitcher />

          <span className={styles.secure}>
            <i />
            AI strategies
          </span>

          <Link
            href="/market"
            className={styles.back}
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
              AI TRADING INTELLIGENCE
            </span>

            <h1>
              AI
              <span> Strategies.</span>
            </h1>
          </div>
        </section>

        <StrategyActivationGrid />
      </div>
    </div>
  );
}

export default function AiStrategiesPage() {
  return (
    <main className="zainex-app">
      <div className="desktop-app-frame">
        <DesktopSidebar
          activeLabel="AI Strategies"
        />

        <section
          className={`desktop-shell ${styles.desktopContent}`}
        >
          <AiStrategiesContent />
        </section>
      </div>

      <div className={styles.mobileContent}>
        <AiStrategiesContent />
      </div>
    </main>
  );
}