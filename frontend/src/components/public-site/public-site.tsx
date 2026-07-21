"use client";

/* ZAINEX_PREMIUM_PUBLIC_SITE_V1 */

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePathname } from "next/navigation";

import { useBodyScrollLock } from "@/lib/use-body-scroll-lock";

import styles from "./public-site.module.css";

export type PublicPageKey =
  | "home"
  | "platform"
  | "markets"
  | "intellibrain"
  | "strategies"
  | "wallets"
  | "security"
  | "company";

type IconName =
  | "arrow"
  | "brain"
  | "chart"
  | "check"
  | "company"
  | "layers"
  | "lock"
  | "market"
  | "menu"
  | "send"
  | "shield"
  | "spark"
  | "strategy"
  | "wallet"
  | "x";

type PublicPageData = {
  eyebrow: string;
  title: string;
  accent: string;
  description: string;
  primaryLabel: string;
  primaryHref: string;
  secondaryLabel: string;
  secondaryHref: string;
  metrics: Array<{
    value: string;
    label: string;
  }>;
  sectionEyebrow: string;
  sectionTitle: string;
  sectionCopy: string;
  cards: Array<{
    icon: IconName;
    title: string;
    copy: string;
    tag: string;
  }>;
  workflowTitle: string;
  workflowCopy: string;
  workflow: Array<{
    step: string;
    title: string;
    copy: string;
  }>;
  statement: string;
};

const navigation = [
  {
    href: "/",
    label: "Home",
  },
  {
    href: "/platform",
    label: "Platform",
  },
  {
    href: "/markets",
    label: "Markets",
  },
  {
    href: "/intellibrain",
    label: "InteliBrain",
  },
  {
    href: "/strategies",
    label: "Strategies",
  },
  {
    href: "/wallets",
    label: "Wallets",
  },
  {
    href: "/security",
    label: "Security",
  },
  {
    href: "/company",
    label: "Company",
  },
  {
    href: "/news",
    label: "News",
  },
] as const;

const pages: Record<PublicPageKey, PublicPageData> = {
  home: {
    eyebrow: "AI-NATIVE MARKET OPERATING SYSTEM",
    title: "Trade with intelligence.",
    accent: "Decide with control.",
    description:
      "ZAINEX unifies market data, deterministic risk controls, AI interpretation, paper execution, strategy accounting, and wallet utilities in one disciplined operating environment.",
    primaryLabel: "Launch platform",
    primaryHref: "/market",
    secondaryLabel: "Explore InteliBrain",
    secondaryHref: "/intellibrain",
    metrics: [
      {
        value: "3",
        label: "AI model families",
      },
      {
        value: "1",
        label: "Deterministic safety gate",
      },
      {
        value: "100%",
        label: "Manual trade approval",
      },
    ],
    sectionEyebrow: "ONE CONTROL PLANE",
    sectionTitle:
      "From market signal to accountable action.",
    sectionCopy:
      "ZAINEX is designed around a simple principle: intelligence may assist the decision, but deterministic controls and the human operator remain in charge.",
    cards: [
      {
        icon: "brain",
        title: "Interpretable AI",
        copy:
          "Multi-model reasoning is organized around deterministic indicators, technical scoring, and explicit BUY, SELL, or WAIT outcomes.",
        tag: "INTELLIGENCE",
      },
      {
        icon: "shield",
        title: "Risk before execution",
        copy:
          "Mandatory stop loss, exposure checks, idempotent requests, and paper-only execution keep experimentation inside defined boundaries.",
        tag: "CONTROL",
      },
      {
        icon: "wallet",
        title: "Transparent accounting",
        copy:
          "Wallet balances, AI credits, strategy principal, daily accruals, and user transfers are separated and recorded in clear ledgers.",
        tag: "ACCOUNTABILITY",
      },
    ],
    workflowTitle:
      "A disciplined path from data to decision.",
    workflowCopy:
      "Each layer has one responsibility. No model receives authority to bypass the safety gate or place an autonomous order.",
    workflow: [
      {
        step: "01",
        title: "Observe",
        copy:
          "Live and closed market data enter the analysis pipeline.",
      },
      {
        step: "02",
        title: "Calculate",
        copy:
          "Deterministic indicators and risk metrics establish the technical state.",
      },
      {
        step: "03",
        title: "Interpret",
        copy:
          "AI models explain the setup and propose BUY, SELL, or WAIT.",
      },
      {
        step: "04",
        title: "Approve",
        copy:
          "The user reviews direction, stop loss, take profit, and risk before execution.",
      },
    ],
    statement:
      "Built for operators who want modern intelligence without surrendering control.",
  },
  platform: {
    eyebrow: "UNIFIED TRADING WORKSPACE",
    title: "One interface.",
    accent: "Every critical decision.",
    description:
      "The ZAINEX platform brings charts, paper Spot and Futures workflows, positions, execution history, AI signals, wallet state, and strategy access into one coherent workspace.",
    primaryLabel: "Open trading terminal",
    primaryHref: "/market",
    secondaryLabel: "Review security",
    secondaryHref: "/security",
    metrics: [
      {
        value: "SPOT",
        label: "Paper execution",
      },
      {
        value: "FUTURES",
        label: "Isolated paper workflow",
      },
      {
        value: "LIVE",
        label: "Market data layer",
      },
    ],
    sectionEyebrow: "DESIGNED AS A SYSTEM",
    sectionTitle:
      "A professional workspace, not a collection of disconnected tools.",
    sectionCopy:
      "Every core feature shares the same session, account, wallet, ledger, and risk context - reducing friction and preventing conflicting state.",
    cards: [
      {
        icon: "chart",
        title: "Interactive market terminal",
        copy:
          "A responsive trading interface connects market views, positions, orders, execution records, and risk controls.",
        tag: "TERMINAL",
      },
      {
        icon: "layers",
        title: "Unified account state",
        copy:
          "User identity, wallet balances, paper accounts, locked capital, and realized performance remain synchronized.",
        tag: "ACCOUNT",
      },
      {
        icon: "spark",
        title: "AI inside the workflow",
        copy:
          "InteliBrain analysis appears where decisions happen, rather than in a separate chatbot detached from execution context.",
        tag: "WORKFLOW",
      },
    ],
    workflowTitle:
      "A platform architecture that keeps concerns separated.",
    workflowCopy:
      "Market data, analysis, approval, execution, and accounting operate as connected layers with explicit boundaries.",
    workflow: [
      {
        step: "01",
        title: "Market layer",
        copy:
          "Public providers deliver pricing and candle data.",
      },
      {
        step: "02",
        title: "Decision layer",
        copy:
          "Indicators, risk metrics, and AI interpretation create a structured proposal.",
      },
      {
        step: "03",
        title: "Execution layer",
        copy:
          "Paper orders, positions, and close actions follow validated contracts.",
      },
      {
        step: "04",
        title: "Ledger layer",
        copy:
          "Wallet, credits, strategies, and transaction history remain auditable.",
      },
    ],
    statement:
      "The interface is streamlined. The architecture underneath is deliberate.",
  },
  markets: {
    eyebrow: "MULTI-MARKET ARCHITECTURE",
    title: "A single market language.",
    accent: "Built to expand.",
    description:
      "ZAINEX organizes Crypto, Forex, and Stocks under one product experience. Crypto paper workflows are the current execution focus, while the platform structure is prepared for additional market connectors.",
    primaryLabel: "View crypto terminal",
    primaryHref: "/market",
    secondaryLabel: "Explore platform",
    secondaryHref: "/platform",
    metrics: [
      {
        value: "CRYPTO",
        label: "Current paper focus",
      },
      {
        value: "FOREX",
        label: "Unified interface path",
      },
      {
        value: "STOCKS",
        label: "Unified interface path",
      },
    ],
    sectionEyebrow: "CONSISTENT EXPERIENCE",
    sectionTitle:
      "Different markets. One operational standard.",
    sectionCopy:
      "The platform separates market-specific data adapters from the user experience, allowing controls, account logic, and analysis patterns to remain consistent.",
    cards: [
      {
        icon: "market",
        title: "Crypto",
        copy:
          "Real public market data, paper Spot and Futures flows, technical indicators, and risk-gated manual execution.",
        tag: "ACTIVE FOCUS",
      },
      {
        icon: "chart",
        title: "Forex",
        copy:
          "A dedicated market view within the same navigation and analytical framework, ready for validated provider integration.",
        tag: "ARCHITECTURE",
      },
      {
        icon: "company",
        title: "Stocks",
        copy:
          "An expandable market channel designed to inherit the same session, risk, and ledger principles.",
        tag: "ARCHITECTURE",
      },
    ],
    workflowTitle:
      "Market expansion without rebuilding the product.",
    workflowCopy:
      "Adapters normalize external data while shared platform layers preserve the same user and risk experience.",
    workflow: [
      {
        step: "01",
        title: "Connect",
        copy:
          "A validated provider supplies market-specific data.",
      },
      {
        step: "02",
        title: "Normalize",
        copy:
          "Symbols, prices, candles, and market metadata enter common contracts.",
      },
      {
        step: "03",
        title: "Analyze",
        copy:
          "Indicators and AI interpretation follow the selected market context.",
      },
      {
        step: "04",
        title: "Control",
        copy:
          "Execution remains limited by product scope, validation, and manual approval.",
      },
    ],
    statement:
      "Expansion should add market access - not fragment the user experience.",
  },
  intellibrain: {
    eyebrow: "MULTI-MODEL DECISION INTELLIGENCE",
    title: "AI that interprets.",
    accent: "Controls that decide.",
    description:
      "InteliBrain is designed to combine OpenAI, Google Gemini, and DeepSeek perspectives around deterministic technical analysis. Models can explain and propose; they cannot override the safety gate.",
    primaryLabel: "Open AI strategies",
    primaryHref: "/ai-strategies",
    secondaryLabel: "See risk controls",
    secondaryHref: "/security",
    metrics: [
      {
        value: "OPENAI",
        label: "Reasoning perspective",
      },
      {
        value: "GEMINI",
        label: "Reasoning perspective",
      },
      {
        value: "DEEPSEEK",
        label: "Reasoning perspective",
      },
    ],
    sectionEyebrow: "ENSEMBLE BY DESIGN",
    sectionTitle:
      "Diverse model perspectives. One deterministic foundation.",
    sectionCopy:
      "The strongest AI workflow is not a single prompt. It is a structured system where calculations, constraints, and model opinions remain distinguishable.",
    cards: [
      {
        icon: "brain",
        title: "Deterministic technical state",
        copy:
          "EMA, RSI, MACD, Bollinger Bands, ATR, volume, trend, and support or resistance are computed outside the model.",
        tag: "FOUNDATION",
      },
      {
        icon: "spark",
        title: "Model interpretation",
        copy:
          "Models receive structured evidence and return concise market reasoning, directional preference, and uncertainty.",
        tag: "ENSEMBLE",
      },
      {
        icon: "check",
        title: "Human confirmation",
        copy:
          "The final action remains LONG, SHORT, or WAIT under the user's explicit approval.",
        tag: "AUTHORITY",
      },
    ],
    workflowTitle:
      "Intelligence with explicit separation of duties.",
    workflowCopy:
      "The calculation layer establishes facts. The model layer interprets them. The user owns the action.",
    workflow: [
      {
        step: "01",
        title: "Technical snapshot",
        copy:
          "The backend creates a deterministic market and risk summary.",
      },
      {
        step: "02",
        title: "Model perspectives",
        copy:
          "Multiple AI providers independently interpret the same structured state.",
      },
      {
        step: "03",
        title: "Safety reconciliation",
        copy:
          "Signals are checked against exposure, risk, and validity rules.",
      },
      {
        step: "04",
        title: "Manual choice",
        copy:
          "The operator accepts, edits within bounds, or chooses WAIT.",
      },
    ],
    statement:
      "AI is most valuable when its role is powerful, visible, and bounded.",
  },
  strategies: {
    eyebrow: "PAPER STRATEGY ECOSYSTEM",
    title: "Strategy access.",
    accent: "Ledger-level transparency.",
    description:
      "ZAINEX paper strategies use independent activations, explicit principal locking, daily accrual records, credit costs, and a defined lifecycle - without hiding activity behind a single balance.",
    primaryLabel: "View AI strategies",
    primaryHref: "/ai-strategies",
    secondaryLabel: "Explore wallets",
    secondaryHref: "/wallets",
    metrics: [
      {
        value: "30D",
        label: "Defined paper lifecycle",
      },
      {
        value: "DAILY",
        label: "Accrual records",
      },
      {
        value: "10",
        label: "Latest combined events",
      },
    ],
    sectionEyebrow: "ACCOUNTING FIRST",
    sectionTitle:
      "Every activation is independent and traceable.",
    sectionCopy:
      "Repeated tiers and multiple active paper strategies can coexist while current access follows the highest active tier.",
    cards: [
      {
        icon: "strategy",
        title: "Independent activations",
        copy:
          "Each paper strategy holds its own principal, rate, paid-day count, next accrual time, and completion state.",
        tag: "LIFECYCLE",
      },
      {
        icon: "lock",
        title: "Exposure-aware activation",
        copy:
          "New activations are blocked while open positions or pending Futures orders create conflicting exposure.",
        tag: "GUARD",
      },
      {
        icon: "layers",
        title: "Combined activity ledger",
        copy:
          "Activations, daily paper profit, principal release, and completion events appear in one latest-first record.",
        tag: "LEDGER",
      },
    ],
    workflowTitle:
      "A strategy lifecycle with visible state transitions.",
    workflowCopy:
      "Principal movement, daily records, completion, and release are represented as separate accounting events.",
    workflow: [
      {
        step: "01",
        title: "Activate",
        copy:
          "Available paper funds move into strategy-locked accounting.",
      },
      {
        step: "02",
        title: "Accrue",
        copy:
          "Due paper profit records are processed idempotently.",
      },
      {
        step: "03",
        title: "Record",
        copy:
          "Each day produces a dedicated accrual and wallet event.",
      },
      {
        step: "04",
        title: "Complete",
        copy:
          "After the defined term, principal is released and status is finalized.",
      },
    ],
    statement:
      "A premium strategy experience begins with accounting users can understand.",
  },
  wallets: {
    eyebrow: "WALLET AND CREDIT INFRASTRUCTURE",
    title: "Funds separated.",
    accent: "Activity connected.",
    description:
      "ZAINEX separates wallet funds, available trading balance, locked exposure, strategy principal, and AI credits - then brings their movements together through clear activity records.",
    primaryLabel: "Open wallet",
    primaryHref: "/wallet",
    secondaryLabel: "View strategies",
    secondaryHref: "/strategies",
    metrics: [
      {
        value: "1:1",
        label: "USD to AI credit",
      },
      {
        value: "0",
        label: "Credit transfer fee",
      },
      {
        value: "10",
        label: "Latest activity rows",
      },
    ],
    sectionEyebrow: "CLEAR BALANCE PURPOSE",
    sectionTitle:
      "One account. Multiple balance responsibilities.",
    sectionCopy:
      "A wallet should not blur spendable cash, trading exposure, strategy principal, and product credits into one number.",
    cards: [
      {
        icon: "wallet",
        title: "Wallet to credits",
        copy:
          "Whole available wallet dollars can convert to AI credits at a transparent 1:1 product rate.",
        tag: "CONVERT",
      },
      {
        icon: "send",
        title: "User-to-user credits",
        copy:
          "Verified ZAINEX users can transfer whole AI credits by recipient email with atomic balance updates.",
        tag: "TRANSFER",
      },
      {
        icon: "layers",
        title: "Combined activity",
        copy:
          "Converted, sent, and received activity can be reviewed through differentiated labels in one table.",
        tag: "HISTORY",
      },
    ],
    workflowTitle:
      "Balance changes with transaction-grade discipline.",
    workflowCopy:
      "Every write operation validates identity, available value, duplicate requests, and before-and-after balances.",
    workflow: [
      {
        step: "01",
        title: "Validate",
        copy:
          "The session, amount, recipient, and balance state are checked.",
      },
      {
        step: "02",
        title: "Lock",
        copy:
          "Relevant rows are protected inside an atomic database transaction.",
      },
      {
        step: "03",
        title: "Move",
        copy:
          "Balances update together or do not update at all.",
      },
      {
        step: "04",
        title: "Record",
        copy:
          "A reference-keyed ledger event preserves the outcome.",
      },
    ],
    statement:
      "Financial clarity is a product feature - not a back-office detail.",
  },
  security: {
    eyebrow: "CONTROLLED BY ARCHITECTURE",
    title: "Safety is not a warning.",
    accent: "It is the workflow.",
    description:
      "ZAINEX places validation, deterministic limits, manual approval, mandatory stop loss, exposure checks, and idempotent transactions directly inside the product flow.",
    primaryLabel: "Launch protected terminal",
    primaryHref: "/market",
    secondaryLabel: "Explore InteliBrain",
    secondaryHref: "/intellibrain",
    metrics: [
      {
        value: "MANUAL",
        label: "Final trade approval",
      },
      {
        value: "MANDATORY",
        label: "Stop loss input",
      },
      {
        value: "PAPER",
        label: "Current execution scope",
      },
    ],
    sectionEyebrow: "DEFENSE IN DEPTH",
    sectionTitle:
      "Multiple controls protect the same decision.",
    sectionCopy:
      "Security is stronger when identity, validation, risk, state transitions, and accounting all enforce compatible rules.",
    cards: [
      {
        icon: "shield",
        title: "Deterministic safety gate",
        copy:
          "Model output cannot bypass backend validation, supported instruments, leverage rules, or exposure constraints.",
        tag: "GATE",
      },
      {
        icon: "lock",
        title: "Session isolation",
        copy:
          "Verified Google users receive separate ZAINEX identities, private paper accounts, wallets, and trading sessions.",
        tag: "IDENTITY",
      },
      {
        icon: "check",
        title: "Manual trade authority",
        copy:
          "The system proposes and calculates. The user explicitly confirms LONG, SHORT, or WAIT.",
        tag: "APPROVAL",
      },
    ],
    workflowTitle:
      "Controls applied before, during, and after an action.",
    workflowCopy:
      "Each phase prevents a different failure mode - from unauthorized access to duplicate balance movement.",
    workflow: [
      {
        step: "01",
        title: "Authenticate",
        copy:
          "A verified Google identity establishes the user session.",
      },
      {
        step: "02",
        title: "Authorize",
        copy:
          "Private account and internal service tokens scope the request.",
      },
      {
        step: "03",
        title: "Validate",
        copy:
          "Risk, amount, exposure, and request structure are enforced.",
      },
      {
        step: "04",
        title: "Audit",
        copy:
          "Orders, transfers, strategies, and wallet events remain traceable.",
      },
    ],
    statement:
      "The safest automation is the automation that clearly knows where its authority ends.",
  },
  company: {
    eyebrow: "THE ZAINEX VISION",
    title: "Build the operating layer.",
    accent: "Not another trading gimmick.",
    description:
      "ZAINEX is being developed as a disciplined AI trading operating environment: modern enough for the next generation of users, structured enough for serious product expansion.",
    primaryLabel: "Experience ZAINEX",
    primaryHref: "/market",
    secondaryLabel: "See the platform",
    secondaryHref: "/platform",
    metrics: [
      {
        value: "AI-NATIVE",
        label: "Product direction",
      },
      {
        value: "RISK-FIRST",
        label: "Engineering principle",
      },
      {
        value: "GLOBAL",
        label: "Design standard",
      },
    ],
    sectionEyebrow: "PRODUCT PRINCIPLES",
    sectionTitle:
      "Professional technology is defined by restraint.",
    sectionCopy:
      "ZAINEX is built around clarity, explicit control, modular architecture, honest product scope, and a premium experience that does not depend on exaggerated claims.",
    cards: [
      {
        icon: "company",
        title: "International product standard",
        copy:
          "Editorial design, responsive interaction, coherent terminology, and consistent system behavior across routes.",
        tag: "DESIGN",
      },
      {
        icon: "layers",
        title: "Modular foundations",
        copy:
          "Market providers, AI models, execution engines, and accounting layers can evolve without rebuilding the entire product.",
        tag: "ENGINEERING",
      },
      {
        icon: "shield",
        title: "Responsible intelligence",
        copy:
          "AI remains explainable, bounded, and subordinate to deterministic safety and user authorization.",
        tag: "PRINCIPLE",
      },
    ],
    workflowTitle:
      "A roadmap shaped by product maturity.",
    workflowCopy:
      "The platform grows in deliberate stages, preserving working systems before expanding scope.",
    workflow: [
      {
        step: "01",
        title: "Foundation",
        copy:
          "Identity, accounts, wallet state, and paper execution establish reliable core behavior.",
      },
      {
        step: "02",
        title: "Intelligence",
        copy:
          "Deterministic analysis and multi-model interpretation improve decisions.",
      },
      {
        step: "03",
        title: "Expansion",
        copy:
          "Additional markets and provider integrations enter through defined interfaces.",
      },
      {
        step: "04",
        title: "Scale",
        copy:
          "Deployment, observability, compliance, and operational controls mature with usage.",
      },
    ],
    statement:
      "The ambition is global. The build discipline starts with every local decision.",
  },
};

function isActivePath(
  pathname: string,
  href: string,
): boolean {
  if (href === "/") {
    return pathname === "/";
  }

  return (
    pathname === href ||
    pathname.startsWith(
      `${href}/`,
    )
  );
}

function Icon({
  name,
  size = 20,
}: {
  name: IconName;
  size?: number;
}) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    "aria-hidden": true,
  } as const;

  if (name === "arrow") {
    return (
      <svg {...common}>
        <path d="M5 12h14" />
        <path d="m14 7 5 5-5 5" />
      </svg>
    );
  }

  if (name === "brain") {
    return (
      <svg {...common}>
        <path d="M9.5 4.5A3 3 0 0 0 6 7.4 3.2 3.2 0 0 0 4 10.3a3 3 0 0 0 1.7 2.8A3.2 3.2 0 0 0 9 17.7" />
        <path d="M14.5 4.5A3 3 0 0 1 18 7.4a3.2 3.2 0 0 1 2 2.9 3 3 0 0 1-1.7 2.8 3.2 3.2 0 0 1-3.3 4.6" />
        <path d="M9.5 4.5v15" />
        <path d="M14.5 4.5v15" />
        <path d="M9.5 9H7.8" />
        <path d="M14.5 9h1.7" />
        <path d="M9.5 14H7.8" />
        <path d="M14.5 14h1.7" />
      </svg>
    );
  }

  if (name === "chart" || name === "market") {
    return (
      <svg {...common}>
        <path d="M4 19V5" />
        <path d="M4 19h16" />
        <path d="m7 15 3-4 3 2 4-6" />
        <path d="m15 7h2v2" />
      </svg>
    );
  }

  if (name === "check") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="8" />
        <path d="m8.5 12 2.2 2.2 4.8-5" />
      </svg>
    );
  }

  if (name === "company") {
    return (
      <svg {...common}>
        <path d="M5 20V8l7-4 7 4v12" />
        <path d="M9 20v-5h6v5" />
        <path d="M8 10h.01" />
        <path d="M12 10h.01" />
        <path d="M16 10h.01" />
      </svg>
    );
  }

  if (name === "layers") {
    return (
      <svg {...common}>
        <path d="m12 3 8 4-8 4-8-4 8-4Z" />
        <path d="m4 12 8 4 8-4" />
        <path d="m4 17 8 4 8-4" />
      </svg>
    );
  }

  if (name === "lock") {
    return (
      <svg {...common}>
        <rect x="5" y="10" width="14" height="10" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
        <path d="M12 14v2" />
      </svg>
    );
  }

  if (name === "menu") {
    return (
      <svg {...common}>
        <path d="M4 7h16" />
        <path d="M4 12h16" />
        <path d="M4 17h16" />
      </svg>
    );
  }

  if (name === "send") {
    return (
      <svg {...common}>
        <path d="m4 4 17 8-17 8 3-8-3-8Z" />
        <path d="M7 12h14" />
      </svg>
    );
  }

  if (name === "shield") {
    return (
      <svg {...common}>
        <path d="M12 3 5 6v5c0 4.6 2.8 8 7 10 4.2-2 7-5.4 7-10V6l-7-3Z" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    );
  }

  if (name === "spark") {
    return (
      <svg {...common}>
        <path d="m12 3 1.3 4.2L17.5 9l-4.2 1.8L12 15l-1.3-4.2L6.5 9l4.2-1.8L12 3Z" />
        <path d="m18 14 .7 2.3L21 17l-2.3.7L18 20l-.7-2.3L15 17l2.3-.7L18 14Z" />
      </svg>
    );
  }

  if (name === "strategy") {
    return (
      <svg {...common}>
        <circle cx="6" cy="6" r="2" />
        <circle cx="18" cy="6" r="2" />
        <circle cx="12" cy="18" r="2" />
        <path d="M8 6h8" />
        <path d="m7 8 4 8" />
        <path d="m17 8-4 8" />
      </svg>
    );
  }

  if (name === "wallet") {
    return (
      <svg {...common}>
        <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18a2 2 0 0 1 2 2v11H6.5A2.5 2.5 0 0 1 4 15.5v-8Z" />
        <path d="M16 10h4v4h-4a2 2 0 1 1 0-4Z" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <path d="m6 6 12 12" />
      <path d="m18 6-12 12" />
    </svg>
  );
}

function Brand() {
  return (
    <Link
      href="/"
      className={styles.brand}
      aria-label="ZAINEX home"
    >
      <span className={styles.brandMark}>
        <svg
          viewBox="0 0 32 32"
          fill="none"
          aria-hidden="true"
        >
          <path d="M5 8h17L10 24h17" />
          <path d="m18 8 9 8-9 8" />
        </svg>
      </span>

      <span className={`${styles.brandText} zainex-wordmark`}><span className="zainex-wordmark-silver">Z</span><span className="zainex-wordmark-ai">AI</span><span className="zainex-wordmark-silver">NEX</span></span>
    </Link>
  );
}

/* ZAINEX_PAGE_SPECIFIC_HERO_VISUALS_V2_1 */

const heroVisualLabels: Record<
  PublicPageKey,
  string[]
> = {
  home: [
    "DATA",
    "INTELLIGENCE",
    "CONTROL",
  ],
  platform: [
    "TERMINAL",
    "ACCOUNT",
    "LEDGER",
  ],
  markets: [
    "CRYPTO",
    "FOREX",
    "STOCKS",
  ],
  intellibrain: [
    "OPENAI",
    "GEMINI",
    "DEEPSEEK",
  ],
  strategies: [
    "ACTIVATE",
    "ACCRUE",
    "COMPLETE",
  ],
  wallets: [
    "WALLET",
    "CREDITS",
    "LEDGER",
  ],
  security: [
    "IDENTITY",
    "RISK",
    "APPROVAL",
  ],
  company: [
    "PRODUCT",
    "ENGINEERING",
    "SCALE",
  ],
};

const heroVisualProfiles: Record<
  PublicPageKey,
  {
    icon: IconName;
    status: string;
    core: string;
    pipeline: string;
  }
> = {
  home: {
    icon: "spark",
    status: "OPERATIONAL",
    core: "ZAINEX CORE",
    pipeline: "MANUAL AUTHORITY",
  },
  platform: {
    icon: "layers",
    status: "SYNCHRONIZED",
    core: "PLATFORM",
    pipeline: "UNIFIED WORKSPACE",
  },
  markets: {
    icon: "chart",
    status: "LIVE",
    core: "MARKETS",
    pipeline: "EXPANDABLE CONNECTORS",
  },
  intellibrain: {
    icon: "brain",
    status: "MULTI-MODEL",
    core: "INTELIBRAIN",
    pipeline: "DETERMINISTIC GATE",
  },
  strategies: {
    icon: "strategy",
    status: "ACTIVE",
    core: "STRATEGY",
    pipeline: "ACCRUAL LIFECYCLE",
  },
  wallets: {
    icon: "wallet",
    status: "SYNCHRONIZED",
    core: "WALLET",
    pipeline: "LEDGER DISCIPLINE",
  },
  security: {
    icon: "shield",
    status: "VERIFIED",
    core: "SECURITY",
    pipeline: "VALIDATION FIRST",
  },
  company: {
    icon: "company",
    status: "BUILDING",
    core: "VISION",
    pipeline: "GLOBAL STANDARD",
  },
};

function getHeroVisualClass(
  page: PublicPageKey,
): string {
  const classes: Record<
    PublicPageKey,
    string
  > = {
    home: styles.heroVisual_home,
    platform:
      styles.heroVisual_platform,
    markets:
      styles.heroVisual_markets,
    intellibrain:
      styles.heroVisual_intellibrain,
    strategies:
      styles.heroVisual_strategies,
    wallets:
      styles.heroVisual_wallets,
    security:
      styles.heroVisual_security,
    company:
      styles.heroVisual_company,
  };

  return classes[page];
}
/* ZAINEX_PREMIUM_MOTION_SYSTEM_V3 */

function HeroDetailVisual({
  page,
}: {
  page: PublicPageKey;
}) {
  if (page === "markets") {
    return (
      <div
        className={styles.marketVisual}
        aria-hidden="true"
      >
        <div className={styles.marketVisualHeader}>
          <span>BTC / USDT</span>
          <strong>+2.84%</strong>
        </div>

        <svg
          viewBox="0 0 520 260"
          className={styles.marketChart}
        >
          <defs>
            <linearGradient
              id="zainex-market-area"
              x1="0"
              x2="0"
              y1="0"
              y2="1"
            >
              <stop
                offset="0%"
                stopColor="currentColor"
                stopOpacity="0.28"
              />
              <stop
                offset="100%"
                stopColor="currentColor"
                stopOpacity="0"
              />
            </linearGradient>
          </defs>

          <path
            className={styles.marketArea}
            d="M18 214 C54 195 78 202 104 173 C132 142 158 164 190 132 C220 102 250 128 278 91 C310 52 344 83 374 58 C405 33 442 51 502 22 L502 244 L18 244 Z"
          />

          <path
            className={styles.marketLine}
            pathLength="1"
            d="M18 214 C54 195 78 202 104 173 C132 142 158 164 190 132 C220 102 250 128 278 91 C310 52 344 83 374 58 C405 33 442 51 502 22"
          />

          <g className={styles.marketCandles}>
            <line x1="60" y1="156" x2="60" y2="220" />
            <rect x="53" y="172" width="14" height="30" rx="3" />
            <line x1="132" y1="116" x2="132" y2="180" />
            <rect x="125" y="130" width="14" height="34" rx="3" />
            <line x1="210" y1="96" x2="210" y2="158" />
            <rect x="203" y="112" width="14" height="28" rx="3" />
            <line x1="296" y1="52" x2="296" y2="120" />
            <rect x="289" y="72" width="14" height="30" rx="3" />
            <line x1="382" y1="34" x2="382" y2="92" />
            <rect x="375" y="49" width="14" height="28" rx="3" />
            <line x1="460" y1="10" x2="460" y2="66" />
            <rect x="453" y="23" width="14" height="26" rx="3" />
          </g>
        </svg>

        <div className={styles.marketTicker}>
          <span>24H HIGH</span>
          <strong>68,942.40</strong>
          <i />
          <span>VOLUME</span>
          <strong>1.82B</strong>
        </div>
      </div>
    );
  }

  if (page === "intellibrain") {
    return (
      <div
        className={styles.neuralVisual}
        aria-hidden="true"
      >
        <svg
          viewBox="0 0 520 320"
          className={styles.neuralGraph}
        >
          <g className={styles.neuralEdges}>
            <path d="M86 72 L224 154" />
            <path d="M86 160 L224 154" />
            <path d="M86 248 L224 154" />
            <path d="M224 154 L390 68" />
            <path d="M224 154 L424 156" />
            <path d="M224 154 L390 248" />
          </g>

          <g className={styles.neuralPulse}>
            <circle cx="86" cy="72" r="11" />
            <circle cx="86" cy="160" r="11" />
            <circle cx="86" cy="248" r="11" />
            <circle cx="224" cy="154" r="26" />
            <circle cx="390" cy="68" r="11" />
            <circle cx="424" cy="156" r="11" />
            <circle cx="390" cy="248" r="11" />
          </g>
        </svg>

        <span className={styles.neuralLabelOne}>
          OPENAI
        </span>

        <span className={styles.neuralLabelTwo}>
          GEMINI
        </span>

        <span className={styles.neuralLabelThree}>
          DEEPSEEK
        </span>

        <div className={styles.neuralDecision}>
          <small>CONSENSUS</small>
          <strong>WAIT</strong>
          <span>Risk gate active</span>
        </div>
      </div>
    );
  }

  if (page === "wallets") {
    return (
      <div
        className={styles.walletStreamVisual}
        aria-hidden="true"
      >
        <div className={styles.walletSourceCard}>
          <span>AVAILABLE WALLET</span>
          <strong>$8,222.82</strong>
          <small>Authoritative balance</small>
        </div>

        <div className={styles.walletFlow}>
          <i />
          <i />
          <i />
          <i />
        </div>

        <div className={styles.creditCore}>
          <Icon
            name="wallet"
            size={34}
          />

          <span>AI CREDITS</span>
          <strong>1:1</strong>
        </div>

        <div className={styles.walletLedger}>
          <div>
            <i />
            <span>CONVERTED</span>
            <strong>+100</strong>
          </div>

          <div>
            <i />
            <span>SENT</span>
            <strong>-25</strong>
          </div>

          <div>
            <i />
            <span>RECEIVED</span>
            <strong>+50</strong>
          </div>
        </div>
      </div>
    );
  }

  if (page === "strategies") {
    return (
      <div
        className={styles.strategyVisual}
        aria-hidden="true"
      >
        <div className={styles.strategyTrack}>
          <i />
          <i />
          <i />
        </div>

        {[
          ["01", "ACTIVATE"],
          ["02", "ACCRUE"],
          ["03", "RELEASE"],
        ].map(([step, label], index) => (
          <div
            key={step}
            className={`${styles.strategyNode} ${
              styles[
                `strategyNode${index + 1}` as
                  | "strategyNode1"
                  | "strategyNode2"
                  | "strategyNode3"
              ]
            }`}
          >
            <span>{step}</span>
            <strong>{label}</strong>
          </div>
        ))}

        <div className={styles.strategySummary}>
          <span>ACTIVE PRINCIPAL</span>
          <strong>$1,000.00</strong>
          <small>Day 12 of 30</small>
        </div>
      </div>
    );
  }

  if (page === "security") {
    return (
      <div
        className={styles.securityVisual}
        aria-hidden="true"
      >
        <div className={styles.securityRingOne} />
        <div className={styles.securityRingTwo} />
        <div className={styles.securityScanner} />

        <div className={styles.securityShield}>
          <Icon
            name="shield"
            size={48}
          />

          <span>VERIFIED</span>
        </div>

        <div className={styles.securityChecks}>
          <span>IDENTITY</span>
          <span>STOP LOSS</span>
          <span>MANUAL APPROVAL</span>
        </div>
      </div>
    );
  }

  if (page === "platform") {
    return (
      <div
        className={styles.platformVisual}
        aria-hidden="true"
      >
        <div className={styles.platformPanelMain}>
          <div className={styles.platformPanelHeader}>
            <i />
            <i />
            <i />
          </div>

          <div className={styles.platformChartLine}>
            <i />
          </div>

          <div className={styles.platformRows}>
            <span />
            <span />
            <span />
          </div>
        </div>

        <div className={styles.platformPanelSide}>
          <span>POSITION</span>
          <strong>LONG</strong>
          <small>Risk controlled</small>
        </div>

        <div className={styles.platformPanelBottom}>
          <span>ACCOUNT</span>
          <strong>SYNCHRONIZED</strong>
        </div>
      </div>
    );
  }

  if (page === "company") {
    return (
      <div
        className={styles.companyVisual}
        aria-hidden="true"
      >
        <div className={styles.companyCore}>
          <span>ZAINEX</span>
          <strong>OPERATING LAYER</strong>
        </div>

        <div className={styles.companyBlockOne}>
          PRODUCT
        </div>

        <div className={styles.companyBlockTwo}>
          ENGINEERING
        </div>

        <div className={styles.companyBlockThree}>
          SCALE
        </div>

        <div className={styles.companyConnectorOne} />
        <div className={styles.companyConnectorTwo} />
        <div className={styles.companyConnectorThree} />
      </div>
    );
  }

  return (
    <div
      className={styles.homeNetworkVisual}
      aria-hidden="true"
    >
      <span className={styles.homeNodeOne}>
        DATA
      </span>

      <span className={styles.homeNodeTwo}>
        RISK
      </span>

      <span className={styles.homeNodeThree}>
        AI
      </span>

      <i className={styles.homeLinkOne} />
      <i className={styles.homeLinkTwo} />
      <i className={styles.homeLinkThree} />
    </div>
  );
}
function HeroVisual({
  page,
}: {
  page: PublicPageKey;
}) {
  const labels =
    heroVisualLabels[page];

  const visual =
    heroVisualProfiles[page];

  return (
    <div
      className={`${styles.heroVisual} ${getHeroVisualClass(
        page,
      )}`}
      data-page={page}
    >
      <div className={styles.visualGrid} />

      <HeroDetailVisual page={page} />

      <div className={styles.visualTopline}>
        <span>
          SYSTEM STATUS
        </span>

        <strong>
          <i />
          {visual.status}
        </strong>
      </div>

      <div className={styles.orbitStage}>
        <div className={styles.orbitOne} />
        <div className={styles.orbitTwo} />
        <div className={styles.core}>
          <Icon
            name={visual.icon}
            size={38}
          />

          <small>
            {visual.core}
          </small>
        </div>

        {labels.map(
          (label, index) => (
            <div
              key={label}
              className={`${styles.satellite} ${
                styles[
                  `satellite${index + 1}` as
                    | "satellite1"
                    | "satellite2"
                    | "satellite3"
                ]
              }`}
            >
              <i />

              <span>{label}</span>
            </div>
          ),
        )}
      </div>

      <div className={styles.signalPanel}>
        <div>
          <span>
            DECISION PIPELINE
          </span>

          <strong>
            {visual.pipeline}
          </strong>
        </div>

        <div className={styles.signalBars}>
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
        </div>
      </div>
    </div>
  );
}

export function SiteHeader({
  mobileOpen,
  setMobileOpen,
}: {
  mobileOpen: boolean;
  setMobileOpen: (
    value: boolean,
  ) => void;
}) {
  const pathname = usePathname();

  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <Brand />

        <nav
          className={styles.desktopNav}
          aria-label="Public navigation"
        >
          {navigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={
                isActivePath(
                  pathname,
                  item.href,
                )
                  ? styles.activeNav
                  : undefined
              }
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className={styles.headerActions}>
          <Link
            href="/auth"
            className={styles.signInLink}
          >
            Sign in
          </Link>

          <Link
            href="/market"
            className={styles.launchButton}
          >
            Launch platform
            <Icon
              name="arrow"
              size={16}
            />
          </Link>

          <button
            type="button"
            className={styles.menuButton}
            aria-label={
              mobileOpen
                ? "Close navigation"
                : "Open navigation"
            }
            aria-expanded={mobileOpen}
            onClick={() => {
              setMobileOpen(
                !mobileOpen,
              );
            }}
          >
            <Icon
              name={
                mobileOpen
                  ? "x"
                  : "menu"
              }
            />
          </button>
        </div>
      </div>

      <div
        className={`${styles.mobileNav} ${
          mobileOpen
            ? styles.mobileNavOpen
            : ""
        }`}
      >
        {navigation.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={
              isActivePath(
                pathname,
                item.href,
              )
                ? styles.activeMobileNav
                : undefined
            }
            onClick={() => {
              setMobileOpen(false);
            }}
          >
            <span>{item.label}</span>
            <Icon
              name="arrow"
              size={16}
            />
          </Link>
        ))}

        <div className={styles.mobileActions}>
          <Link
            href="/auth"
            onClick={() => {
              setMobileOpen(false);
            }}
          >
            Sign in with Google
          </Link>

          <Link
            href="/market"
            onClick={() => {
              setMobileOpen(false);
            }}
          >
            Launch platform
          </Link>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer
      className={styles.footer}
      data-reveal="footer"
    >
      <div className={styles.footerTop}>
        <div>
          <Brand />

          <p>
            AI-native market
            intelligence with
            deterministic control and
            manual authority.
          </p>
        </div>

        <div className={styles.footerLinks}>
          <div>
            <span>PRODUCT</span>
            <Link href="/platform">
              Platform
            </Link>
            <Link href="/markets">
              Markets
            </Link>
            <Link href="/intellibrain">
              InteliBrain
            </Link>
            <Link href="/strategies">
              Strategies
            </Link>
          </div>

          <div>
            <span>INFRASTRUCTURE</span>
            <Link href="/wallets">
              Wallets
            </Link>
            <Link href="/security">
              Security
            </Link>
            <Link href="/company">
              Company
            </Link>
            <Link href="/auth">
              Sign in
            </Link>
          </div>
        </div>
      </div>

      <div className={styles.footerBottom}>
        <span>
          &copy; {new Date().getFullYear()} ZAINEX
        </span>

        <span>
          Paper trading environment.
          No autonomous execution.
        </span>
      </div>
    </footer>
  );
}

export function PublicSite({
  page,
}: {
  page: PublicPageKey;
}) {
  const data = pages[page];

  const [
    mobileOpen,
    setMobileOpen,
  ] = useState(false);

  const pathname = usePathname();

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useBodyScrollLock(mobileOpen);

  useEffect(() => {
    const body =
      document.body;

    body.dataset.publicReveal =
      "ready";

    const sections = Array.from(
      document.querySelectorAll<HTMLElement>(
        "[data-reveal]",
      ),
    );

    sections.forEach((section) => {
      delete section.dataset.visible;
    });

    const reducedMotion =
      window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;

    if (
      reducedMotion ||
      !("IntersectionObserver" in window)
    ) {
      sections.forEach((section) => {
        section.dataset.visible =
          "true";
      });

      return;
    }

    const observer =
      new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) {
              return;
            }

            (
              entry.target as HTMLElement
            ).dataset.visible =
              "true";

            observer.unobserve(
              entry.target,
            );
          });
        },
        {
          threshold: 0.14,
          rootMargin:
            "0px 0px -8% 0px",
        },
      );

    sections.forEach((section) => {
      observer.observe(section);
    });

    return () => {
      observer.disconnect();
    };
  }, [pathname]);
  const pageNumber = useMemo(
    () =>
      String(
        Math.max(
          1,
          navigation.findIndex(
            (item) =>
              isActivePath(
                pathname,
                item.href,
              ),
          ) + 1,
        ),
      ).padStart(2, "0"),
    [pathname],
  );

  return (
    <main className={styles.site}>
      <div
        className={styles.noise}
        aria-hidden="true"
      />

      <div
        className={styles.ambientOne}
        aria-hidden="true"
      />

      <div
        className={styles.ambientTwo}
        aria-hidden="true"
      />

      <SiteHeader
        mobileOpen={mobileOpen}
        setMobileOpen={
          setMobileOpen
        }
      />

      <section
        className={styles.hero}
        data-reveal="hero"
      >
        <div className={styles.heroCopy}>
          <div className={styles.pageIndex}>
            <span>{pageNumber}</span>
            <i />
            <small>
              ZAINEX SYSTEM
            </small>
          </div>

          <p className={styles.eyebrow}>
            <span />
            {data.eyebrow}
          </p>

          <h1>
            {data.title}
            <span>
              {data.accent}
            </span>
          </h1>

          <p
            className={
              styles.heroDescription
            }
          >
            {data.description}
          </p>

          <div className={styles.heroActions}>
            <Link
              href={data.primaryHref}
              className={
                styles.primaryCta
              }
            >
              {data.primaryLabel}
              <Icon
                name="arrow"
                size={17}
              />
            </Link>

            <Link
              href={
                data.secondaryHref
              }
              className={
                styles.secondaryCta
              }
            >
              {data.secondaryLabel}
            </Link>
          </div>

          <div className={styles.metrics}>
            {data.metrics.map(
              (metric, metricIndex) => (
                <div
                  key={`${metric.label}-${metricIndex}`}
                >
                  <strong>
                    {metric.value}
                  </strong>

                  <span>
                    {metric.label}
                  </span>
                </div>
              ),
            )}
          </div>
        </div>

        <HeroVisual page={page} />
      </section>

      <section
        className={styles.intro}
        data-reveal="intro"
      >
        <div>
          <p className={styles.sectionEyebrow}>
            {data.sectionEyebrow}
          </p>

          <h2>
            {data.sectionTitle}
          </h2>
        </div>

        <p>{data.sectionCopy}</p>
      </section>

      <section
        className={styles.cardGrid}
        data-reveal="cards"
      >
        {data.cards.map(
          (card, index) => (
            <article
              key={card.title}
              className={styles.featureCard}
            >
              <div
                className={
                  styles.cardTop
                }
              >
                <span
                  className={
                    styles.cardIcon
                  }
                >
                  <Icon
                    name={card.icon}
                  />
                </span>

                <small>
                  0{index + 1}
                </small>
              </div>

              <span
                className={
                  styles.cardTag
                }
              >
                {card.tag}
              </span>

              <h3>{card.title}</h3>

              <p>{card.copy}</p>

              <div
                className={
                  styles.cardLine
                }
              />
            </article>
          ),
        )}
      </section>

      <section
        className={styles.workflowSection}
        data-reveal="workflow"
      >
        <div
          className={
            styles.workflowHeading
          }
        >
          <div>
            <p
              className={
                styles.sectionEyebrow
              }
            >
              SYSTEM FLOW
            </p>

            <h2>
              {data.workflowTitle}
            </h2>
          </div>

          <p>{data.workflowCopy}</p>
        </div>

        <div className={styles.workflow}>
          {data.workflow.map(
            (item, index) => (
              <article key={item.step}>
                <div
                  className={
                    styles.workflowNumber
                  }
                >
                  <span>{item.step}</span>

                  {index <
                  data.workflow.length -
                    1 ? (
                    <i />
                  ) : null}
                </div>

                <div>
                  <h3>
                    {item.title}
                  </h3>

                  <p>{item.copy}</p>
                </div>
              </article>
            ),
          )}
        </div>
      </section>

      <section
        className={styles.statement}
        data-reveal="statement"
      >
        <div
          className={
            styles.statementMark
          }
        >
          <Icon
            name="spark"
            size={24}
          />
        </div>

        <p>{data.statement}</p>

        <Link href="/market">
          Enter ZAINEX
          <Icon
            name="arrow"
            size={18}
          />
        </Link>
      </section>

      <SiteFooter />
    </main>
  );
}
