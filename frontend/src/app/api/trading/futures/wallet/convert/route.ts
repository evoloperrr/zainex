import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  proxyFuturesToLaravel,
} from "@/server/trading/futures/laravel-bridge";

// ZAINEX_WALLET_TO_CREDITS_NEXT_ROUTE_V1

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
): Promise<NextResponse> {
  return proxyFuturesToLaravel({
    request,
    method: "GET",
    path:
      "/api/trading/futures/wallet/convert",
  });
}

export async function POST(
  request: NextRequest,
): Promise<NextResponse> {
  return proxyFuturesToLaravel({
    request,
    method: "POST",
    path:
      "/api/trading/futures/wallet/convert",
    invalidJsonMessage:
      "The wallet conversion request contains invalid JSON.",
    requestTooLargeMessage:
      "The wallet conversion request is too large.",
  });
}