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

export async function GET(
  request: NextRequest,
): Promise<NextResponse> {
  return proxyFuturesToLaravel({
    request,
    method: "GET",
    path:
      "/api/trading/futures/orders",
  });
}

export async function POST(
  request: NextRequest,
): Promise<NextResponse> {
  return proxyFuturesToLaravel({
    request,
    method: "POST",
    path:
      "/api/trading/futures/orders",
    invalidJsonMessage:
      "The futures order request contains invalid JSON.",
    requestTooLargeMessage:
      "The futures order request is too large.",
  });
}