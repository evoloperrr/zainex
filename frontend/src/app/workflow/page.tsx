/* ZAINEX BILLING-STYLE WORKFLOW PAGE V2 */

import Link from "next/link";

import {
  DesktopSidebar,
} from "../../components/market-dashboard";

import { SharedProfileMenu } from "@/components/shared-profile-menu";

import styles from "../billing/billing.module.css";

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