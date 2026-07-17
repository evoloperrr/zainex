import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  proxyFuturesToLaravel,
} from "@/server/trading/futures/laravel-bridge";

// ZAINEX_STRATEGY_ACTIVATION_FRONTEND_V2_3

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
): Promise<NextResponse> {
  return proxyFuturesToLaravel({
    request,
    method: "POST",
    path:
      "/api/trading/futures/strategies/activate",
    invalidJsonMessage:
      "The strategy activation request contains invalid JSON.",
    requestTooLargeMessage:
      "The strategy activation request is too large.",
  });
}