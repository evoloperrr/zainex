import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  proxyFuturesToLaravel,
} from "@/server/trading/futures/laravel-bridge";

// ZAINEX_NOWPAYMENTS_CRYPTO_INVOICE_NEXT_ROUTE_V1

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
): Promise<NextResponse> {
  return proxyFuturesToLaravel({
    request,
    method: "POST",
    path:
      "/api/trading/futures/wallet/crypto/invoice",
    invalidJsonMessage:
      "The crypto checkout request contains invalid JSON.",
    requestTooLargeMessage:
      "The crypto checkout request is too large.",
  });
}
