"use client";

/* ZAINEX_COLLATERALS_V1 */

import { useState } from "react";
import Link from "next/link";

import {
  SiteFooter,
  SiteHeader,
} from "@/components/public-site/public-site";

import {
  downloadSlideDeckPdf,
  type PdfSlide,
} from "@/lib/generate-pdf";

import siteStyles from "@/components/public-site/public-site.module.css";
import styles from "../news/news.module.css";
import ownStyles from "./collaterals.module.css";

const COLORS = [
  { name: "Background", hex: "#080718" },
  { name: "Blue", hex: "#35bdf8" },
  { name: "Purple", hex: "#8458ff" },
  { name: "Violet", hex: "#ac55ff" },
  { name: "Pink", hex: "#ff6f91" },
  { name: "Green", hex: "#5af1be" },
  { name: "Gold", hex: "#ffd168" },
];

const BANNERS = [
  {
    file: "zainex-banner-1200x630.svg",
    label: "Social share banner",
    dimensions: "1200 × 630",
  },
  {
    file: "zainex-banner-728x90.svg",
    label: "Leaderboard banner",
    dimensions: "728 × 90",
  },
  {
    file: "zainex-banner-300x250.svg",
    label: "Medium rectangle banner",
    dimensions: "300 × 250",
  },
];

const SLIDES: PdfSlide[] = [
  {
    heading: "What is ZAINEX",
    bullets: [
      "An AI Intelitrade terminal covering Crypto, Forex, and Stocks in one workspace.",
      "InteliBrain interprets deterministic technical indicators — it never invents market facts.",
      "Every AI output is advisory; execution is always a deliberate, manual action.",
    ],
  },
  {
    heading: "InteliBrain signal architecture",
    bullets: [
      "GPT-5.1 signals from VIP 1; Claude and Gemini added at VIP 2 for cross-model comparison.",
      "VIP 3 unlocks every supported model plus an arbitrage scanner.",
      "Strict system prompt: no invented data, no autonomous orders, WAIT is always a valid answer.",
    ],
  },
  {
    heading: "Wallet, credits, and referrals",
    bullets: [
      "Every account holds a wallet balance and a separate AI credits balance.",
      "Wallet funds convert to AI credits at a transparent fixed rate.",
      "A three-level referral network rewards a percentage of qualifying credit purchases automatically.",
    ],
  },
  {
    heading: "Billing: two checkout paths",
    bullets: [
      "GoTyme merchant transfer — manually verified by an administrator before activation.",
      "Automated USDT crypto payment via NOWPayments — confirms on-chain, activates with no manual step.",
      "The GoTyme account is explicitly disclosed as a merchant (individual) account, never a company account.",
    ],
  },
  {
    heading: "Where ZAINEX is going",
    bullets: [
      "Shipped: multi-market terminal, InteliBrain, wallet/credits, referrals, VIP billing, admin console.",
      "In progress: live OKX exchange connectivity, moving qualifying accounts to real order routing.",
      "Planned: additional exchange connectors, deeper portfolio analytics, more AI models.",
    ],
  },
  {
    heading: "Learn more",
    bullets: [
      "Whitepaper: zainex-ai.com/whitepaper",
      "Roadmap: zainex-ai.com/roadmap",
      "Questions: zainex-ai.com/assistant",
    ],
  },
];

export function CollateralsContent() {
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
          Collaterals
        </span>

        <h1
          className={styles.title}
        >
          Brand{" "}
          <em>collaterals.</em>
        </h1>

        <p className={styles.deck}>
          Banners and a pitch
          slide deck, ready to
          download. An explainer
          video is still in
          progress.
        </p>

        <article
          className={
            styles.article
          }
        >
          <h2>Banners</h2>
          <p>
            On-brand banner
            images in three common
            ad and social sizes.
            SVG format — scales
            cleanly at any size.
          </p>

          <div
            className={
              ownStyles.downloadGrid
            }
          >
            {BANNERS.map(
              (banner) => (
                <div
                  key={
                    banner.file
                  }
                  className={
                    ownStyles.downloadCard
                  }
                >
                  <div
                    className={
                      ownStyles.downloadPreview
                    }
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/collaterals/${banner.file}`}
                      alt={`${banner.label} preview`}
                    />
                  </div>

                  <div
                    className={
                      ownStyles.downloadMeta
                    }
                  >
                    <strong>
                      {
                        banner.label
                      }
                    </strong>
                    <span>
                      {
                        banner.dimensions
                      }{" "}
                      · SVG
                    </span>
                  </div>

                  <a
                    href={`/collaterals/${banner.file}`}
                    download
                    className={
                      ownStyles.downloadButton
                    }
                  >
                    Download ↓
                  </a>
                </div>
              ),
            )}
          </div>

          <h2>Pitch slide deck</h2>
          <p>
            A six-slide overview
            of the platform,
            InteliBrain, billing,
            and the roadmap —
            generated as a
            ready-to-present PDF.
          </p>

          <div
            className={
              ownStyles.slideDeckCard
            }
          >
            <div
              className={
                ownStyles.slideDeckMeta
              }
            >
              <strong>
                ZAINEX overview
                deck
              </strong>
              <span>
                6 slides · PDF ·
                widescreen
              </span>
            </div>

            <button
              type="button"
              className={
                ownStyles.downloadButton
              }
              onClick={() => {
                downloadSlideDeckPdf(
                  {
                    title:
                      "ZAINEX — AI Intelitrade",
                    subtitle:
                      "Trade with intelligence. Decide with control.",
                    slides:
                      SLIDES,
                    filename:
                      "zainex-overview-deck.pdf",
                  },
                );
              }}
            >
              Download as PDF ↓
            </button>
          </div>

          <h2>Explainer video</h2>
          <p>
            <span
              className={
                ownStyles.comingSoonBadge
              }
            >
              IN PROGRESS
            </span>{" "}
            Still being produced.
            Ask the{" "}
            <Link href="/assistant">
              assistant
            </Link>{" "}
            if you need something
            ahead of that.
          </p>

          <h2>Wordmark</h2>
          <p>
            Always render{" "}
            <strong>
              ZAINEX
            </strong>{" "}
            in full capitals,
            with the gradient
            treatment on the
            middle &ldquo;AI&rdquo;
            reserved for on-brand
            surfaces (the site
            header uses it live).
            Don&rsquo;t stretch,
            rotate, or recolor the
            mark outside that
            gradient.
          </p>

          <div
            className={
              ownStyles.wordmarkPreview
            }
          >
            <strong className="zainex-wordmark">
              <span className="zainex-wordmark-silver">
                Z
              </span>
              <span className="zainex-wordmark-ai">
                AI
              </span>
              <span className="zainex-wordmark-silver">
                NEX
              </span>
            </strong>
          </div>

          <h2>Color palette</h2>
          <p>
            The core palette used
            across the app and
            marketing site.
          </p>

          <div
            className={
              ownStyles.swatchGrid
            }
          >
            {COLORS.map(
              (color) => (
                <div
                  key={color.hex}
                  className={
                    ownStyles.swatch
                  }
                >
                  <span
                    className={
                      ownStyles.swatchColor
                    }
                    style={{
                      background:
                        color.hex,
                    }}
                  />
                  <span
                    className={
                      ownStyles.swatchLabel
                    }
                  >
                    {color.name}
                    <small>
                      {color.hex}
                    </small>
                  </span>
                </div>
              ),
            )}
          </div>

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
