import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  isSupportedCryptoSymbol,
} from "@/lib/crypto-symbols";

import {
  FOREX_PAIR_LABELS,
  type ForexPair,
  isSupportedForexPair,
  toStooqForexSymbol,
  toYahooForexSymbol,
} from "@/lib/forex-symbols";

export const dynamic = "force-dynamic";

type MarketKey =
  | "crypto"
  | "forex"
  | "stocks";

type IntervalKey =
  | "1m"
  | "5m"
  | "15m"
  | "1h"
  | "4h"
  | "1d";

type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

type MarketSummary = {
  price: string;
  rawPrice: string;
  currencySymbol: string;
  change: string;
  secondaryValue: string;

  liquidityLabel: string;
  liquidity: string;

  volumeLabel: string;
  volume: string;

  pooledPrimaryLabel: string;
  pooledPrimary: string;

  pooledSecondaryLabel: string;
  pooledSecondary: string;
};

type MarketResult = {
  data: Candle[];
  summary: MarketSummary;
  provider: string;
};

type BinanceKline =
  Array<string | number>;

type BinanceTicker = {
  lastPrice?: string;
  priceChangePercent?: string;
  volume?: string;
  quoteVolume?: string;
  highPrice?: string;
  lowPrice?: string;
};

type YahooQuote = {
  open?: Array<number | null>;
  high?: Array<number | null>;
  low?: Array<number | null>;
  close?: Array<number | null>;
  volume?: Array<number | null>;
};

type YahooMeta = {
  regularMarketPrice?: number;
  chartPreviousClose?: number;
  previousClose?: number;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
  regularMarketVolume?: number;
  marketState?: string;
};

type YahooResult = {
  meta?: YahooMeta;
  timestamp?: number[];
  indicators?: {
    quote?: YahooQuote[];
  };
};

type YahooPayload = {
  chart?: {
    result?: YahooResult[];
    error?: {
      code?: string;
      description?: string;
    } | null;
  };
};

const supportedMarkets =
  new Set<MarketKey>([
    "crypto",
    "forex",
    "stocks",
  ]);

const supportedIntervals =
  new Set<IntervalKey>([
    "1m",
    "5m",
    "15m",
    "1h",
    "4h",
    "1d",
  ]);

const yahooIntervals: Record<
  IntervalKey,
  {
    interval: string;
    range: string;
  }
> = {
  "1m": {
    interval: "1m",
    range: "5d",
  },

  "5m": {
    interval: "5m",
    range: "1mo",
  },

  "15m": {
    interval: "15m",
    range: "1mo",
  },

  "1h": {
    interval: "60m",
    range: "3mo",
  },

  "4h": {
    interval: "60m",
    range: "6mo",
  },

  "1d": {
    interval: "1d",
    range: "5y",
  },
};

function safeNumber(
  value: unknown,
): number | null {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function normalizeLimit(
  value: string | null,
): number {
  const parsed = Number.parseInt(
    value ?? "500",
    10,
  );

  if (!Number.isFinite(parsed)) {
    return 500;
  }

  return Math.max(
    20,
    Math.min(parsed, 1000),
  );
}

function decimalPlaces(
  market: MarketKey,
  value: number,
): number {
  if (market === "forex") {
    return value >= 20 ? 3 : 5;
  }

  if (value < 1) {
    return 4;
  }

  return 2;
}

function formatRawPrice(
  market: MarketKey,
  value: number,
): string {
  const digits =
    decimalPlaces(market, value);

  return new Intl.NumberFormat(
    "en-US",
    {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    },
  ).format(value);
}

function formatPrice(
  market: MarketKey,
  value: number,
): string {
  const raw =
    formatRawPrice(
      market,
      value,
    );

  return market === "forex"
    ? raw
    : `$${raw}`;
}

function formatPercent(
  value: number,
): string {
  const prefix =
    value >= 0 ? "+" : "";

  return `${prefix}${value.toFixed(2)}%`;
}

function formatCompact(
  value: number | null,
  options?: {
    prefix?: string;
    suffix?: string;
  },
): string {
  if (
    value === null ||
    !Number.isFinite(value)
  ) {
    return "--";
  }

  const compact =
    new Intl.NumberFormat(
      "en-US",
      {
        notation: "compact",
        maximumFractionDigits: 2,
      },
    ).format(value);

  return (
    `${options?.prefix ?? ""}` +
    compact +
    `${options?.suffix ?? ""}`
  );
}

function aggregateFourHour(
  candles: Candle[],
): Candle[] {
  const buckets =
    new Map<number, Candle>();

  for (const candle of candles) {
    const bucketTime =
      Math.floor(
        candle.time / 14400,
      ) * 14400;

    const current =
      buckets.get(bucketTime);

    if (!current) {
      buckets.set(
        bucketTime,
        {
          time: bucketTime,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
        },
      );

      continue;
    }

    current.high = Math.max(
      current.high,
      candle.high,
    );

    current.low = Math.min(
      current.low,
      candle.low,
    );

    current.close = candle.close;
  }

  return Array.from(
    buckets.values(),
  ).sort(
    (left, right) =>
      left.time - right.time,
  );
}

async function fetchJson(
  url: URL,
): Promise<unknown> {
  const response = await fetch(
    url,
    {
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "User-Agent":
          "Mozilla/5.0 ZAINEX-Market-Terminal",
      },
    },
  );

  if (!response.ok) {
    throw new Error(
      `${url.hostname} returned ${response.status}.`,
    );
  }

  return response.json();
}

function normalizeCryptoSymbol(
  value: string | null,
): string {
  const candidate =
    (value ?? "BTCUSDT")
      .trim()
      .toUpperCase();

  return isSupportedCryptoSymbol(candidate)
    ? candidate
    : "BTCUSDT";
}

function normalizeForexPair(
  value: string | null,
): ForexPair {
  const candidate =
    (value ?? "EURUSD")
      .trim()
      .toUpperCase();

  return isSupportedForexPair(candidate)
    ? candidate
    : "EURUSD";
}

async function loadBinance(
  symbol: string,
  interval: IntervalKey,
  limit: number,
): Promise<MarketResult> {
  const baseAsset = symbol.replace(
    /USDT$/,
    "",
  );

  const klineUrl = new URL(
    "https://data-api.binance.vision/api/v3/klines",
  );

  klineUrl.searchParams.set(
    "symbol",
    symbol,
  );

  klineUrl.searchParams.set(
    "interval",
    interval,
  );

  klineUrl.searchParams.set(
    "limit",
    String(limit),
  );

  const tickerUrl = new URL(
    "https://data-api.binance.vision/api/v3/ticker/24hr",
  );

  tickerUrl.searchParams.set(
    "symbol",
    symbol,
  );

  const [
    rawKlines,
    rawTicker,
  ] = await Promise.all([
    fetchJson(klineUrl),
    fetchJson(tickerUrl),
  ]);

  if (!Array.isArray(rawKlines)) {
    throw new Error(
      "Invalid Binance candle response.",
    );
  }

  const ticker =
    rawTicker as BinanceTicker;

  const data = rawKlines
    .map((rawRow) => {
      const row =
        rawRow as BinanceKline;

      const time =
        safeNumber(row[0]);

      const open =
        safeNumber(row[1]);

      const high =
        safeNumber(row[2]);

      const low =
        safeNumber(row[3]);

      const close =
        safeNumber(row[4]);

      if (
        time === null ||
        open === null ||
        high === null ||
        low === null ||
        close === null
      ) {
        return null;
      }

      return {
        time: Math.floor(
          time / 1000,
        ),
        open,
        high,
        low,
        close,
      };
    })
    .filter(
      (candle): candle is Candle =>
        candle !== null,
    );

  if (data.length === 0) {
    throw new Error(
      "Binance returned no candles.",
    );
  }

  const lastCandle =
    data[data.length - 1];

  const currentPrice =
    safeNumber(ticker.lastPrice) ??
    lastCandle.close;

  const changePercent =
    safeNumber(
      ticker.priceChangePercent,
    ) ?? 0;

  const high =
    safeNumber(ticker.highPrice) ??
    lastCandle.high;

  const low =
    safeNumber(ticker.lowPrice) ??
    lastCandle.low;

  const baseVolume =
    safeNumber(ticker.volume);

  const quoteVolume =
    safeNumber(ticker.quoteVolume);

  return {
    provider: "Binance",

    data,

    summary: {
      price:
        formatPrice(
          "crypto",
          currentPrice,
        ),

      rawPrice:
        formatRawPrice(
          "crypto",
          currentPrice,
        ),

      currencySymbol: "$",

      change:
        formatPercent(
          changePercent,
        ),

      secondaryValue:
        `${baseAsset} / USDT`,

      liquidityLabel:
        "24H quote volume",

      liquidity:
        formatCompact(
          quoteVolume,
          {
            prefix: "$",
          },
        ),

      volumeLabel:
        "24H base volume",

      volume:
        formatCompact(
          baseVolume,
          {
            suffix: ` ${baseAsset}`,
          },
        ),

      pooledPrimaryLabel:
        "24H high",

      pooledPrimary:
        formatPrice(
          "crypto",
          high,
        ),

      pooledSecondaryLabel:
        "24H low",

      pooledSecondary:
        formatPrice(
          "crypto",
          low,
        ),
    },
  };
}

async function loadYahoo(
  market: Exclude<
    MarketKey,
    "crypto"
  >,
  forexPair: ForexPair,
  interval: IntervalKey,
  limit: number,
): Promise<MarketResult> {
  const symbol =
    market === "forex"
      ? toYahooForexSymbol(
          forexPair,
        )
      : "NVDA";

  const intervalConfig =
    yahooIntervals[interval];

  const hosts = [
    "query1.finance.yahoo.com",
    "query2.finance.yahoo.com",
  ];

  let payload:
    YahooPayload |
    null = null;

  let finalError =
    "Market provider failed.";

  for (const host of hosts) {
    try {
      const endpoint = new URL(
        `https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}`,
      );

      endpoint.searchParams.set(
        "interval",
        intervalConfig.interval,
      );

      endpoint.searchParams.set(
        "range",
        intervalConfig.range,
      );

      endpoint.searchParams.set(
        "includePrePost",
        "false",
      );

      endpoint.searchParams.set(
        "events",
        "div,splits",
      );

      const candidate =
        await fetchJson(
          endpoint,
        ) as YahooPayload;

      if (
        candidate.chart?.error
      ) {
        throw new Error(
          candidate.chart.error.description ??
            candidate.chart.error.code ??
            "Market chart error.",
        );
      }

      if (
        !candidate.chart?.result?.[0]
      ) {
        throw new Error(
          "Market provider returned no result.",
        );
      }

      payload = candidate;
      break;
    }
    catch (error) {
      finalError =
        error instanceof Error
          ? error.message
          : "Market provider failed.";
    }
  }

  if (!payload) {
    throw new Error(finalError);
  }

  const result =
    payload.chart?.result?.[0];

  if (!result) {
    throw new Error(
      "Market provider returned no chart.",
    );
  }

  const timestamps =
    result.timestamp ?? [];

  const quote =
    result.indicators
      ?.quote?.[0];

  if (!quote) {
    throw new Error(
      "Market provider returned no OHLC data.",
    );
  }

  const opens =
    quote.open ?? [];

  const highs =
    quote.high ?? [];

  const lows =
    quote.low ?? [];

  const closes =
    quote.close ?? [];

  const volumes =
    quote.volume ?? [];

  const rowCount = Math.min(
    timestamps.length,
    opens.length,
    highs.length,
    lows.length,
    closes.length,
  );

  const parsedCandles:
    Candle[] = [];

  for (
    let index = 0;
    index < rowCount;
    index++
  ) {
    const time =
      safeNumber(
        timestamps[index],
      );

    const open =
      safeNumber(opens[index]);

    const high =
      safeNumber(highs[index]);

    const low =
      safeNumber(lows[index]);

    const close =
      safeNumber(closes[index]);

    if (
      time === null ||
      open === null ||
      high === null ||
      low === null ||
      close === null
    ) {
      continue;
    }

    parsedCandles.push({
      time,
      open,
      high,
      low,
      close,
    });
  }

  const normalized =
    interval === "4h"
      ? aggregateFourHour(
          parsedCandles,
        )
      : parsedCandles;

  const data =
    normalized.slice(-limit);

  if (data.length === 0) {
    throw new Error(
      "Market provider returned no usable candles.",
    );
  }

  const meta =
    result.meta ?? {};

  const last =
    data[data.length - 1];

  const previous =
    data.length > 1
      ? data[data.length - 2]
      : last;

  const currentPrice =
    safeNumber(
      meta.regularMarketPrice,
    ) ?? last.close;

  const previousClose =
    safeNumber(
      meta.chartPreviousClose,
    ) ??
    safeNumber(
      meta.previousClose,
    ) ??
    previous.close;

  const changePercent =
    previousClose === 0
      ? 0
      : (
          (
            currentPrice -
            previousClose
          ) /
          previousClose
        ) * 100;

  const dayHigh =
    safeNumber(
      meta.regularMarketDayHigh,
    ) ?? last.high;

  const dayLow =
    safeNumber(
      meta.regularMarketDayLow,
    ) ?? last.low;

  const marketVolume =
    safeNumber(
      meta.regularMarketVolume,
    ) ??
    safeNumber(
      volumes[
        Math.min(
          volumes.length - 1,
          rowCount - 1,
        )
      ],
    );

  if (market === "forex") {
    return {
      provider:
        "Public Forex Chart",

      data,

      summary: {
        price:
          formatPrice(
            "forex",
            currentPrice,
          ),

        rawPrice:
          formatRawPrice(
            "forex",
            currentPrice,
          ),

        currencySymbol: "",

        change:
          formatPercent(
            changePercent,
          ),

        secondaryValue:
          FOREX_PAIR_LABELS[
            forexPair
          ],

        liquidityLabel:
          "Previous close",

        liquidity:
          formatPrice(
            "forex",
            previousClose,
          ),

        volumeLabel:
          "Session high",

        volume:
          formatPrice(
            "forex",
            dayHigh,
          ),

        pooledPrimaryLabel:
          "Session low",

        pooledPrimary:
          formatPrice(
            "forex",
            dayLow,
          ),

        pooledSecondaryLabel:
          "Market state",

        pooledSecondary:
          meta.marketState ??
          "DELAYED",
      },
    };
  }

  return {
    provider:
      "Public Stock Chart",

    data,

    summary: {
      price:
        formatPrice(
          "stocks",
          currentPrice,
        ),

      rawPrice:
        formatRawPrice(
          "stocks",
          currentPrice,
        ),

      currencySymbol: "$",

      change:
        formatPercent(
          changePercent,
        ),

      secondaryValue:
        "1 NVDA",

      liquidityLabel:
        "Market volume",

      liquidity:
        formatCompact(
          marketVolume,
          {
            suffix: " shares",
          },
        ),

      volumeLabel:
        "Previous close",

      volume:
        formatPrice(
          "stocks",
          previousClose,
        ),

      pooledPrimaryLabel:
        "Day high",

      pooledPrimary:
        formatPrice(
          "stocks",
          dayHigh,
        ),

      pooledSecondaryLabel:
        "Day low",

      pooledSecondary:
        formatPrice(
          "stocks",
          dayLow,
        ),
    },
  };
}

function formatStooqDate(
  date: Date,
): string {
  const year =
    String(date.getUTCFullYear());

  const month =
    String(
      date.getUTCMonth() + 1,
    ).padStart(2, "0");

  const day =
    String(
      date.getUTCDate(),
    ).padStart(2, "0");

  return `${year}${month}${day}`;
}

async function loadStooqDaily(
  market: Exclude<
    MarketKey,
    "crypto"
  >,
  forexPair: ForexPair,
  limit: number,
): Promise<MarketResult> {
  const symbol =
    market === "forex"
      ? toStooqForexSymbol(
          forexPair,
        )
      : "nvda.us";

  const endpoint = new URL(
    "https://stooq.com/q/d/l/",
  );

  const today =
    new Date();

  const startDate =
    new Date();

  startDate.setUTCFullYear(
    today.getUTCFullYear() - 6,
  );

  endpoint.searchParams.set(
    "s",
    symbol,
  );

  endpoint.searchParams.set(
    "i",
    "d",
  );

  endpoint.searchParams.set(
    "d1",
    formatStooqDate(startDate),
  );

  endpoint.searchParams.set(
    "d2",
    formatStooqDate(today),
  );

  const response = await fetch(
    endpoint,
    {
      cache: "no-store",
      headers: {
        Accept: "text/csv,text/plain",
        "User-Agent":
          "Mozilla/5.0 ZAINEX-Market-Terminal",
      },
    },
  );

  if (!response.ok) {
    throw new Error(
      `Historical fallback returned ${response.status}.`,
    );
  }

  const text =
    await response.text();

  const lines = text
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);

  if (lines.length < 3) {
    throw new Error(
      "Historical fallback returned no candles.",
    );
  }

  const headers =
    lines[0]
      .split(",")
      .map(
        (header) =>
          header.trim().toLowerCase(),
      );

  const dateIndex =
    headers.indexOf("date");

  const openIndex =
    headers.indexOf("open");

  const highIndex =
    headers.indexOf("high");

  const lowIndex =
    headers.indexOf("low");

  const closeIndex =
    headers.indexOf("close");

  const volumeIndex =
    headers.indexOf("volume");

  if (
    dateIndex < 0 ||
    openIndex < 0 ||
    highIndex < 0 ||
    lowIndex < 0 ||
    closeIndex < 0
  ) {
    throw new Error(
      "Historical fallback CSV format is invalid.",
    );
  }

  const candles: Candle[] = [];

  let latestVolume:
    number |
    null = null;

  for (
    let lineIndex = 1;
    lineIndex < lines.length;
    lineIndex++
  ) {
    const columns =
      lines[lineIndex]
        .split(",")
        .map(
          (column) =>
            column.trim(),
        );

    const timeMilliseconds =
      Date.parse(
        `${columns[dateIndex]}T00:00:00Z`,
      );

    const open =
      safeNumber(
        columns[openIndex],
      );

    const high =
      safeNumber(
        columns[highIndex],
      );

    const low =
      safeNumber(
        columns[lowIndex],
      );

    const close =
      safeNumber(
        columns[closeIndex],
      );

    if (
      !Number.isFinite(
        timeMilliseconds,
      ) ||
      open === null ||
      high === null ||
      low === null ||
      close === null
    ) {
      continue;
    }

    candles.push({
      time:
        Math.floor(
          timeMilliseconds / 1000,
        ),
      open,
      high,
      low,
      close,
    });

    if (volumeIndex >= 0) {
      latestVolume =
        safeNumber(
          columns[volumeIndex],
        );
    }
  }

  const data =
    candles.slice(-limit);

  if (data.length === 0) {
    throw new Error(
      "Historical fallback returned no usable data.",
    );
  }

  const last =
    data[data.length - 1];

  const previous =
    data.length > 1
      ? data[data.length - 2]
      : last;

  const changePercent =
    previous.close === 0
      ? 0
      : (
          (
            last.close -
            previous.close
          ) /
          previous.close
        ) * 100;

  if (market === "forex") {
    return {
      provider:
        "Stooq Daily Fallback",

      data,

      summary: {
        price:
          formatPrice(
            "forex",
            last.close,
          ),

        rawPrice:
          formatRawPrice(
            "forex",
            last.close,
          ),

        currencySymbol: "",

        change:
          formatPercent(
            changePercent,
          ),

        secondaryValue:
          FOREX_PAIR_LABELS[
            forexPair
          ],

        liquidityLabel:
          "Previous close",

        liquidity:
          formatPrice(
            "forex",
            previous.close,
          ),

        volumeLabel:
          "Session high",

        volume:
          formatPrice(
            "forex",
            last.high,
          ),

        pooledPrimaryLabel:
          "Session low",

        pooledPrimary:
          formatPrice(
            "forex",
            last.low,
          ),

        pooledSecondaryLabel:
          "Data interval",

        pooledSecondary:
          "DAILY",
      },
    };
  }

  return {
    provider:
      "Stooq Daily Fallback",

    data,

    summary: {
      price:
        formatPrice(
          "stocks",
          last.close,
        ),

      rawPrice:
        formatRawPrice(
          "stocks",
          last.close,
        ),

      currencySymbol: "$",

      change:
        formatPercent(
          changePercent,
        ),

      secondaryValue:
        "1 NVDA",

      liquidityLabel:
        "Market volume",

      liquidity:
        formatCompact(
          latestVolume,
          {
            suffix: " shares",
          },
        ),

      volumeLabel:
        "Previous close",

      volume:
        formatPrice(
          "stocks",
          previous.close,
        ),

      pooledPrimaryLabel:
        "Day high",

      pooledPrimary:
        formatPrice(
          "stocks",
          last.high,
        ),

      pooledSecondaryLabel:
        "Day low",

      pooledSecondary:
        formatPrice(
          "stocks",
          last.low,
        ),
    },
  };
}

async function loadPublicMarket(
  market: Exclude<
    MarketKey,
    "crypto"
  >,
  forexPair: ForexPair,
  interval: IntervalKey,
  limit: number,
): Promise<MarketResult> {
  try {
    return await loadYahoo(
      market,
      forexPair,
      interval,
      limit,
    );
  }
  catch {
    return loadStooqDaily(
      market,
      forexPair,
      limit,
    );
  }
}

export async function GET(
  request: NextRequest,
) {
  const marketValue =
    request.nextUrl.searchParams.get(
      "market",
    );

  const intervalValue =
    request.nextUrl.searchParams.get(
      "interval",
    );

  if (
    !marketValue ||
    !supportedMarkets.has(
      marketValue as MarketKey,
    )
  ) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Unsupported market.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    !intervalValue ||
    !supportedIntervals.has(
      intervalValue as IntervalKey,
    )
  ) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Unsupported interval.",
      },
      {
        status: 400,
      },
    );
  }

  const market =
    marketValue as MarketKey;

  const interval =
    intervalValue as IntervalKey;

  const limit =
    normalizeLimit(
      request.nextUrl.searchParams.get(
        "limit",
      ),
    );

  const symbol = normalizeCryptoSymbol(
    request.nextUrl.searchParams.get(
      "symbol",
    ),
  );

  const forexPair = normalizeForexPair(
    request.nextUrl.searchParams.get(
      "symbol",
    ),
  );

  try {
    const result =
      market === "crypto"
        ? await loadBinance(
            symbol,
            interval,
            limit,
          )
        : await loadPublicMarket(
            market,
            forexPair,
            interval,
            limit,
          );

    return NextResponse.json(
      {
        ok: true,
        market,
        interval,
        symbol:
          market === "crypto"
            ? symbol
            : market === "forex"
              ? forexPair
              : undefined,
        provider:
          result.provider,
        data:
          result.data,
        summary:
          result.summary,
      },
      {
        headers: {
          "Cache-Control":
            "no-store, max-age=0",
        },
      },
    );
  }
  catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Market data request failed.";

    return NextResponse.json(
      {
        ok: false,
        market,
        interval,
        error: message,
      },
      {
        status: 502,

        headers: {
          "Cache-Control":
            "no-store, max-age=0",
        },
      },
    );
  }
}