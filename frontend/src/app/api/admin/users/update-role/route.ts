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
    path: "/api/admin/users/update-role",
    invalidJsonMessage:
      "The role update request contains invalid JSON.",
    requestTooLargeMessage:
      "The role update request is too large.",
  });
}
