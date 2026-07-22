"use client";

/* ZAINEX_ROADMAP_V1 */

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
    heading: "Phase 1 — Foundation (shipped)",
    paragraphs: [
      "Multi-market terminal covering Crypto, Forex, and Stocks with live public market data and charting.",
      "InteliBrain AI signal layer with tiered model access (GPT-5.1, Claude, Gemini) and an arbitrage scanner at the top tier.",
      "Wallet and AI credits system, including wallet-to-credits conversion, user-to-user credit transfers, and a three-level referral reward network.",
      "Strategy activation with independent principal locking, scheduled accrual, and a defined lifecycle per activation.",
      "VIP subscription billing with two checkout paths: a manually verified GoTyme merchant transfer, and a fully automated USDT crypto payment via NOWPayments that confirms on-chain and activates access without manual review.",
      "An internal admin console covering platform overview, user management, manual VIP/wallet corrections, the wallet transaction ledger, transfer histories, the crypto payment ledger, and merchant cash-in review.",
      "A general AI assistant for platform questions, separate from the trading-signal AI, with no trading-advice role.",
    ],
  },
  {
    heading: "Phase 2 — Live exchange trading (in progress)",
    paragraphs: [
      "Wiring real OKX exchange connectivity so qualifying accounts can move from simulated execution to live order routing, carrying over the same risk controls already enforced in the simulated environment: mandatory stop loss, exposure checks, and idempotent order handling.",
      "Extending the merchant cash-in and crypto payment review flows to support real fund custody safely once live trading is active.",
    ],
  },
  {
    heading: "Phase 3 — Expansion (planned)",
    paragraphs: [
      "Additional exchange and broker connectors beyond OKX, so the same InteliBrain signal layer can route to more than one live venue.",
      "Deeper portfolio analytics across simulated and live history in one view.",
      "Continued rollout of additional AI models into InteliBrain as they become available.",
    ],
  },
];

export function RoadmapContent() {
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
          Roadmap
        </span>

        <h1
          className={styles.title}
        >
          Where ZAINEX{" "}
          <em>
            is, and where it's
            going.
          </em>
        </h1>

        <p className={styles.deck}>
          What's already shipped,
          what's actively being
          built, and what's
          planned next — starting
          with live OKX exchange
          trading.
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
                "ZAINEX Roadmap",
              subtitle:
                "What's shipped, what's in progress, and what's planned for the ZAINEX AI Intelitrade platform.",
              sections: SECTIONS,
              filename:
                "zainex-roadmap.pdf",
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

                <ul
                  className={
                    styles.specs
                  }
                >
                  {section.paragraphs.map(
                    (
                      paragraph,
                      index,
                    ) => (
                      <li
                        key={
                          index
                        }
                      >
                        <span
                          className={
                            styles.k
                          }
                        >
                          {String(
                            index +
                              1,
                          ).padStart(
                            2,
                            "0",
                          )}
                        </span>
                        <span
                          className={
                            styles.v
                          }
                        >
                          {
                            paragraph
                          }
                        </span>
                      </li>
                    ),
                  )}
                </ul>
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
