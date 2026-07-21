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

export async function GET(
  request: NextRequest,
): Promise<NextResponse> {
  return proxyFuturesToLaravel({
    request,
    method: "GET",
    path: `/api/admin/overview${request.nextUrl.search}`,
  });
}
