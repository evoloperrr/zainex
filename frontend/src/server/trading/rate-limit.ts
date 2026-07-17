import { TradingError } from "./errors";

interface RateLimitBucket {
  windowStartedAt: number;
  count: number;
}

const ORDER_WINDOW_MS = 60_000;
const MAX_ORDERS_PER_WINDOW = 20;

const globalWithRateLimits = globalThis as typeof globalThis & {
  __zainexTradingRateLimits?: Map<string, RateLimitBucket>;
};

const buckets =
  globalWithRateLimits.__zainexTradingRateLimits ??
  new Map<string, RateLimitBucket>();

globalWithRateLimits.__zainexTradingRateLimits = buckets;

export function assertOrderRateLimit(sessionId: string): void {
  const now = Date.now();
  const existing = buckets.get(sessionId);

  if (
    !existing ||
    now - existing.windowStartedAt >= ORDER_WINDOW_MS
  ) {
    buckets.set(sessionId, {
      windowStartedAt: now,
      count: 1,
    });

    return;
  }

  if (existing.count >= MAX_ORDERS_PER_WINDOW) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil(
        (ORDER_WINDOW_MS - (now - existing.windowStartedAt)) / 1000,
      ),
    );

    throw new TradingError(
      "ORDER_RATE_LIMITED",
      "Too many paper orders were submitted.",
      429,
      {
        retryAfterSeconds,
        maximumOrdersPerMinute: MAX_ORDERS_PER_WINDOW,
      },
    );
  }

  existing.count += 1;
}
