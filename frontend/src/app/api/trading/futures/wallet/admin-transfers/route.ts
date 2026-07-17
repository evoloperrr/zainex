import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  proxyFuturesToLaravel,
} from "@/server/trading/futures/laravel-bridge";

// ZAINEX_ROOT_ADMIN_WALLET_TRANSFER_V1

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
): Promise<NextResponse> {
  return proxyFuturesToLaravel({
    request,
    method: "GET",
    path:
      "/api/trading/futures/wallet/admin-transfers",
  });
}

export async function POST(
  request: NextRequest,
): Promise<NextResponse> {
  return proxyFuturesToLaravel({
    request,
    method: "POST",
    path:
      "/api/trading/futures/wallet/admin-transfers",
    invalidJsonMessage:
      "The admin wallet transfer contains invalid JSON.",
    requestTooLargeMessage:
      "The admin wallet transfer request is too large.",
  });
}