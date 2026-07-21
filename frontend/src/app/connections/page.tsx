/* ZAINEX CONNECTIONS STATUS PAGE V1 */

import Link from "next/link";

import {
  DesktopSidebar,
} from "../../components/market-dashboard";

import { SharedProfileMenu } from "@/components/shared-profile-menu";
import { NeuralOrbit } from "@/components/neural-orbit";

import styles from "../billing/billing.module.css";
import connectionsStyles from "./connections.module.css";

const connections: Array<{
  name: string;
  description: string;
  mark: string;
  gradient: string;
  status: "connected" | "pending";
}> = [
  {
    name: "Google Identity",
    description:
      "Verified Google sign-in secures every ZAINEX session.",
    mark: "G",
    gradient: "linear-gradient(145deg, #4285F4, #34A853)",
    status: "connected",
  },
  {
    name: "Binance market data",
    description:
      "Live and historical candles across BTC, ETH, SOL, BNB, XRP, ADA and DOGE power the Crypto terminal and chart.",
    mark: "B",
    gradient: "linear-gradient(145deg, #F0B90B, #F8D33A)",
    status: "connected",
  },
  {
    name: "Yahoo Finance & Stooq",
    description:
      "Delayed Forex and Stocks candles with a daily-close fallback provider.",
    mark: "Y",
    gradient: "linear-gradient(145deg, #7B4CFF, #B14CFF)",
    status: "connected",
  },
  {
    name: "GPT-5.1 (OpenAI)",
    description:
      "OpenAI's flagship model reads the deterministic technical snapshot for Spot and Futures signals.",
    mark: "AI",
    gradient: "linear-gradient(145deg, #22d3ee, #6366f1)",
    status: "connected",
  },
  {
    name: "Claude Sonnet 4.5 (Anthropic)",
    description:
      "Adds an independent InteliBrain read alongside GPT-5.1 for cross-checked signals.",
    mark: "C",
    gradient: "linear-gradient(145deg, #d97757, #c2542f)",
    status: "pending",
  },
  {
    name: "Gemini 3 Pro (Google)",
    description:
      "Google's Gemini contributes a second opinion to every InteliBrain signal.",
    mark: "Ge",
    gradient: "linear-gradient(145deg, #4285F4, #9b72cb)",
    status: "pending",
  },
  {
    name: "Grok 4.20 (xAI)",
    description:
      "xAI's latest Grok model adds a real-time market read to InteliBrain.",
    mark: "X",
    gradient: "linear-gradient(145deg, #3a3a3a, #0a0a0a)",
    status: "pending",
  },
  {
    name: "Grok 4 (xAI)",
    description:
      "xAI's Grok 4 model provides an additional InteliBrain signal opinion.",
    mark: "X",
    gradient: "linear-gradient(145deg, #55565a, #232326)",
    status: "pending",
  },
  {
    name: "DeepSeek Chat V3.1 (DeepSeek)",
    description:
      "Adds a cost-efficient, independent InteliBrain read to the signal mix.",
    mark: "D",
    gradient: "linear-gradient(145deg, #2f6fed, #1743a3)",
    status: "pending",
  },
  {
    name: "Qwen3-Max (Alibaba)",
    description:
      "Alibaba's Qwen3-Max model contributes another InteliBrain signal perspective.",
    mark: "Q",
    gradient: "linear-gradient(145deg, #7b4cff, #b14cff)",
    status: "pending",
  },
  {
    name: "Kimi K2 Thinking (Moonshot AI)",
    description:
      "A reasoning-focused model that adds a deeper InteliBrain read.",
    mark: "K",
    gradient: "linear-gradient(145deg, #17c3b2, #0b7a70)",
    status: "pending",
  },
];

function ConnectionsContent() {
  const connectedCount = connections.filter(
    (connection) => connection.status === "connected",
  ).length;

  const totalCount = connections.length;

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
            Multi-model rollout in progress
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
              These are the systems ZAINEX depends on for
              market data, identity, and AI analysis —
              including the additional InteliBrain models
              being rolled out beyond OpenAI. They are
              managed at the platform level and require no
              setup from you.
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

                  <span
                    className={
                      connection.status === "connected"
                        ? connectionsStyles.status
                        : `${connectionsStyles.status} ${connectionsStyles.statusPending}`
                    }
                  >
                    <i />
                    {connection.status === "connected"
                      ? "CONNECTED"
                      : "ROLLING OUT"}
                  </span>
                </div>
              </article>
            ))}
          </div>

          <div className={connectionsStyles.orbitCard}>
            <NeuralOrbit
              label="INTEGRATIONS"
              value={`${connectedCount} / ${totalCount}`}
              caption="Live connections — more InteliBrain models rolling out"
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
            <strong>8 models · GPT-5.1 live</strong>
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
