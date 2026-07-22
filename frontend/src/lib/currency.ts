// ZAINEX_DASHBOARD_CURRENCY_V1
// Shared USD -> display-currency conversion for the authenticated dashboard.
// All amounts stored/transacted in the backend stay in USD; this only
// affects what the user sees on screen.

export type CurrencyCode =
  | "USD"
  | "PHP"
  | "EUR"
  | "GBP"
  | "JPY"
  | "AUD"
  | "CAD"
  | "SGD"
  | "HKD"
  | "INR"
  | "CNY";

// Alphabetical by code — default currency is still forced to USD via
// CurrencyProvider's initial state, regardless of this order.
export const CURRENCIES: Array<{
  code: CurrencyCode;
  label: string;
  locale: string;
}> = [
  { code: "AUD", label: "Australian Dollar", locale: "en-AU" },
  { code: "CAD", label: "Canadian Dollar", locale: "en-CA" },
  { code: "CNY", label: "Chinese Yuan", locale: "zh-CN" },
  { code: "EUR", label: "Euro", locale: "en-IE" },
  { code: "GBP", label: "British Pound", locale: "en-GB" },
  { code: "HKD", label: "Hong Kong Dollar", locale: "en-HK" },
  { code: "INR", label: "Indian Rupee", locale: "en-IN" },
  { code: "JPY", label: "Japanese Yen", locale: "ja-JP" },
  { code: "PHP", label: "Philippine Peso", locale: "en-PH" },
  { code: "SGD", label: "Singapore Dollar", locale: "en-SG" },
  { code: "USD", label: "US Dollar", locale: "en-US" },
];

// Fallback rates (USD -> currency) used until a live rate is fetched, and
// whenever the live fetch fails. Approximate — kept only so the UI never
// breaks; real conversions prefer the live rates below.
export const FALLBACK_RATES: Record<
  CurrencyCode,
  number
> = {
  USD: 1,
  PHP: 58.5,
  EUR: 0.92,
  GBP: 0.79,
  JPY: 152,
  AUD: 1.52,
  CAD: 1.36,
  SGD: 1.34,
  HKD: 7.82,
  INR: 84,
  CNY: 7.24,
};

const RATES_CACHE_KEY =
  "zainex_currency_rates_v1";
const RATES_CACHE_TTL_MS =
  60 * 60 * 1000; // 1 hour

type RatesCache = {
  fetchedAt: number;
  rates: Record<string, number>;
};

export async function fetchLiveRates(): Promise<
  Record<string, number> | null
> {
  try {
    const cached =
      typeof window !== "undefined"
        ? window.localStorage.getItem(
            RATES_CACHE_KEY,
          )
        : null;

    if (cached) {
      const parsed =
        JSON.parse(cached) as RatesCache;

      if (
        Date.now() - parsed.fetchedAt <
        RATES_CACHE_TTL_MS
      ) {
        return parsed.rates;
      }
    }
  } catch {
    // ignore malformed cache
  }

  try {
    const targets = CURRENCIES.filter(
      (currency) =>
        currency.code !== "USD",
    )
      .map(
        (currency) => currency.code,
      )
      .join(",");

    const response = await fetch(
      `https://api.frankfurter.app/latest?from=USD&to=${targets}`,
    );

    if (!response.ok) {
      return null;
    }

    const data =
      (await response.json()) as {
        rates?: Record<
          string,
          number
        >;
      };

    if (!data.rates) {
      return null;
    }

    const rates = {
      USD: 1,
      ...data.rates,
    };

    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        RATES_CACHE_KEY,
        JSON.stringify({
          fetchedAt: Date.now(),
          rates,
        } satisfies RatesCache),
      );
    }

    return rates;
  } catch {
    return null;
  }
}

export function formatCurrency(
  amountUsd: number,
  currency: CurrencyCode,
  rates: Record<string, number>,
): string {
  const rate =
    rates[currency] ??
    FALLBACK_RATES[currency];

  const converted =
    amountUsd * rate;

  const meta =
    CURRENCIES.find(
      (entry) =>
        entry.code === currency,
    ) ?? CURRENCIES[0];

  return new Intl.NumberFormat(
    meta.locale,
    {
      style: "currency",
      currency,
      minimumFractionDigits:
        currency === "JPY" ? 0 : 2,
      maximumFractionDigits:
        currency === "JPY" ? 0 : 2,
    },
  ).format(converted);
}

export function formatSignedCurrency(
  amountUsd: number,
  currency: CurrencyCode,
  rates: Record<string, number>,
): string {
  const formatted = formatCurrency(
    Math.abs(amountUsd),
    currency,
    rates,
  );

  if (amountUsd > 0) {
    return `+${formatted}`;
  }

  if (amountUsd < 0) {
    return `-${formatted}`;
  }

  return formatted;
}
