import {
  NextRequest,
  NextResponse,
} from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AssetClass = "crypto" | "forex" | "stocks";

const ASSET_CLASSES = new Set<AssetClass>([
  "crypto",
  "forex",
  "stocks",
]);

const TIMEFRAMES = new Set([
  "1m",
  "5m",
  "15m",
  "1h",
  "4h",
  "1d",
]);

type CandleResponse = {
  ok: boolean;
  data?: Array<{
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
  }>;
  error?: string;
};

export async function POST(
  request: NextRequest,
) {
  let assetClass: AssetClass = "crypto";
  let timeframe = "1h";

  try {
    const body =
      (await request.json()) as {
        assetClass?: unknown;
        timeframe?: unknown;
      };

    if (
      typeof body.assetClass === "string" &&
      ASSET_CLASSES.has(
        body.assetClass as AssetClass,
      )
    ) {
      assetClass =
        body.assetClass as AssetClass;
    }

    if (
      typeof body.timeframe === "string" &&
      TIMEFRAMES.has(body.timeframe)
    ) {
      timeframe = body.timeframe;
    }
  }
  catch {
    // Keep defaults.
  }

  const backendUrl =
    process.env.ZAINEX_BACKEND_URL
      ?.trim()
      .replace(/\/+$/, "") ||
    "http://127.0.0.1:8000";

  const internalToken =
    process.env
      .INTELIBRAIN_INTERNAL_TOKEN
      ?.trim();

  if (!internalToken) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          message:
            "Spot AI proxy is not configured.",
        },
      },
      {
        status: 503,
      },
    );
  }

  let candles: CandleResponse["data"];

  try {
    const candlesUrl = new URL(
      "/api/market/candles",
      request.url,
    );

    candlesUrl.searchParams.set(
      "market",
      assetClass,
    );

    candlesUrl.searchParams.set(
      "interval",
      timeframe,
    );

    candlesUrl.searchParams.set(
      "limit",
      "250",
    );

    const candlesResponse = await fetch(
      candlesUrl,
      {
        cache: "no-store",
        headers: {
          cookie:
            request.headers.get(
              "cookie",
            ) ?? "",
        },
      },
    );

    const candlesPayload =
      (await candlesResponse.json()) as
        CandleResponse;

    if (
      !candlesResponse.ok ||
      !candlesPayload.ok ||
      !candlesPayload.data
    ) {
      throw new Error(
        candlesPayload.error ??
          "Unable to load market candles.",
      );
    }

    candles = candlesPayload.data;
  }
  catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          message:
            error instanceof Error
              ? error.message
              : "Spot market data is unavailable.",
        },
      },
      {
        status: 502,
      },
    );
  }

  const controller =
    new AbortController();

  const timeout = setTimeout(
    () => {
      controller.abort();
    },
    85000,
  );

  try {
    const response = await fetch(
      `${backendUrl}/api/trading/spot/ai/analyze`,
      {
        method: "POST",
        cache: "no-store",
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "Content-Type":
            "application/json",
          "X-Zainex-Internal-Token":
            internalToken,
        },
        body: JSON.stringify({
          assetClass,
          timeframe,
          candles,
        }),
      },
    );

    const raw = await response.text();

    let payload: unknown;

    try {
      payload = JSON.parse(raw);
    }
    catch {
      payload = {
        ok: false,
        error: {
          message:
            "Spot AI backend returned an invalid response.",
        },
      };
    }

    return NextResponse.json(
      payload,
      {
        status: response.status,
      },
    );
  }
  catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          message:
            error instanceof Error &&
            error.name === "AbortError"
              ? "Spot AI analysis timed out."
              : "Laravel Spot AI backend is unavailable.",
        },
      },
      {
        status: 503,
      },
    );
  }
  finally {
    clearTimeout(timeout);
  }
}
