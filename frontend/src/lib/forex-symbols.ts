export const SUPPORTED_FOREX_PAIRS = [
  "EURUSD",
  "GBPUSD",
  "USDJPY",
  "AUDUSD",
  "USDCAD",
  "USDCHF",
  "NZDUSD",
  "XAUUSD",
] as const;

export type ForexPair =
  (typeof SUPPORTED_FOREX_PAIRS)[number];

export const FOREX_PAIR_LABELS: Record<
  ForexPair,
  string
> = {
  EURUSD: "EUR / USD",
  GBPUSD: "GBP / USD",
  USDJPY: "USD / JPY",
  AUDUSD: "AUD / USD",
  USDCAD: "USD / CAD",
  USDCHF: "USD / CHF",
  NZDUSD: "NZD / USD",
  XAUUSD: "XAU / USD",
};

export const FOREX_PAIR_NAMES: Record<
  ForexPair,
  string
> = {
  EURUSD: "Euro vs US Dollar",
  GBPUSD: "British Pound vs US Dollar",
  USDJPY: "US Dollar vs Japanese Yen",
  AUDUSD: "Australian Dollar vs US Dollar",
  USDCAD: "US Dollar vs Canadian Dollar",
  USDCHF: "US Dollar vs Swiss Franc",
  NZDUSD: "New Zealand Dollar vs US Dollar",
  XAUUSD: "Gold vs US Dollar",
};

export function isSupportedForexPair(
  value: string,
): value is ForexPair {
  return (
    SUPPORTED_FOREX_PAIRS as readonly string[]
  ).includes(value);
}

export function isJpyForexPair(
  pair: ForexPair,
): boolean {
  return pair.endsWith("JPY");
}

export function isGoldPair(
  pair: ForexPair,
): boolean {
  return pair === "XAUUSD";
}

export function toYahooForexSymbol(
  pair: ForexPair,
): string {
  if (isGoldPair(pair)) {
    // Yahoo has no XAUUSD=X spot ticker; COMEX gold futures
    // (GC=F) is the closest tracked proxy for spot gold.
    return "GC=F";
  }

  return `${pair}=X`;
}

export function toStooqForexSymbol(
  pair: ForexPair,
): string {
  return pair.toLowerCase();
}
