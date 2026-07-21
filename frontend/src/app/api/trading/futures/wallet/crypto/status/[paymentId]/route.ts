import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  proxyFuturesToLaravel,
} from "@/server/trading/futures/laravel-bridge";

// ZAINEX_NOWPAYMENTS_CRYPTO_STATUS_NEXT_ROUTE_V1

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{
      paymentId: string;
    }>;
  },
): Promise<NextResponse> {
  const { paymentId } =
    await params;

  return proxyFuturesToLaravel({
    request,
    method: "GET",
    path: `/api/trading/futures/wallet/crypto/status/${encodeURIComponent(paymentId)}`,
  });
}
