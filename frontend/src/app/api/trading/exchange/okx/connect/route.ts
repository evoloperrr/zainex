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

export async function POST(
  request: NextRequest,
): Promise<NextResponse> {
  return proxyFuturesToLaravel({
    request,
    method: "POST",
    path: "/api/trading/exchange/okx/connect",
    invalidJsonMessage:
      "The exchange connection request contains invalid JSON.",
    requestTooLargeMessage:
      "The exchange connection request is too large.",
  });
}
