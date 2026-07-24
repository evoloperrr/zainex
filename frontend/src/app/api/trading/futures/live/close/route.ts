import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  proxyFuturesToLaravel,
} from "@/server/trading/futures/laravel-bridge";

// ZAINEX_LIVE_OKX_TRADING_V1

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(
  request: NextRequest,
): Promise<NextResponse> {
  return proxyFuturesToLaravel({
    request,
    method: "POST",
    path: "/api/trading/futures/live/close",
    invalidJsonMessage:
      "The live futures close request contains invalid JSON.",
    requestTooLargeMessage:
      "The live futures close request is too large.",
  });
}
