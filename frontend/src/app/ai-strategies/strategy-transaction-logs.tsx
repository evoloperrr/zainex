"use client";

// ZAINEX_STRATEGY_COMBINED_LATEST_10_LOGS_C2_V1

import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  useCurrency,
} from "@/components/currency-provider";

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
  payoutNumber?: number | null;
  paidDays?: number | null;
  termDays?: number | null;
  windowDays?: number | null;
  cadence?: "RANDOM_15_OF_30" | "EVERY_24_HOURS" | null;
  referralPercentage?: number | string | null;
  referralSourceAmount?: number | string | null;
  description?: string | null;
  occurredAt?: string | null;
};

type NextPayout = {
  activationId: number;
  tier: string;
  cadence: "RANDOM_15_OF_30" | "EVERY_24_HOURS";
  scheduledAt: string;
  expectedAmount: number | string;
  principalBasis: number | string;
  dailyRate: number | string;
  payoutNumber: number;
  totalPayouts: number;
  calendarDay?: number | null;
  windowDays: number;
};

type LogsPayload = {
  ok?: boolean;
  logs?: StrategyLog[];
  nextPayout?: NextPayout | null;
  error?: {
    message?: string;
  };
};

type CountdownParts = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  due: boolean;
};

function toNumber(
  value: unknown,
): number {
  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : 0;
}

type FormatUsd = (
  value: unknown,
) => string;

function formatPercent(
  value: unknown,
): string {
  return `${(toNumber(value) * 100)
    .toFixed(2)
    .replace(/\.00$/, "")
    .replace(/(\.\d)0$/, "$1")}%`;
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

    case "STRATEGY_REFERRAL_INCOME":
      return "Referral income credited";

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
  formatUsd: FormatUsd,
): string {
  const tier =
    log.tier ?? "FREE TIER";

  const termDays =
    log.termDays ?? 30;

  const windowDays =
    log.windowDays ?? 30;

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
        log.cadence === "RANDOM_15_OF_30"
          ? `${tier} • Random drop ` +
            `${log.payoutNumber ?? log.paidDays ?? 0}/${termDays}` +
            ` • Day ${log.dayNumber ?? 0}/${windowDays}`
          : `${tier} • Drop ` +
            `${log.payoutNumber ?? log.dayNumber ?? log.paidDays ?? 0}/` +
            `${termDays}`,
        log.dailyRate == null
          ? null
          : `${formatPercent(log.dailyRate)} daily`,
        log.principalBasis == null
          ? null
          : `${formatUsd(log.principalBasis)} trading amount`,
      ]
        .filter(Boolean)
        .join(" • ");

    case "STRATEGY_REFERRAL_INCOME":
      return [
        `${tier} • Direct inviter income`,
        log.referralPercentage == null
          ? "10% referral reward"
          : `${toNumber(log.referralPercentage)}% referral reward`,
        log.referralSourceAmount == null
          ? null
          : `${formatUsd(log.referralSourceAmount)} trading amount`,
      ]
        .filter(Boolean)
        .join(" • ");

    case "STRATEGY_PRINCIPAL_RELEASED":
      return (
        `${tier} • Principal returned after ` +
        `${windowDays} days`
      );

    case "STRATEGY_COMPLETED":
      return (
        `${tier} • ` +
        `${log.paidDays ?? termDays}/` +
        `${termDays} drops completed`
      );

    default:
      return (
        log.description ??
        tier
      );
  }
}

function countdownParts(
  scheduledAt: string,
  now: number,
): CountdownParts {
  const target = new Date(
    scheduledAt,
  ).getTime();

  const remaining =
    Number.isFinite(target)
      ? Math.max(0, target - now)
      : 0;

  return {
    days: Math.floor(
      remaining / 86_400_000,
    ),
    hours: Math.floor(
      (remaining % 86_400_000) /
        3_600_000,
    ),
    minutes: Math.floor(
      (remaining % 3_600_000) /
        60_000,
    ),
    seconds: Math.floor(
      (remaining % 60_000) / 1000,
    ),
    due:
      Number.isFinite(target) &&
      target <= now,
  };
}

function padCountdown(
  value: number,
): string {
  return String(value).padStart(
    2,
    "0",
  );
}

function eventDescription(
  log: StrategyLog,
  formatUsd: FormatUsd,
): string | null | undefined {
  if (
    [
      "STRATEGY_DAILY_PROFIT",
      "STRATEGY_REFERRAL_INCOME",
    ].includes(log.eventType) &&
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
  formatUsd: FormatUsd,
): string {
  switch (log.eventType) {
    case "STRATEGY_DAILY_PROFIT":
    case "STRATEGY_REFERRAL_INCOME":
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
    case "STRATEGY_REFERRAL_INCOME":
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
  const {
    formatUsd: formatDisplayCurrency,
  } = useCurrency();

  const formatUsd: FormatUsd = (
    value,
  ) =>
    formatDisplayCurrency(
      toNumber(value),
    );

  const [logs, setLogs] =
    useState<StrategyLog[]>([]);

  const [nextPayout, setNextPayout] =
    useState<NextPayout | null>(null);

  const [now, setNow] =
    useState(() => Date.now());

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

        setNextPayout(
          payload.nextPayout ?? null,
        );

        setNow(Date.now());

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

  useEffect(() => {
    const countdownTimer =
      window.setInterval(
        () => {
          setNow(Date.now());
        },
        1000,
      );

    return () => {
      window.clearInterval(
        countdownTimer,
      );
    };
  }, []);

  const countdown =
    nextPayout === null
      ? null
      : countdownParts(
          nextPayout.scheduledAt,
          now,
        );

  return (
    <>
      {nextPayout && countdown ? (
        <section
          className={styles.profitDropPanel}
          aria-label="Next strategy profit drop"
        >
          <div
            className={styles.profitDropAura}
            aria-hidden="true"
          />

          <div className={styles.profitDropIntro}>
            <span className={styles.profitDropEyebrow}>
              <i /> LIVE PROFIT STREAM
            </span>

            <h2>
              Next profit
              <strong> drop.</strong>
            </h2>

            <p>
              {nextPayout.cadence ===
              "RANDOM_15_OF_30"
                ? "Free random schedule • 15 drops across 30 days"
                : "VIP fixed schedule • every 24 hours from activation"}
            </p>
          </div>

          <div className={styles.profitDropClock}>
            {[
              [countdown.days, "DAYS"],
              [countdown.hours, "HRS"],
              [countdown.minutes, "MIN"],
              [countdown.seconds, "SEC"],
            ].map(([value, label]) => (
              <div key={String(label)}>
                <strong>
                  {padCountdown(
                    Number(value),
                  )}
                </strong>
                <span>{label}</span>
              </div>
            ))}

            {countdown.due ? (
              <small>
                Processing wallet credit…
              </small>
            ) : null}
          </div>

          <div className={styles.profitDropValue}>
            <span>{nextPayout.tier}</span>
            <strong>
              +{formatUsd(
                nextPayout.expectedAmount,
              )}
            </strong>
            <small>
              {formatPercent(nextPayout.dailyRate)} of {formatUsd(nextPayout.principalBasis)}
            </small>
            <em>
              Drop {nextPayout.payoutNumber}/{nextPayout.totalPayouts}
              {nextPayout.cadence ===
                "RANDOM_15_OF_30" &&
              nextPayout.calendarDay
                ? ` • Random day ${nextPayout.calendarDay}/${nextPayout.windowDays}`
                : ""}
            </em>
            <time dateTime={nextPayout.scheduledAt}>
              {formatDateTime(
                nextPayout.scheduledAt,
              )}
            </time>
          </div>
        </section>
      ) : null}

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
                  {eventDetail(
                    log,
                    formatUsd,
                  )}
                </strong>

                <small>
                  {eventDescription(
                    log,
                    formatUsd,
                  )}
                </small>
              </div>

              <div className={styles.combinedLogAmount}>
                <strong>
                  {amountLabel(
                    log,
                    formatUsd,
                  )}
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
    </>
  );
}
