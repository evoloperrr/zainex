import {
  NextResponse,
} from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIMEFRAMES = new Set([
  "1m",
  "5m",
  "15m",
  "1h",
  "4h",
  "1d",
]);

export async function POST(
  request: Request,
) {
  let requestedTimeframe = "15m";
  let requestedSymbol: string | undefined;

  try {
    const body =
      (await request.json()) as {
        timeframe?: unknown;
        symbol?: unknown;
      };

    if (
      typeof body.timeframe === "string" &&
      TIMEFRAMES.has(body.timeframe)
    ) {
      requestedTimeframe =
        body.timeframe;
    }

    if (
      typeof body.symbol === "string" &&
      body.symbol.trim().length > 0
    ) {
      requestedSymbol =
        body.symbol.trim().toUpperCase();
    }
  }
  catch {
    requestedTimeframe = "15m";
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
            "Futures AI proxy is not configured.",
        },
      },
      {
        status: 503,
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
      `${backendUrl}/api/trading/futures/ai/analyze`,
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
          timeframe:
            requestedTimeframe,
          symbol: requestedSymbol,
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
            "Futures AI backend returned an invalid response.",
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
              ? "Futures AI analysis timed out."
              : "Laravel Futures AI backend is unavailable.",
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