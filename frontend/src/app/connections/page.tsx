/* ZAINEX CONNECTIONS STATUS PAGE V1 */

import Link from "next/link";

import {
  DesktopSidebar,
} from "../../components/market-dashboard";

import { SharedProfileMenu } from "@/components/shared-profile-menu";
import { NeuralOrbit } from "@/components/neural-orbit";

import styles from "../billing/billing.module.css";
import connectionsStyles from "./connections.module.css";

const connections = [
  {
    name: "Google Identity",
    description:
      "Verified Google sign-in secures every ZAINEX session.",
    mark: "G",
    gradient: "linear-gradient(145deg, #4285F4, #34A853)",
  },
  {
    name: "Binance market data",
    description:
      "Live and historical BTC/USDT candles power the Crypto terminal and chart.",
    mark: "B",
    gradient: "linear-gradient(145deg, #F0B90B, #F8D33A)",
  },
  {
    name: "Yahoo Finance & Stooq",
    description:
      "Delayed Forex and Stocks candles with a daily-close fallback provider.",
    mark: "Y",
    gradient: "linear-gradient(145deg, #7B4CFF, #B14CFF)",
  },
  {
    name: "OpenAI InteliBrain",
    description:
      "GPT-5-mini reads the deterministic technical snapshot for Spot and Futures signals.",
    mark: "AI",
    gradient: "linear-gradient(145deg, #22d3ee, #6366f1)",
  },
];

function ConnectionsContent() {
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
            All systems online
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
              PLATFORM INTEGRATIONS
            </span>

            <h1>
              Connected
              <span> data sources.</span>
            </h1>

            <p>
              These are the live systems ZAINEX depends on
              for market data, identity, and AI analysis.
              They are managed at the platform level and
              require no setup from you.
            </p>
          </div>
        </section>

        <section className={connectionsStyles.stage}>
          <div className={connectionsStyles.grid}>
            {connections.map((connection) => (
              <article
                key={connection.name}
                className={connectionsStyles.card}
              >
                <span
                  className={connectionsStyles.mark}
                  style={{ background: connection.gradient }}
                  aria-hidden="true"
                >
                  {connection.mark}
                </span>

                <div className={connectionsStyles.body}>
                  <strong>{connection.name}</strong>
                  <span>{connection.description}</span>

                  <span className={connectionsStyles.status}>
                    <i />
                    CONNECTED
                  </span>
                </div>
              </article>
            ))}
          </div>

          <div className={connectionsStyles.orbitCard}>
            <NeuralOrbit
              label="INTEGRATIONS"
              value="4 / 4"
              caption="All platform connections online"
            />
          </div>
        </section>

        <section className={styles.summary}>
          <div>
            <span>MARKET DATA</span>
            <strong>Binance + Yahoo Finance</strong>
          </div>

          <div>
            <span>IDENTITY</span>
            <strong>Google OAuth</strong>
          </div>

          <div>
            <span>AI ENGINE</span>
            <strong>OpenAI GPT-5-mini</strong>
          </div>

          <div>
            <span>USER API KEYS</span>
            <strong>Not required</strong>
          </div>
        </section>
      </div>
    </div>
  );
}

export default function ConnectionsPage() {
  return (
    <main className="zainex-app">
      <div className="desktop-app-frame">
        <DesktopSidebar activeLabel="Connections" />

        <section
          className={`desktop-shell ${styles.desktopContent}`}
        >
          <ConnectionsContent />
        </section>
      </div>

      <div className={styles.mobileContent}>
        <ConnectionsContent />
      </div>
    </main>
  );
}
