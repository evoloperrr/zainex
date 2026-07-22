"use client";

import Link from "next/link";

import {
  useEffect,
  useState,
} from "react";

import {
  DesktopSidebar,
} from "../../components/market-dashboard";

import { SharedProfileMenu } from "@/components/shared-profile-menu";
import { NeuralOrbit } from "@/components/neural-orbit";

import billingStyles from "../billing/billing.module.css";
import styles from "./portfolio.module.css";

type FuturesPosition = {
  id: string;
  symbol: string;
  direction: "LONG" | "SHORT";
  leverage: number;
  unrealizedPnl: number;
  quantity: number;
  markPrice: number;
};

type FuturesTradeRecord = {
  id: string;
  action: "OPEN" | "CLOSE" | "LIQUIDATE";
  direction: "LONG" | "SHORT";
  symbol: string;
  price: number;
  realizedPnl: number;
  executedAt: string;
};

type FuturesAccount = {
  currency: "USDT";
  availableBalance: number;
  usedMargin: number;
  totalEquity: number;
  realizedPnl: number;
  unrealizedPnl: number;
  positions: FuturesPosition[];
  trades: FuturesTradeRecord[];
};

type SpotPosition = {
  id: string;
  assetClass: "crypto" | "forex" | "stocks";
  symbol: string;
  quantity: number;
  averageEntryPrice: number;
  lastPrice: number;
  marketValue: number;
  unrealizedPnl: number;
};

type SpotTradeRecord = {
  id: string;
  assetClass: "crypto" | "forex" | "stocks";
  symbol: string;
  side: "BUY" | "SELL";
  price: number;
  realizedPnl: number;
  executedAt: string;
};

type SpotAccount = {
  currency: "USD";
  cashBalance: number;
  totalEquity: number;
  realizedPnl: number;
  unrealizedPnl: number;
  positions: SpotPosition[];
  trades: SpotTradeRecord[];
};

type UnifiedTrade = {
  id: string;
  origin: "FUTURES" | "SPOT";
  label: string;
  symbol: string;
  side: string;
  sideClass: string;
  price: number;
  realizedPnl: number;
  executedAt: string;
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

function formatTradeTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "--:--:--";
  }

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function PortfolioContent() {
  const [futures, setFutures] = useState<FuturesAccount | null>(null);
  const [spot, setSpot] = useState<SpotAccount | null>(null);
  const [error, setError] = useState("");
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
            account?: FuturesAccount;
          };

          if (payload.account) {
            setFutures(payload.account);
          }
        }

        if (spotResult.status === "fulfilled" && spotResult.value.ok) {
          const payload = (await spotResult.value.json()) as {
            account?: SpotAccount;
          };

          if (payload.account) {
            setSpot(payload.account);
          }
        }
      }
      catch (currentError) {
        if (!cancelled) {
          setError(
            currentError instanceof Error
              ? currentError.message
              : "Portfolio data is unavailable.",
          );
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

  const futuresEquity = futures?.totalEquity ?? 0;
  const spotEquity = spot?.totalEquity ?? 0;
  const combinedEquity = futuresEquity + spotEquity;

  const combinedRealizedPnl =
    (futures?.realizedPnl ?? 0) + (spot?.realizedPnl ?? 0);

  const combinedUnrealizedPnl =
    (futures?.unrealizedPnl ?? 0) + (spot?.unrealizedPnl ?? 0);

  const spotPositions = spot?.positions ?? [];
  const futuresPositions = futures?.positions ?? [];

  const unifiedTrades: UnifiedTrade[] = [
    ...(futures?.trades ?? []).map(
      (trade): UnifiedTrade => ({
        id: `futures-${trade.id}`,
        origin: "FUTURES",
        label: "FUTURES",
        symbol: trade.symbol,
        side: trade.direction,
        sideClass:
          trade.direction === "LONG"
            ? styles.sideBuy
            : styles.sideSell,
        price: trade.price,
        realizedPnl: trade.realizedPnl,
        executedAt: trade.executedAt,
      }),
    ),
    ...(spot?.trades ?? []).map(
      (trade): UnifiedTrade => ({
        id: `spot-${trade.id}`,
        origin: "SPOT",
        label: trade.assetClass.toUpperCase(),
        symbol: trade.symbol,
        side: trade.side,
        sideClass:
          trade.side === "BUY"
            ? styles.sideBuy
            : styles.sideSell,
        price: trade.price,
        realizedPnl: trade.realizedPnl,
        executedAt: trade.executedAt,
      }),
    ),
  ]
    .sort(
      (left, right) =>
        new Date(right.executedAt).getTime() -
        new Date(left.executedAt).getTime(),
    )
    .slice(0, 10);

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
            {loading ? "Syncing" : "Portfolio synced"}
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
              COMBINED HOLDINGS
            </span>

            <h1>
              Your position.
              <span> One view.</span>
            </h1>

            <p>
              Futures and Spot balances across Crypto,
              Forex and Stocks, combined into a single
              portfolio snapshot.
            </p>
          </div>
        </section>

        <section className={styles.stage}>
          <div className={styles.statGrid}>
            <div className={styles.statCard}>
              <span>TOTAL EQUITY</span>
              <strong>{formatUsd(combinedEquity)}</strong>
            </div>

            <div className={styles.statCard}>
              <span>REALIZED PNL</span>
              <strong className={pnlClass(combinedRealizedPnl)}>
                {formatSignedUsd(combinedRealizedPnl)}
              </strong>
            </div>

            <div className={styles.statCard}>
              <span>OPEN PNL</span>
              <strong className={pnlClass(combinedUnrealizedPnl)}>
                {formatSignedUsd(combinedUnrealizedPnl)}
              </strong>
            </div>

            <div className={styles.statCard}>
              <span>FUTURES EQUITY (USDT)</span>
              <strong>{formatUsd(futuresEquity)}</strong>
            </div>

            <div className={styles.statCard}>
              <span>SPOT EQUITY (USD)</span>
              <strong>{formatUsd(spotEquity)}</strong>
            </div>

            <div className={styles.statCard}>
              <span>OPEN POSITIONS</span>
              <strong>
                {spotPositions.length + futuresPositions.length}
              </strong>
            </div>
          </div>

          <div className={styles.orbitCard}>
            <NeuralOrbit
              label="PORTFOLIO"
              value={formatUsd(combinedEquity)}
              caption="Combined equity"
            />
          </div>
        </section>

        {error ? (
          <div className={styles.panel}>{error}</div>
        ) : null}

        <section className={styles.sections}>
          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <span>OPEN SPOT POSITIONS</span>
              <b>{spotPositions.length}</b>
            </div>

            {spotPositions.length === 0 ? (
              <div className={styles.emptyState}>
                No open spot positions yet. Buy an asset
                from the market terminal to open one.
              </div>
            ) : (
              spotPositions.map((position) => (
                <div key={position.id} className={styles.positionRow}>
                  <div>
                    <strong>{position.symbol}</strong>
                    <small>
                      {position.assetClass.toUpperCase()} ·{" "}
                      {position.quantity.toLocaleString(undefined, {
                        maximumFractionDigits: 8,
                      })}{" "}
                      units
                    </small>
                  </div>

                  <div className={styles.positionValue}>
                    <strong>
                      {formatUsd(position.marketValue)}
                    </strong>
                    <small className={pnlClass(position.unrealizedPnl)}>
                      {formatSignedUsd(position.unrealizedPnl)}
                    </small>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <span>OPEN FUTURES POSITION</span>
              <b>{futuresPositions.length}</b>
            </div>

            {futuresPositions.length === 0 ? (
              <div className={styles.emptyState}>
                No open Futures position. Open a LONG or
                SHORT from the Futures tab to see it here.
              </div>
            ) : (
              futuresPositions.map((position) => (
                <div key={position.id} className={styles.positionRow}>
                  <div>
                    <strong>
                      {position.direction} {position.symbol}
                    </strong>
                    <small>
                      {position.leverage}x ·{" "}
                      {position.quantity.toLocaleString(undefined, {
                        maximumFractionDigits: 8,
                      })}{" "}
                      units
                    </small>
                  </div>

                  <div className={styles.positionValue}>
                    <strong>{formatUsd(position.markPrice)}</strong>
                    <small className={pnlClass(position.unrealizedPnl)}>
                      {formatSignedUsd(position.unrealizedPnl)}
                    </small>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className={styles.panel} style={{ marginTop: 20 }}>
          <div className={styles.panelHeader}>
            <span>RECENT COMBINED EXECUTIONS</span>
            <b>Latest {unifiedTrades.length}</b>
          </div>

          {unifiedTrades.length === 0 ? (
            <div className={styles.emptyState}>
              No executions yet across Spot or Futures.
            </div>
          ) : (
            <div className={styles.tradeTable}>
              <div className={styles.tradeHeader}>
                <span>TIME</span>
                <span>MARKET</span>
                <span>SYMBOL</span>
                <span>SIDE</span>
                <span>RESULT</span>
              </div>

              {unifiedTrades.map((trade) => (
                <div key={trade.id} className={styles.tradeRow}>
                  <span>{formatTradeTime(trade.executedAt)}</span>
                  <span>{trade.label}</span>
                  <span>{trade.symbol}</span>
                  <span className={`${styles.side} ${trade.sideClass}`}>
                    {trade.side}
                  </span>
                  <span className={pnlClass(trade.realizedPnl)}>
                    {formatSignedUsd(trade.realizedPnl)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default function PortfolioPage() {
  return (
    <main className="zainex-app">
      <div className="desktop-app-frame">
        <DesktopSidebar activeLabel="Portfolios" />

        <section
          className={`desktop-shell ${billingStyles.desktopContent}`}
        >
          <PortfolioContent />
        </section>
      </div>

      <div className={billingStyles.mobileContent}>
        <PortfolioContent />
      </div>
    </main>
  );
}
