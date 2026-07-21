/* ZAINEX AI SIGNALS HUB V1 */

import Link from "next/link";

import {
  DesktopSidebar,
} from "../../components/market-dashboard";

import { SharedProfileMenu } from "@/components/shared-profile-menu";
import { NeuralOrbit } from "@/components/neural-orbit";
import { FuturesAiSignalPanel } from "@/components/futures-ai-signal-panel";
import { SpotAiSignalPanel } from "@/components/spot-ai-signal-panel";

import styles from "../billing/billing.module.css";
import aiSignalsStyles from "./ai-signals.module.css";

function AiSignalsContent() {
  return (
    <div className={styles.page}>
      <div className={styles.glow} aria-hidden="true" />

      <header className={styles.header}>
        <Link href="/dashboard" className={styles.brand}>
          <span className={styles.logo}>Z</span>

          <span className={styles.brandText}>
            <strong className="zainex-wordmark"><span className="zainex-wordmark-silver">Z</span><span className="zainex-wordmark-ai">AI</span><span className="zainex-wordmark-silver">NEX</span></strong>
            <small>AI INTELITRADE</small>
          </span>
        </Link>

        <div className={styles.headerRight}>
          <span className={styles.secure}>
            <i />
            InteliBrain online
          </span>

          <Link href="/market" className={styles.back}>
            Back to terminal
          </Link>

          <SharedProfileMenu />
        </div>
      </header>

      <div className={styles.content}>
        <section className={styles.hero}>
          <div>
            <span className={styles.eyebrow}>
              INTELIBRAIN SIGNAL HUB
            </span>

            <h1>
              Every market.
              <span> One AI desk.</span>
            </h1>

            <p>
              Run InteliBrain on Futures and every Spot
              market from a single page, without switching
              tabs in the terminal. Every signal is manual
              — you approve every trade.
            </p>
          </div>
        </section>

        <section className={aiSignalsStyles.stage}>
          <div className={aiSignalsStyles.summaryCard}>
            <span>HOW TO READ A SIGNAL</span>
            <p>
              Each panel runs the same pipeline: closed
              candles, a deterministic technical score
              (trend, RSI, MACD, ATR, support/resistance),
              then a GPT-5-mini read constrained to that
              score. WAIT is always allowed and is the
              default when signals disagree.
            </p>
          </div>

          <div className={aiSignalsStyles.orbitCard}>
            <NeuralOrbit
              label="AI ENGINE"
              value="4 MARKETS"
              caption="Futures + Crypto + Forex + Stocks"
            />
          </div>
        </section>

        <section className={aiSignalsStyles.grid}>
          <FuturesAiSignalPanel />
          <SpotAiSignalPanel assetClass="crypto" />
          <SpotAiSignalPanel assetClass="forex" />
          <SpotAiSignalPanel assetClass="stocks" />
        </section>
      </div>
    </div>
  );
}

export default function AiSignalsPage() {
  return (
    <main className="zainex-app">
      <div className="desktop-app-frame">
        <DesktopSidebar activeLabel="AI Signals" />

        <section
          className={`desktop-shell ${styles.desktopContent}`}
        >
          <AiSignalsContent />
        </section>
      </div>

      <div className={styles.mobileContent}>
        <AiSignalsContent />
      </div>
    </main>
  );
}
