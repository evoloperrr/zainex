/* ZAINEX BILLING-STYLE WORKFLOW PAGE V2 */

import Link from "next/link";

import {
  DesktopSidebar,
} from "../../components/market-dashboard";

import { SharedProfileMenu } from "@/components/shared-profile-menu";
import { NeuralOrbit } from "@/components/neural-orbit";

import styles from "../billing/billing.module.css";
import workflowStyles from "./workflow.module.css";

const pipelineSteps = [
  {
    title: "Market data ingestion",
    description:
      "Live candles streamed from Binance for Crypto and Yahoo Finance for Forex and Stocks.",
    status: "ACTIVE",
  },
  {
    title: "InteliBrain analysis",
    description:
      "Deterministic technical scoring (trend, RSI, MACD, ATR) combined with a GPT-5-mini signal read.",
    status: "ACTIVE",
  },
  {
    title: "Risk gate",
    description:
      "Every AI recommendation is constrained to a deterministic safety score before it can reach BUY or SELL.",
    status: "ENFORCED",
  },
  {
    title: "Manual approval",
    description:
      "No signal executes on its own. You confirm every Spot or Futures order before it fills.",
    status: "REQUIRED",
  },
  {
    title: "Execution",
    description:
      "Approved orders fill instantly at the live public market price inside your virtual account.",
    status: "ACTIVE",
  },
];

function WorkflowContent() {
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
          <span className={styles.secure}>
            <i />
            AI workflow
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
              AI AUTOMATION BUILDER
            </span>

            <h1>
              Workflow
              <span> automation.</span>
            </h1>

            <p>
              ZAINEX runs every trade idea through the same
              fixed pipeline, whether it starts on Spot or
              Futures. Nothing executes without you.
            </p>
          </div>
        </section>

        <section className={workflowStyles.stage}>
          <div className={workflowStyles.pipeline}>
            {pipelineSteps.map((step, index) => (
              <div
                key={step.title}
                className={workflowStyles.step}
              >
                <span className={workflowStyles.stepIndex}>
                  {index + 1}
                </span>

                <div className={workflowStyles.stepBody}>
                  <strong>{step.title}</strong>
                  <span>{step.description}</span>
                </div>

                <span className={workflowStyles.stepStatus}>
                  {step.status}
                </span>
              </div>
            ))}
          </div>

          <div className={workflowStyles.orbitCard}>
            <NeuralOrbit
              label="AUTOMATION"
              value="MANUAL GATE"
              caption="AI recommends, you approve"
            />
          </div>
        </section>

        <section className={styles.summary}>
          <div>
            <span>AUTO-EXECUTE</span>
            <strong>Disabled by design</strong>
          </div>

          <div>
            <span>SIGNAL ENGINE</span>
            <strong>GPT-5-mini + deterministic gate</strong>
          </div>

          <div>
            <span>MARKETS COVERED</span>
            <strong>Crypto, Forex and Stocks</strong>
          </div>

          <div>
            <span>APPROVAL MODEL</span>
            <strong>Manual confirmation required</strong>
          </div>
        </section>
      </div>
    </div>
  );
}

export default function WorkflowPage() {
  return (
    <main className="zainex-app">
      <div className="desktop-app-frame">
        <DesktopSidebar
          activeLabel="Workflow"
        />

        <section
          className={`desktop-shell ${styles.desktopContent}`}
        >
          <WorkflowContent />
        </section>
      </div>

      <div className={styles.mobileContent}>
        <WorkflowContent />
      </div>
    </main>
  );
}