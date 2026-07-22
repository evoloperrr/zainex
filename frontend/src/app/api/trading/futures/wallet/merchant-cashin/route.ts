import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  proxyFuturesToLaravel,
} from "@/server/trading/futures/laravel-bridge";

// ZAINEX_MERCHANT_CASHIN_NEXT_ROUTE_V1

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
): Promise<NextResponse> {
  return proxyFuturesToLaravel({
    request,
    method: "POST",
    path: "/api/trading/futures/wallet/merchant-cashin",
    invalidJsonMessage:
      "The cash-in request contains invalid JSON.",
    requestTooLargeMessage:
      "The attached screenshot is too large.",
    maxRequestBytes: 4_000_000,
  });
}
