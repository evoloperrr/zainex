import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  proxyFuturesToLaravel,
} from "@/server/trading/futures/laravel-bridge";

// ZAINEX_CASHOUT_REQUEST_V1

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
): Promise<NextResponse> {
  return proxyFuturesToLaravel({
    request,
    method: "GET",
    path: "/api/trading/futures/wallet/cashout",
  });
}

export async function POST(
  request: NextRequest,
): Promise<NextResponse> {
  return proxyFuturesToLaravel({
    request,
    method: "POST",
    path: "/api/trading/futures/wallet/cashout",
    invalidJsonMessage:
      "The cashout request contains invalid JSON.",
    requestTooLargeMessage:
      "The cashout request is too large.",
  });
}
