/* ZAINEX PREMIUM FEATURE COMPARISON V1 */

import Link from "next/link";

import {
  DesktopSidebar,
} from "../../components/market-dashboard";

import { SharedProfileMenu } from "@/components/shared-profile-menu";
import { NeuralOrbit } from "@/components/neural-orbit";

import styles from "../billing/billing.module.css";
import premiumStyles from "./premium.module.css";

type FeatureRow = {
  label: string;
  free: boolean | string;
  vip1: boolean | string;
  vip2: boolean | string;
  vip3: boolean | string;
  premium: boolean | string;
};

const featureRows: FeatureRow[] = [
  {
    label: "Core trading dashboard",
    free: true,
    vip1: true,
    vip2: true,
    vip3: true,
    premium: true,
  },
  {
    label: "InteliBrain AI signal previews",
    free: "Limited",
    vip1: "Full access",
    vip2: "Full access",
    vip3: "Full access",
    premium: "Full access",
  },
  {
    label: "GPT-5.1 (OpenAI)",
    free: false,
    vip1: true,
    vip2: true,
    vip3: true,
    premium: true,
  },
  {
    label: "Claude Sonnet 4.5 (Anthropic)",
    free: false,
    vip1: false,
    vip2: true,
    vip3: true,
    premium: true,
  },
  {
    label: "Gemini 3 Pro (Google)",
    free: false,
    vip1: false,
    vip2: true,
    vip3: true,
    premium: true,
  },
  {
    label: "DeepSeek Chat V3.1 (DeepSeek)",
    free: false,
    vip1: false,
    vip2: false,
    vip3: true,
    premium: true,
  },
  {
    label: "Qwen3-Max (Alibaba)",
    free: false,
    vip1: false,
    vip2: false,
    vip3: true,
    premium: true,
  },
  {
    label: "Grok 4.20 (xAI)",
    free: false,
    vip1: false,
    vip2: false,
    vip3: false,
    premium: true,
  },
  {
    label: "Grok 4 (xAI)",
    free: false,
    vip1: false,
    vip2: false,
    vip3: false,
    premium: true,
  },
  {
    label: "Kimi K2 Thinking (Moonshot AI)",
    free: false,
    vip1: false,
    vip2: false,
    vip3: false,
    premium: true,
  },
  {
    label: "Spot markets covered",
    free: "Crypto only",
    vip1: "Crypto + Forex",
    vip2: "All 3 markets",
    vip3: "All 3 markets",
    premium: "All 3 markets",
  },
  {
    label: "Personal asset watchlist",
    free: false,
    vip1: true,
    vip2: true,
    vip3: true,
    premium: true,
  },
  {
    label: "Strategy activation slots",
    free: "0",
    vip1: "1",
    vip2: "3",
    vip3: "Unlimited",
    premium: "Unlimited",
  },
  {
    label: "Priority signal refresh",
    free: false,
    vip1: false,
    vip2: true,
    vip3: true,
    premium: true,
  },
  {
    label: "Priority support",
    free: false,
    vip1: false,
    vip2: false,
    vip3: true,
    premium: true,
  },
  {
    label: "Dedicated account manager",
    free: false,
    vip1: false,
    vip2: false,
    vip3: false,
    premium: true,
  },
  {
    label: "Early access to new markets",
    free: false,
    vip1: false,
    vip2: false,
    vip3: false,
    premium: true,
  },
];

function renderCell(value: boolean | string) {
  if (value === true) {
    return <span className={premiumStyles.check}>{"✓"}</span>;
  }

  if (value === false) {
    return <span className={premiumStyles.dash}>{"—"}</span>;
  }

  return value;
}

function PremiumContent() {
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
            Premium features
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
              WHAT PREMIUM UNLOCKS
            </span>

            <h1>
              See what
              <span> Premium adds.</span>
            </h1>

            <p>
              A side-by-side look at what each tier
              unlocks across markets, AI signals, and
              strategy access. Premium is the tier
              above VIP 3 — our highest level of
              access. Upgrade any time from Billing.
            </p>
          </div>
        </section>

        <section className={premiumStyles.stage}>
          <div className={premiumStyles.tableCard}>
            <table className={premiumStyles.table}>
              <thead>
                <tr>
                  <th scope="col">FEATURE</th>
                  <th scope="col">FREE</th>
                  <th scope="col">VIP 1</th>
                  <th scope="col">VIP 2</th>
                  <th scope="col">VIP 3</th>
                  <th
                    scope="col"
                    className={
                      premiumStyles.premiumColumn
                    }
                  >
                    PREMIUM
                  </th>
                </tr>
              </thead>

              <tbody>
                {featureRows.map((row) => (
                  <tr key={row.label}>
                    <th scope="row">{row.label}</th>
                    <td>{renderCell(row.free)}</td>
                    <td>{renderCell(row.vip1)}</td>
                    <td>{renderCell(row.vip2)}</td>
                    <td>{renderCell(row.vip3)}</td>
                    <td
                      className={
                        premiumStyles.premiumColumn
                      }
                    >
                      {renderCell(row.premium)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={premiumStyles.orbitCard}>
            <NeuralOrbit
              variant="premium"
              label="TOP TIER"
              value="PREMIUM"
              caption="Unlimited strategies + dedicated account manager"
            />
          </div>
        </section>

        <div className={premiumStyles.cta}>
          <div>
            <strong>Ready to upgrade?</strong>
            <span>
              Pick a tier on the Billing page — access
              unlocks instantly.
            </span>
          </div>

          <Link href="/billing">
            View plans
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function PremiumPage() {
  return (
    <main className="zainex-app">
      <div className="desktop-app-frame">
        <DesktopSidebar activeLabel="Premium" />

        <section
          className={`desktop-shell ${styles.desktopContent}`}
        >
          <PremiumContent />
        </section>
      </div>

      <div className={styles.mobileContent}>
        <PremiumContent />
      </div>
    </main>
  );
}
