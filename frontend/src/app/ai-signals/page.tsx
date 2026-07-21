"use client";

/* ZAINEX AI SIGNALS HUB V1 */

import Link from "next/link";
import { useState } from "react";

import {
  DesktopSidebar,
} from "../../components/market-dashboard";

import { SharedProfileMenu } from "@/components/shared-profile-menu";
import { NeuralOrbit } from "@/components/neural-orbit";
import { FuturesAiSignalPanel } from "@/components/futures-ai-signal-panel";
import { SpotAiSignalPanel } from "@/components/spot-ai-signal-panel";

import {
  CRYPTO_SYMBOL_LABELS,
  SUPPORTED_CRYPTO_SYMBOLS,
  type CryptoSymbol,
} from "@/lib/crypto-symbols";

import styles from "../billing/billing.module.css";
import aiSignalsStyles from "./ai-signals.module.css";

function AiSignalsContent() {
  const [
    cryptoSymbol,
    setCryptoSymbol,
  ] = useState<CryptoSymbol>("BTCUSDT");

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

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 14,
            flexWrap: "wrap",
            marginBottom: 14,
          }}
        >
          <span
            style={{
              color: "#9d8cff",
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: 1.2,
            }}
          >
            CRYPTO PAIR FOR FUTURES + SPOT CRYPTO
          </span>

          <select
            aria-label="Select crypto pair"
            value={cryptoSymbol}
            onChange={(event) => {
              setCryptoSymbol(
                event.target
                  .value as CryptoSymbol,
              );
            }}
            style={{
              minHeight: 38,
              border:
                "1px solid rgba(145,126,255,.35)",
              borderRadius: 9,
              color: "#e2e5f5",
              background: "#12182b",
              padding: "0 10px",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {SUPPORTED_CRYPTO_SYMBOLS.map(
              (symbol) => (
                <option
                  key={symbol}
                  value={symbol}
                >
                  {CRYPTO_SYMBOL_LABELS[symbol]}
                </option>
              ),
            )}
          </select>
        </div>

        <section className={aiSignalsStyles.grid}>
          <FuturesAiSignalPanel
            symbol={cryptoSymbol}
            symbolLabel={
              CRYPTO_SYMBOL_LABELS[
                cryptoSymbol
              ]
            }
          />
          <SpotAiSignalPanel
            assetClass="crypto"
            symbol={cryptoSymbol}
            symbolLabel={
              CRYPTO_SYMBOL_LABELS[
                cryptoSymbol
              ]
            }
          />
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
