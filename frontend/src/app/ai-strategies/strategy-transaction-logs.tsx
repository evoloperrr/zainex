"use client";

// ZAINEX_STRATEGY_COMBINED_LATEST_10_LOGS_C2_V1

import {
  useCallback,
  useEffect,
  useState,
} from "react";

import styles from "./ai-strategies.module.css";

type StrategyLog = {
  id: number | string;
  activationId?: number | null;
  eventType: string;
  sourceEventType?: string;
  tier?: string;
  amount?: number | string;
  walletBalanceBefore?: number | string;
  walletBalanceAfter?: number | string;
  principalBasis?: number | string | null;
  dailyRate?: number | string | null;
  creditCost?: number | string;
  rate?: string | null;
  status?: string | null;
  direction?: string | null;
  dayNumber?: number | null;
  paidDays?: number | null;
  termDays?: number | null;
  description?: string | null;
  occurredAt?: string | null;
};

type LogsPayload = {
  ok?: boolean;
  logs?: StrategyLog[];
  error?: {
    message?: string;
  };
};

function toNumber(
  value: unknown,
): number {
  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : 0;
}

function formatUsd(
  value: unknown,
): string {
  return new Intl.NumberFormat(
    "en-US",
    {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    },
  ).format(
    toNumber(value),
  );
}

function formatDateTime(
  value: string | null | undefined,
): string {
  if (!value) {
    return "—";
  }

  const parsed = new Date(value);

  if (
    Number.isNaN(
      parsed.getTime(),
    )
  ) {
    return value;
  }

  return new Intl.DateTimeFormat(
    "en-US",
    {
      month: "short",
      day: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    },
  ).format(parsed);
}

function eventTitle(
  eventType: string,
): string {
  switch (eventType) {
    case "STRATEGY_ACTIVATED":
      return "Strategy activated";

    case "STRATEGY_DAILY_PROFIT":
      return "Daily profit credited";

    case "STRATEGY_PRINCIPAL_RELEASED":
      return "Principal released";

    case "STRATEGY_COMPLETED":
      return "Strategy completed";

    default:
      return eventType
        .replaceAll("_", " ")
        .toLowerCase()
        .replace(
          /^\w/,
          (letter) =>
            letter.toUpperCase(),
        );
  }
}

function eventDetail(
  log: StrategyLog,
): string {
  const tier =
    log.tier ?? "FREE TIER";

  const termDays =
    log.termDays ?? 30;

  switch (log.eventType) {
    case "STRATEGY_ACTIVATED":
      return [
        tier,
        log.rate ?? null,
        `${toNumber(log.creditCost)} credits`,
      ]
        .filter(Boolean)
        .join(" • ");

    case "STRATEGY_DAILY_PROFIT":
      return [
        `${tier} • Day ` +
          `${log.dayNumber ?? log.paidDays ?? 0}/` +
          `${termDays}`,
        log.dailyRate == null
          ? null
          : `${toNumber(log.dailyRate) * 100}% daily`,
        log.principalBasis == null
          ? null
          : `${formatUsd(log.principalBasis)} trading amount`,
      ]
        .filter(Boolean)
        .join(" • ");

    case "STRATEGY_PRINCIPAL_RELEASED":
      return (
        `${tier} • Principal returned after ` +
        `${termDays} days`
      );

    case "STRATEGY_COMPLETED":
      return (
        `${tier} • ` +
        `${log.paidDays ?? termDays}/` +
        `${termDays} days completed`
      );

    default:
      return (
        log.description ??
        tier
      );
  }
}

function eventDescription(
  log: StrategyLog,
): string | null | undefined {
  if (
    log.eventType ===
      "STRATEGY_DAILY_PROFIT" &&
    log.walletBalanceBefore != null &&
    log.walletBalanceAfter != null
  ) {
    return (
      `Wallet ${formatUsd(log.walletBalanceBefore)} → ` +
      `${formatUsd(log.walletBalanceAfter)}`
    );
  }

  return log.description;
}

function amountLabel(
  log: StrategyLog,
): string {
  switch (log.eventType) {
    case "STRATEGY_DAILY_PROFIT":
      return `+${formatUsd(log.amount)}`;

    case "STRATEGY_PRINCIPAL_RELEASED":
      return formatUsd(log.amount);

    case "STRATEGY_ACTIVATED":
      return formatUsd(log.amount);

    case "STRATEGY_COMPLETED":
      return "Complete";

    default:
      return formatUsd(log.amount);
  }
}

function eventClassName(
  eventType: string,
): string {
  switch (eventType) {
    case "STRATEGY_DAILY_PROFIT":
      return styles.combinedLogProfit;

    case "STRATEGY_PRINCIPAL_RELEASED":
      return styles.combinedLogRelease;

    case "STRATEGY_COMPLETED":
      return styles.combinedLogComplete;

    default:
      return styles.combinedLogActivation;
  }
}

export function StrategyTransactionLogs() {
  const [logs, setLogs] =
    useState<StrategyLog[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const loadLogs = useCallback(
    async (): Promise<void> => {
      try {
        const response = await fetch(
          "/api/trading/futures/strategies/current",
          {
            cache: "no-store",
          },
        );

        const payload =
          (await response.json()) as LogsPayload;

        if (
          !response.ok ||
          !payload.ok
        ) {
          throw new Error(
            payload.error?.message ??
              "Unable to load strategy transactions.",
          );
        }

        setLogs(
          Array.isArray(payload.logs)
            ? payload.logs.slice(0, 10)
            : [],
        );

        setError("");
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load strategy transactions.",
        );
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void loadLogs();

    const timer =
      window.setInterval(
        () => {
          void loadLogs();
        },
        15000,
      );

    function handleRefresh(): void {
      void loadLogs();
    }

    window.addEventListener(
      "zainex-strategy-log-refresh",
      handleRefresh,
    );

    window.addEventListener(
      "focus",
      handleRefresh,
    );

    return () => {
      window.clearInterval(timer);

      window.removeEventListener(
        "zainex-strategy-log-refresh",
        handleRefresh,
      );

      window.removeEventListener(
        "focus",
        handleRefresh,
      );
    };
  }, [loadLogs]);

  return (
    <section
      className={styles.logsPanel}
      aria-label="Strategy transaction logs"
    >
      <header className={styles.logsHeader}>
        <div>
          <span>
            PAPER STRATEGY LEDGER
          </span>

          <h2>
            Transaction Logs
          </h2>
        </div>

        <small>
          Latest 10 records
        </small>
      </header>

      {loading ? (
        <div className={styles.combinedLogState}>
          Loading strategy transactions...
        </div>
      ) : error ? (
        <div
          className={styles.combinedLogState}
          role="alert"
        >
          {error}
        </div>
      ) : logs.length === 0 ? (
        <div className={styles.combinedLogState}>
          No strategy transactions yet.
        </div>
      ) : (
        <div className={styles.logsList}>
          {logs.map((log) => (
            <article
              key={`${log.eventType}-${log.id}`}
              className={styles.combinedLogRow}
            >
              <div className={styles.combinedLogMain}>
                <span
                  className={[
                    styles.combinedLogBadge,
                    eventClassName(
                      log.eventType,
                    ),
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {eventTitle(log.eventType)}
                </span>

                <strong>
                  {eventDetail(log)}
                </strong>

                <small>
                  {eventDescription(log)}
                </small>
              </div>

              <div className={styles.combinedLogAmount}>
                <strong>
                  {amountLabel(log)}
                </strong>

                <span>
                  {log.status ?? "RECORDED"}
                </span>
              </div>

              <time
                className={styles.combinedLogTime}
                dateTime={
                  log.occurredAt ?? undefined
                }
              >
                {formatDateTime(
                  log.occurredAt,
                )}
              </time>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
