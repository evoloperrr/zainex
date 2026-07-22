"use client";

/* ZAINEX_WHITEPAPER_V1 */

import { useState } from "react";
import Link from "next/link";

import {
  SiteFooter,
  SiteHeader,
} from "@/components/public-site/public-site";

import {
  downloadDocumentPdf,
  type PdfSection,
} from "@/lib/generate-pdf";

import siteStyles from "@/components/public-site/public-site.module.css";
import styles from "../news/news.module.css";

const SECTIONS: PdfSection[] = [
  {
    heading: "1. Overview",
    paragraphs: [
      "ZAINEX is an AI Intelitrade terminal: a single workspace for reading markets across Crypto, Forex, and Stocks, backed by InteliBrain, a multi-model AI signal layer that interprets deterministic technical indicators rather than inventing its own market facts.",
      "The platform is built around a simple principle: AI should inform a trader's decision, never make it. Every InteliBrain output is advisory. Execution — opening or closing a position — is always a deliberate, manual action.",
    ],
  },
  {
    heading: "2. InteliBrain signal architecture",
    paragraphs: [
      "InteliBrain takes a backend-computed snapshot of indicators for a given symbol and timeframe, then asks a large language model to interpret that snapshot under a strict system prompt: never calculate missing indicators, never invent market facts, never execute or request an order. The model can always choose WAIT.",
      "Access to InteliBrain scales with subscription tier. VIP 1 includes GPT-5.1 signals. VIP 2 adds Claude and Gemini for cross-model comparison. VIP 3 unlocks all supported models plus an arbitrage scanner and the platform's maximum signal limits.",
    ],
  },
  {
    heading: "3. Trading environment",
    paragraphs: [
      "Every account gets an internal trading account with its own balances, order history, and position tracking across Spot and Futures. Strategy activation locks a defined principal per strategy, accrues on a fixed schedule, and releases according to an explicit lifecycle — nothing is hidden behind a single blended balance.",
      "ZAINEX is actively integrating live OKX exchange connectivity to move qualifying accounts from simulated execution to real order routing. Until that rollout completes for a given account, all execution remains simulated by design, with the same risk controls (mandatory stop loss, exposure checks, idempotent order requests) that will carry over to live trading.",
    ],
  },
  {
    heading: "4. Wallet, AI credits, and referrals",
    paragraphs: [
      "Each account holds a wallet balance and an AI credits balance. Wallet funds can convert to AI credits at a fixed rate, and credits can be transferred directly between users. A three-level referral network distributes a percentage reward on qualifying credit purchases up the referral chain automatically.",
    ],
  },
  {
    heading: "5. Billing and subscriptions",
    paragraphs: [
      "VIP tiers (VIP 1, VIP 2, VIP 3) are billed as recurring subscriptions covering app features and signal access — not investment products, and not custody of trading capital. Two checkout paths are supported: a manual GoTyme merchant transfer, verified by an administrator before activation, and an automated USDT crypto payment via NOWPayments, which confirms on-chain and activates the subscription without manual intervention.",
      "The GoTyme option is explicitly disclosed as a merchant (individual) account, not a ZAINEX company account, so users always know who they are paying and how.",
    ],
  },
  {
    heading: "6. Platform operations",
    paragraphs: [
      "An internal admin console gives operators visibility and control over the platform: user lookup, manual VIP grants and wallet credits (for completing merchant cash-ins), the full wallet transaction ledger, admin-to-user and user-to-user transfer histories, the crypto payment ledger, and review of every merchant cash-in submission with approve/reject actions.",
    ],
  },
  {
    heading: "7. Design principles",
    paragraphs: [
      "Three principles run through every part of ZAINEX: AI interprets, humans decide; every balance-affecting action is idempotent and ledgered, never silent; and disclosure is explicit — from labeling a payment account as a merchant rather than a company, to keeping simulated execution honestly labeled as such until live trading is actually wired up.",
    ],
  },
];

export function WhitepaperContent() {
  const [
    mobileOpen,
    setMobileOpen,
  ] = useState(false);

  return (
    <main className={siteStyles.site}>
      <div
        className={siteStyles.noise}
        aria-hidden="true"
      />

      <div
        className={
          siteStyles.ambientOne
        }
        aria-hidden="true"
      />

      <div
        className={
          siteStyles.ambientTwo
        }
        aria-hidden="true"
      />

      <SiteHeader
        mobileOpen={mobileOpen}
        setMobileOpen={
          setMobileOpen
        }
      />

      <div className={styles.wrap}>
        <span
          className={
            styles.kicker
          }
        >
          <i />
          Whitepaper
        </span>

        <h1
          className={styles.title}
        >
          The ZAINEX{" "}
          <em>
            AI Intelitrade
            whitepaper.
          </em>
        </h1>

        <p className={styles.deck}>
          What ZAINEX is, how
          InteliBrain interprets
          markets, and how the
          platform is structured
          — written from the
          project as it actually
          stands today.
        </p>

        <button
          type="button"
          className={styles.back}
          style={{
            border: "0",
            background: "none",
            cursor: "pointer",
            font: "inherit",
          }}
          onClick={() => {
            downloadDocumentPdf({
              title:
                "ZAINEX Whitepaper",
              subtitle:
                "The ZAINEX AI Intelitrade platform — architecture, trading environment, and operating principles.",
              sections: SECTIONS,
              filename:
                "zainex-whitepaper.pdf",
            });
          }}
        >
          Download as PDF ↓
        </button>

        <article
          className={
            styles.article
          }
        >
          {SECTIONS.map(
            (section) => (
              <section
                key={
                  section.heading
                }
              >
                <h2>
                  {section.heading}
                </h2>

                {section.paragraphs.map(
                  (
                    paragraph,
                    index,
                  ) => (
                    <p
                      key={index}
                    >
                      {paragraph}
                    </p>
                  ),
                )}
              </section>
            ),
          )}

          <Link
            href="/assistant"
            className={styles.back}
          >
            Ask the assistant a
            question →
          </Link>
        </article>
      </div>

      <SiteFooter />
    </main>
  );
}
