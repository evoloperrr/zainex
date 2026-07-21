import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  proxySpotToLaravel,
} from "@/server/trading/spot/laravel-bridge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
) {
  return proxySpotToLaravel({
    request,
    path: "/api/trading/spot/orders",
    method: "GET",
  });
}

export async function POST(
  request: NextRequest,
) {
  let side = "";

  try {
    const peek = (await request
      .clone()
      .json()) as {
      side?: unknown;
    };

    side =
      typeof peek.side === "string"
        ? peek.side.toUpperCase()
        : "";
  }
  catch {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "INVALID_JSON",
          message:
            "The order request contains invalid JSON.",
        },
      },
      {
        status: 400,
      },
    );
  }

  if (side !== "BUY" && side !== "SELL") {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "INVALID_ORDER_SIDE",
          message: "Order side must be BUY or SELL.",
        },
      },
      {
        status: 400,
      },
    );
  }

  return proxySpotToLaravel({
    request,
    path:
      side === "BUY"
        ? "/api/trading/spot/buy"
        : "/api/trading/spot/sell",
    method: "POST",
  });
}
