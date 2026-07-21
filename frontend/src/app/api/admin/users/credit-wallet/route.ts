import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  proxyFuturesToLaravel,
} from "@/server/trading/futures/laravel-bridge";

// ZAINEX_ADMIN_CONSOLE_NEXT_ROUTE_V1

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
): Promise<NextResponse> {
  return proxyFuturesToLaravel({
    request,
    method: "POST",
    path: "/api/admin/users/credit-wallet",
    invalidJsonMessage:
      "The wallet credit request contains invalid JSON.",
    requestTooLargeMessage:
      "The wallet credit request is too large.",
  });
}
