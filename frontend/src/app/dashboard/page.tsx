"use client";

/* ZAINEX_DASHBOARD_COMMAND_CENTER_V1 */

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  DesktopSidebar,
} from "@/components/market-dashboard";

import {
  SharedProfileMenu,
} from "@/components/shared-profile-menu";

import chromeStyles from "../billing/billing.module.css";
import styles from "./dashboard.module.css";

type SyncState =
  | "loading"
  | "live"
  | "partial"
  | "offline";

type MarketSummary = {
  label?: unknown;
  symbol?: unknown;
  price?: unknown;
  rawPrice?: unknown;
  change?: unknown;
  volume?: unknown;
  liquidity?: unknown;
  score?: unknown;
  trust?: unknown;
};

type AccountUser = {
  name?: unknown;
  email?: unknown;
  role?: unknown;
  walletBalance?: unknown;
  credits?: unknown;
};

type AccountSnapshot = {
  initialBalance?: unknown;
  availableBalance?: unknown;
  usedMargin?: unknown;
  totalEquity?: unknown;
  realizedPnl?: unknown;
  unrealizedPnl?: unknown;
  positions?: unknown[];
  user?: AccountUser | null;
};

const fallbackPulse = [
  42,
  44,
  43,
  47,
  46,
  51,
  49,
  54,
  53,
  57,
  55,
  61,
  59,
  63,
  62,
  66,
  65,
  69,
  67,
  72,
  71,
  74,
  73,
  77,
];

function asRecord(
  value: unknown,
): Record<string, unknown> | null {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    return null;
  }

  return value as Record<
    string,
    unknown
  >;
}

function optionalNumber(
  value: unknown,
): number | null {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(
            value.replace(
              /[^0-9.-]/g,
              "",
            ),
          )
        : Number.NaN;

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function displayText(
  value: unknown,
  fallback = "--",
): string {
  if (
    typeof value === "string" &&
    value.trim()
  ) {
    return value.trim();
  }

  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return String(value);
  }

  return fallback;
}

function formatUsd(
  value: number | null,
): string {
  if (value === null) {
    return "--";
  }

  return new Intl.NumberFormat(
    "en-US",
    {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    },
  ).format(value);
}

function formatSignedUsd(
  value: number | null,
): string {
  if (value === null) {
    return "--";
  }

  const formatted =
    new Intl.NumberFormat(
      "en-US",
      {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
      },
    ).format(
      Math.abs(value),
    );

  if (value > 0) {
    return `+${formatted}`;
  }

  if (value < 0) {
    return `-${formatted}`;
  }

  return formatted;
}

function formatPercent(
  value: number,
): string {
  return `${Math.max(
    0,
    Math.min(
      100,
      value,
    ),
  ).toFixed(0)}%`;
}

function extractSummary(
  payload: unknown,
): MarketSummary | null {
  const root = asRecord(payload);

  const summary =
    asRecord(root?.summary) ??
    asRecord(
      asRecord(root?.data)
        ?.summary,
    );

  return summary as
    | MarketSummary
    | null;
}

function extractAccount(
  payload: unknown,
): AccountSnapshot | null {
  const root = asRecord(payload);
  const result =
    asRecord(root?.result);
  const data =
    asRecord(root?.data);

  const candidates = [
    root?.account,
    result?.account,
    data?.account,
    root?.snapshot,
  ];

  for (
    const candidate of candidates
  ) {
    const account =
      asRecord(candidate);

    if (account) {
      return account as
        AccountSnapshot;
    }
  }

  return null;
}

function extractCloses(
  payload: unknown,
): number[] {
  const root = asRecord(payload);
  const data =
    asRecord(root?.data);

  const candidates: unknown[] = [
    root?.candles,
    data?.candles,
    root?.data,
  ];

  for (
    const candidate of candidates
  ) {
    if (!Array.isArray(candidate)) {
      continue;
    }

    const closes =
      candidate
        .map((item) => {
          if (Array.isArray(item)) {
            return optionalNumber(
              item[4],
            );
          }

          const candle =
            asRecord(item);

          return optionalNumber(
            candle?.close ??
              candle?.c,
          );
        })
        .filter(
          (
            value,
          ): value is number =>
            value !== null,
        );

    if (closes.length > 1) {
      return closes;
    }
  }

  return [];
}

function createSparklinePath(
  values: number[],
  width: number,
  height: number,
): string {
  if (values.length < 2) {
    return "";
  }

  const minimum =
    Math.min(...values);

  const maximum =
    Math.max(...values);

  const range =
    maximum - minimum || 1;

  return values
    .map(
      (
        value,
        index,
      ) => {
        const x =
          (
            index /
            (values.length - 1)
          ) *
          width;

        const y =
          height -
          (
            (value - minimum) /
            range
          ) *
            height;

        return `${
          index === 0
            ? "M"
            : "L"
        } ${x.toFixed(2)} ${y.toFixed(2)}`;
      },
    )
    .join(" ");
}

function parseChange(
  value: unknown,
): number {
  const text =
    displayText(value, "0");

  const match =
    text.match(
      /-?\d+(?:\.\d+)?/,
    );

  if (!match) {
    return 0;
  }

  const parsed =
    Number(match[0]);

  return Number.isFinite(parsed)
    ? parsed
    : 0;
}

export default function DashboardPage() {
  const [
    market,
    setMarket,
  ] = useState<MarketSummary | null>(
    null,
  );

  const [
    account,
    setAccount,
  ] = useState<AccountSnapshot | null>(
    null,
  );

  const [
    closes,
    setCloses,
  ] = useState<number[]>([]);

  const [
    syncState,
    setSyncState,
  ] = useState<SyncState>(
    "loading",
  );

  const [
    lastSync,
    setLastSync,
  ] = useState<Date | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;

    async function loadMarket(): Promise<boolean> {
      const endpoint =
        new URL(
          "/api/market/candles",
          window.location.origin,
        );

      endpoint.searchParams.set(
        "market",
        "crypto",
      );

      endpoint.searchParams.set(
        "interval",
        "1h",
      );

      endpoint.searchParams.set(
        "limit",
        "48",
      );

      const response =
        await fetch(
          endpoint,
          {
            cache: "no-store",
          },
        );

      if (!response.ok) {
        return false;
      }

      const payload =
        (await response.json()) as
          unknown;

      if (cancelled) {
        return false;
      }

      const summary =
        extractSummary(payload);

      const nextCloses =
        extractCloses(payload);

      if (summary) {
        setMarket(summary);
      }

      if (nextCloses.length > 1) {
        setCloses(nextCloses);
      }

      return summary !== null;
    }

    async function loadAccount(): Promise<boolean> {
      const response =
        await fetch(
          "/api/trading/futures/account",
          {
            cache: "no-store",
          },
        );

      if (!response.ok) {
        return false;
      }

      const payload =
        (await response.json()) as
          unknown;

      if (cancelled) {
        return false;
      }

      const nextAccount =
        extractAccount(payload);

      if (nextAccount) {
        setAccount(nextAccount);
      }

      return nextAccount !== null;
    }

    async function refresh(): Promise<void> {
      const results =
        await Promise.allSettled([
          loadMarket(),
          loadAccount(),
        ]);

      if (cancelled) {
        return;
      }

      const successful =
        results.filter(
          (result) =>
            result.status ===
              "fulfilled" &&
            result.value,
        ).length;

      setSyncState(
        successful === 2
          ? "live"
          : successful === 1
            ? "partial"
            : "offline",
      );

      setLastSync(
        new Date(),
      );
    }

    void refresh();

    const timer =
      window.setInterval(
        () => {
          void refresh();
        },
        30000,
      );

    return () => {
      cancelled = true;

      window.clearInterval(
        timer,
      );
    };
  }, []);

  const chartValues =
    closes.length > 1
      ? closes
      : fallbackPulse;

  const sparklinePath =
    useMemo(
      () =>
        createSparklinePath(
          chartValues,
          560,
          210,
        ),
      [chartValues],
    );

  const areaPath =
    sparklinePath
      ? `${sparklinePath} L 560 210 L 0 210 Z`
      : "";

  const totalEquity =
    optionalNumber(
      account?.totalEquity,
    ) ??
    optionalNumber(
      account?.user
        ?.walletBalance,
    );

  const availableBalance =
    optionalNumber(
      account?.availableBalance,
    );

  const usedMargin =
    optionalNumber(
      account?.usedMargin,
    );

  const realizedPnl =
    optionalNumber(
      account?.realizedPnl,
    );

  const unrealizedPnl =
    optionalNumber(
      account?.unrealizedPnl,
    );

  const credits =
    optionalNumber(
      account?.user?.credits,
    );

  const openPositions =
    Array.isArray(
      account?.positions,
    )
      ? account.positions.length
      : 0;

  const exposurePercent =
    totalEquity !== null &&
    totalEquity > 0 &&
    usedMargin !== null
      ? Math.min(
          100,
          Math.max(
            0,
            (
              usedMargin /
              totalEquity
            ) *
              100,
          ),
        )
      : 0;

  const marketChange =
    parseChange(
      market?.change,
    );

  const marketPrice =
    displayText(
      market?.price ??
        market?.rawPrice,
    );

  const marketChangeText =
    displayText(
      market?.change,
      "Awaiting market",
    );

  const marketSymbol =
    displayText(
      market?.symbol,
      "BTCUSDT",
    );

  const marketLabel =
    displayText(
      market?.label,
      "Bitcoin / USDT",
    );

  const momentumLabel =
    marketChange > 0.6
      ? "Momentum expanding"
      : marketChange < -0.6
        ? "Defensive posture"
        : "Range discipline";

  const postureLabel =
    exposurePercent >= 65
      ? "High exposure"
      : exposurePercent >= 30
        ? "Measured exposure"
        : "Capital preserved";

  const syncLabel =
    syncState === "live"
      ? "Live systems synchronized"
      : syncState === "partial"
        ? "Partial system sync"
        : syncState === "offline"
          ? "System data unavailable"
          : "Synchronizing systems";

  const syncClass =
    syncState === "live"
      ? styles.syncLive
      : syncState === "partial"
        ? styles.syncPartial
        : syncState === "offline"
          ? styles.syncOffline
          : styles.syncLoading;

  const pnlClass =
    realizedPnl !== null &&
    realizedPnl > 0
      ? styles.positive
      : realizedPnl !== null &&
          realizedPnl < 0
        ? styles.negative
        : styles.neutral;

  const changeClass =
    marketChange > 0
      ? styles.positive
      : marketChange < 0
        ? styles.negative
        : styles.neutral;

  const intelligenceItems = [
    {
      title: momentumLabel,
      copy:
        marketChange > 0.6
          ? "Price pressure is leaning upward. Confirm trend structure before approving a position."
          : marketChange < -0.6
            ? "Price pressure is leaning downward. Protect available capital and require strong confirmation."
            : "Current movement is balanced. Wait for cleaner expansion before increasing exposure.",
    },
    {
      title: postureLabel,
      copy:
        exposurePercent > 0
          ? `${formatPercent(
              exposurePercent,
            )} of current equity is represented by used margin.`
          : "No meaningful margin exposure is currently detected.",
    },
    {
      title: "Manual approval enforced",
      copy:
        "ZAINEX intelligence provides context only. LONG, SHORT, BUY, SELL, or WAIT remains under your control.",
    },
  ];

  return (
    <main className={`zainex-app ${styles.shell}`}>
      <div
        className={styles.ambient}
        aria-hidden="true"
      />

      <div className="desktop-app-frame">
        {/* ZAINEX_DASHBOARD_ORIGINAL_SIDEBAR_PHASE2 */}
        {/* ZAINEX_DASHBOARD_EXACT_SHELL_HEADER_V1 */}
        <DesktopSidebar
          activeLabel="Dashboard"
        />

        <section
          className={`desktop-shell ${styles.page}`}
        >
        <header className={chromeStyles.header}>
          <Link
            href="/dashboard"
            className={chromeStyles.brand}
          >
            <span className={chromeStyles.logo}>
              Z
            </span>

            <span className={chromeStyles.brandText}>
              <strong className="zainex-wordmark"><span className="zainex-wordmark-silver">Z</span><span className="zainex-wordmark-ai">AI</span><span className="zainex-wordmark-silver">NEX</span></strong>
              <small>AI INTELITRADE</small>
            </span>
          </Link>

          <div className={chromeStyles.headerRight}>
            <span className={chromeStyles.secure}>
              <i />
              {syncLabel}
            </span>

            <Link
              href="/market"
              className={chromeStyles.back}
            >
              Back to terminal
            </Link>

            <SharedProfileMenu />
          </div>
        </header>

        <div className={styles.content}>
          <section className={styles.intro}>
            <div className={styles.introCopy}>
              <span className={styles.eyebrow}>
                ZAINEX COMMAND CENTER
              </span>

              <h1 className={styles.introTitle}>
                See the system.
                <span>
                  {" "}
                  Control the decision.
                </span>
              </h1>

              <p className={styles.introText}>
                Capital, market movement, risk posture,
                and deterministic intelligence in one
                operational view.
              </p>
            </div>

            <div className={styles.introActions}>
              <Link
                href="/market"
                className={styles.primaryAction}
              >
                Open market terminal
              </Link>

              <Link
                href="/ai-strategies"
                className={styles.secondaryAction}
              >
                Review AI strategies
              </Link>
            </div>
          </section>

          <section className={styles.commandStage}>
            <div className={styles.equityZone}>
              <span className={styles.sectionTag}>
                LIVE CAPITAL POSITION
              </span>

              <strong className={styles.equityValue}>
                {formatUsd(
                  totalEquity,
                )}
              </strong>

              <span className={styles.equityCaption}>
                Total paper Futures equity
              </span>

              <div className={styles.equityMeta}>
                <div>
                  <span>
                    Available
                  </span>

                  <strong>
                    {formatUsd(
                      availableBalance,
                    )}
                  </strong>
                </div>

                <div>
                  <span>
                    Realized PnL
                  </span>

                  <strong className={pnlClass}>
                    {formatSignedUsd(
                      realizedPnl,
                    )}
                  </strong>
                </div>

                <div>
                  <span>
                    Open PnL
                  </span>

                  <strong>
                    {formatSignedUsd(
                      unrealizedPnl,
                    )}
                  </strong>
                </div>
              </div>

              <div className={styles.actionRail}>
                <Link href="/wallet">
                  Wallet detail
                </Link>

                <Link href="/market">
                  Trade manually
                </Link>
              </div>
            </div>

            <div className={styles.orbitZone}>
              <div
                className={styles.orbitGlow}
                aria-hidden="true"
              />

              <div className={styles.orbitFrame}>
                <div
                  className={styles.orbitRing}
                  aria-hidden="true"
                />

                <div className={styles.orbitCore}>
                  <span>
                    {marketSymbol}
                  </span>

                  <strong>
                    {marketPrice}
                  </strong>

                  <small className={changeClass}>
                    {marketChangeText}
                  </small>
                </div>
              </div>

              <svg
                className={styles.chart}
                viewBox="0 0 560 210"
                preserveAspectRatio="none"
                aria-label={`${marketLabel} market pulse`}
              >
                <defs>
                  <linearGradient
                    id="zainexDashboardLine"
                    x1="0"
                    x2="1"
                  >
                    <stop
                      offset="0%"
                      stopColor="#39ddff"
                    />
                    <stop
                      offset="52%"
                      stopColor="#786dff"
                    />
                    <stop
                      offset="100%"
                      stopColor="#db4fff"
                    />
                  </linearGradient>

                  <linearGradient
                    id="zainexDashboardArea"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="0%"
                      stopColor="#765cff"
                      stopOpacity=".25"
                    />
                    <stop
                      offset="100%"
                      stopColor="#765cff"
                      stopOpacity="0"
                    />
                  </linearGradient>
                </defs>

                <path
                  d={areaPath}
                  fill="url(#zainexDashboardArea)"
                />

                <path
                  d={sparklinePath}
                  fill="none"
                  stroke="url(#zainexDashboardLine)"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>

            <aside className={styles.briefZone}>
              <header className={styles.briefHeader}>
                <span>
                  DETERMINISTIC BRIEF
                </span>

                <strong>
                  Intelligence layer
                </strong>
              </header>

              <div className={styles.briefList}>
                {intelligenceItems.map(
                  (
                    item,
                    index,
                  ) => (
                    <article
                      key={item.title}
                      className={styles.briefItem}
                    >
                      <span className={styles.briefIndex}>
                        {String(
                          index + 1,
                        ).padStart(
                          2,
                          "0",
                        )}
                      </span>

                      <div className={styles.briefCopy}>
                        <strong>
                          {item.title}
                        </strong>

                        <p>
                          {item.copy}
                        </p>
                      </div>
                    </article>
                  ),
                )}
              </div>

              <footer className={styles.briefFooter}>
                Context only. No automatic order execution.
              </footer>
            </aside>
          </section>

          <section className={styles.dataRiver}>
            <article className={styles.riverItem}>
              <span className={styles.riverLabel}>
                MARKET
              </span>

              <strong className={styles.riverValue}>
                {marketLabel}
              </strong>
            </article>

            <article className={styles.riverItem}>
              <span className={styles.riverLabel}>
                24H / LIVE CHANGE
              </span>

              <strong
                className={`${styles.riverValue} ${changeClass}`}
              >
                {marketChangeText}
              </strong>
            </article>

            <article className={styles.riverItem}>
              <span className={styles.riverLabel}>
                OPEN POSITIONS
              </span>

              <strong className={styles.riverValue}>
                {openPositions}
              </strong>
            </article>

            <article className={styles.riverItem}>
              <span className={styles.riverLabel}>
                AI CREDITS
              </span>

              <strong className={styles.riverValue}>
                {credits === null
                  ? "--"
                  : credits.toLocaleString(
                      "en-US",
                    )}
              </strong>
            </article>
          </section>

          <section className={styles.lowerGrid}>
            <section className={styles.tape}>
              <header className={styles.sectionHeader}>
                <div>
                  <span>
                    OPERATIONAL TAPE
                  </span>

                  <h2>
                    What needs attention now
                  </h2>
                </div>

                <Link href="/market">
                  Full terminal
                </Link>
              </header>

              <div className={styles.tapeRows}>
                <article className={styles.tapeRow}>
                  <span className={styles.tapeIcon}>
                    01
                  </span>

                  <div className={styles.tapeCopy}>
                    <strong>
                      {marketSymbol} market pulse
                    </strong>

                    <small>
                      {momentumLabel}. Verify candle structure
                      before manual approval.
                    </small>
                  </div>

                  <b className={changeClass}>
                    {marketChangeText}
                  </b>
                </article>

                <article className={styles.tapeRow}>
                  <span className={styles.tapeIcon}>
                    02
                  </span>

                  <div className={styles.tapeCopy}>
                    <strong>
                      Futures account posture
                    </strong>

                    <small>
                      {openPositions} open position
                      {openPositions === 1
                        ? ""
                        : "s"}{" "}
                      with {formatPercent(
                        exposurePercent,
                      )} equity exposure.
                    </small>
                  </div>

                  <b>
                    {postureLabel}
                  </b>
                </article>

                <article className={styles.tapeRow}>
                  <span className={styles.tapeIcon}>
                    03
                  </span>

                  <div className={styles.tapeCopy}>
                    <strong>
                      Safety gate active
                    </strong>

                    <small>
                      Signals remain advisory. Order execution
                      requires explicit user action.
                    </small>
                  </div>

                  <b className={styles.positive}>
                    MANUAL
                  </b>
                </article>
              </div>
            </section>

            <aside className={styles.posture}>
              <header className={styles.sectionHeader}>
                <div>
                  <span>
                    ACCOUNT POSTURE
                  </span>

                  <h2>
                    Exposure discipline
                  </h2>
                </div>
              </header>

              <div className={styles.postureGauge}>
                <div className={styles.gaugeTrack}>
                  <span
                    className={styles.gaugeFill}
                    style={{
                      width:
                        formatPercent(
                          exposurePercent,
                        ),
                    }}
                  />
                </div>

                <strong>
                  {formatPercent(
                    exposurePercent,
                  )}
                </strong>

                <small>
                  Used margin relative to current equity
                </small>
              </div>

              <div className={styles.postureList}>
                <div className={styles.postureRow}>
                  <span>
                    Used margin
                  </span>

                  <strong>
                    {formatUsd(
                      usedMargin,
                    )}
                  </strong>
                </div>

                <div className={styles.postureRow}>
                  <span>
                    Available balance
                  </span>

                  <strong>
                    {formatUsd(
                      availableBalance,
                    )}
                  </strong>
                </div>

                <div className={styles.postureRow}>
                  <span>
                    Risk posture
                  </span>

                  <strong>
                    {postureLabel}
                  </strong>
                </div>
              </div>

              <Link
                href="/wallet"
                className={styles.postureLink}
              >
                Inspect wallet and ledger
              </Link>
            </aside>
          </section>

          <p className={styles.footnote}>
            Market context and account metrics refresh every
            30 seconds. ZAINEX never opens a trade without
            explicit approval.
          </p>
        </div>
        </section>
      </div>
    </main>
  );
}