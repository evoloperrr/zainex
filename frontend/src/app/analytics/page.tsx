"use client";

import Link from "next/link";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  DesktopSidebar,
} from "../../components/market-dashboard";

import { SharedProfileMenu } from "@/components/shared-profile-menu";
import { NeuralOrbit } from "@/components/neural-orbit";

import billingStyles from "../billing/billing.module.css";
import styles from "./analytics.module.css";

type FuturesTradeRecord = {
  action: "OPEN" | "CLOSE" | "LIQUIDATE";
  realizedPnl: number;
};

type SpotTradeRecord = {
  assetClass: "crypto" | "forex" | "stocks";
  side: "BUY" | "SELL";
  realizedPnl: number;
};

function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatSignedUsd(value: number): string {
  const formatted = formatUsd(Math.abs(value));

  if (value > 0.000001) {
    return `+${formatted}`;
  }

  if (value < -0.000001) {
    return `-${formatted}`;
  }

  return formatted;
}

function pnlClass(value: number): string {
  if (value > 0.000001) {
    return styles.positive;
  }

  if (value < -0.000001) {
    return styles.negative;
  }

  return "";
}

function AnalyticsContent() {
  const [futuresTrades, setFuturesTrades] = useState<
    FuturesTradeRecord[]
  >([]);

  const [spotTrades, setSpotTrades] = useState<
    SpotTradeRecord[]
  >([]);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const [futuresResult, spotResult] = await Promise.allSettled([
          fetch("/api/trading/futures/account", {
            cache: "no-store",
            credentials: "same-origin",
          }),
          fetch("/api/trading/account", {
            cache: "no-store",
            credentials: "same-origin",
          }),
        ]);

        if (cancelled) {
          return;
        }

        if (futuresResult.status === "fulfilled" && futuresResult.value.ok) {
          const payload = (await futuresResult.value.json()) as {
            account?: { trades?: FuturesTradeRecord[] };
          };

          setFuturesTrades(payload.account?.trades ?? []);
        }

        if (spotResult.status === "fulfilled" && spotResult.value.ok) {
          const payload = (await spotResult.value.json()) as {
            account?: { trades?: SpotTradeRecord[] };
          };

          setSpotTrades(payload.account?.trades ?? []);
        }
      }
      finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const stats = useMemo(() => {
    const closedFutures = futuresTrades.filter(
      (trade) => trade.action !== "OPEN",
    );

    const closedSpot = spotTrades.filter(
      (trade) => trade.side === "SELL",
    );

    const closedTrades = [...closedFutures, ...closedSpot];

    const wins = closedTrades.filter(
      (trade) => trade.realizedPnl > 0.000001,
    ).length;

    const losses = closedTrades.filter(
      (trade) => trade.realizedPnl < -0.000001,
    ).length;

    const winRate =
      closedTrades.length > 0
        ? (wins / closedTrades.length) * 100
        : 0;

    const totalRealizedPnl = closedTrades.reduce(
      (sum, trade) => sum + trade.realizedPnl,
      0,
    );

    const bestTrade = closedTrades.reduce(
      (best, trade) =>
        trade.realizedPnl > best ? trade.realizedPnl : best,
      0,
    );

    const worstTrade = closedTrades.reduce(
      (worst, trade) =>
        trade.realizedPnl < worst ? trade.realizedPnl : worst,
      0,
    );

    const marketCounts: Record<string, number> = {
      crypto: 0,
      forex: 0,
      stocks: 0,
      futures: futuresTrades.length,
    };

    for (const trade of spotTrades) {
      marketCounts[trade.assetClass] += 1;
    }

    const totalTrades =
      futuresTrades.length + spotTrades.length;

    return {
      totalTrades,
      closedCount: closedTrades.length,
      wins,
      losses,
      winRate,
      totalRealizedPnl,
      bestTrade,
      worstTrade,
      marketCounts,
    };
  }, [futuresTrades, spotTrades]);

  const marketBreakdown = [
    { label: "CRYPTO", count: stats.marketCounts.crypto },
    { label: "FOREX", count: stats.marketCounts.forex },
    { label: "STOCKS", count: stats.marketCounts.stocks },
    { label: "FUTURES", count: stats.marketCounts.futures },
  ];

  const maxCount = Math.max(
    1,
    ...marketBreakdown.map((item) => item.count),
  );

  return (
    <div className={billingStyles.page}>
      <div className={billingStyles.glow} aria-hidden="true" />

      <header className={billingStyles.header}>
        <Link href="/dashboard" className={billingStyles.brand}>
          <span className={billingStyles.logo}>Z</span>

          <span className={billingStyles.brandText}>
            <strong className="zainex-wordmark"><span className="zainex-wordmark-silver">Z</span><span className="zainex-wordmark-ai">AI</span><span className="zainex-wordmark-silver">NEX</span></strong>
            <small>AI INTELITRADE</small>
          </span>
        </Link>

        <div className={billingStyles.headerRight}>
          <span className={billingStyles.secure}>
            <i />
            {loading ? "Syncing" : "Analytics synced"}
          </span>

          <Link href="/market" className={billingStyles.back}>
            Back to terminal
          </Link>

          <SharedProfileMenu />
        </div>
      </header>

      <div className={billingStyles.content}>
        <section className={billingStyles.hero}>
          <div>
            <span className={billingStyles.eyebrow}>
              TRADING PERFORMANCE
            </span>

            <h1>
              Your track
              <span> record.</span>
            </h1>

            <p>
              Win rate, realized PnL, and market activity
              computed from every paper Spot and Futures
              execution on your account.
            </p>
          </div>
        </section>

        <section className={styles.stage}>
          <div className={styles.statGrid}>
            <div className={styles.statCard}>
              <span>TOTAL TRADES</span>
              <strong>{stats.totalTrades}</strong>
            </div>

            <div className={styles.statCard}>
              <span>WIN RATE</span>
              <strong>
                {stats.closedCount > 0
                  ? `${stats.winRate.toFixed(1)}%`
                  : "--"}
              </strong>
            </div>

            <div className={styles.statCard}>
              <span>REALIZED PNL</span>
              <strong className={pnlClass(stats.totalRealizedPnl)}>
                {formatSignedUsd(stats.totalRealizedPnl)}
              </strong>
            </div>

            <div className={styles.statCard}>
              <span>WINS / LOSSES</span>
              <strong>
                {stats.wins} / {stats.losses}
              </strong>
            </div>

            <div className={styles.statCard}>
              <span>BEST TRADE</span>
              <strong className={styles.positive}>
                {formatSignedUsd(stats.bestTrade)}
              </strong>
            </div>

            <div className={styles.statCard}>
              <span>WORST TRADE</span>
              <strong className={styles.negative}>
                {formatSignedUsd(stats.worstTrade)}
              </strong>
            </div>
          </div>

          <div className={styles.orbitCard}>
            <NeuralOrbit
              label="WIN RATE"
              value={
                stats.closedCount > 0
                  ? `${stats.winRate.toFixed(0)}%`
                  : "--"
              }
              caption={`${stats.closedCount} closed trades`}
            />
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <span>ACTIVITY BY MARKET</span>
          </div>

          {stats.totalTrades === 0 ? (
            <div className={styles.emptyState}>
              No trades yet. Execute a paper order from
              the market terminal to start building your
              analytics.
            </div>
          ) : (
            marketBreakdown.map((item) => (
              <div key={item.label} className={styles.breakdownRow}>
                <span>{item.label}</span>

                <div className={styles.barTrack}>
                  <span
                    className={styles.barFill}
                    style={{
                      width: `${(item.count / maxCount) * 100}%`,
                    }}
                  />
                </div>

                <strong>{item.count}</strong>
              </div>
            ))
          )}
        </section>
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  return (
    <main className="zainex-app">
      <div className="desktop-app-frame">
        <DesktopSidebar activeLabel="Analytics" />

        <section
          className={`desktop-shell ${billingStyles.desktopContent}`}
        >
          <AnalyticsContent />
        </section>
      </div>

      <div className={billingStyles.mobileContent}>
        <AnalyticsContent />
      </div>
    </main>
  );
}
