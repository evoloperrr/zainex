import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  proxyFuturesToLaravel,
} from "@/server/trading/futures/laravel-bridge";

// ZAINEX_DB_PHASE2B2_NEXTJS_FUTURES_LARAVEL_BRIDGE_V1

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
): Promise<NextResponse> {
  return proxyFuturesToLaravel({
    request,
    method: "POST",
    path:
      "/api/trading/futures/close",
    invalidJsonMessage:
      "The futures close request contains invalid JSON.",
    requestTooLargeMessage:
      "The futures close request is too large.",
  });
}