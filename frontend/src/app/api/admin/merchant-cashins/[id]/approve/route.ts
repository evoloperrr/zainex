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
  {
    params,
  }: {
    params: Promise<{
      id: string;
    }>;
  },
): Promise<NextResponse> {
  const { id } = await params;

  return proxyFuturesToLaravel({
    request,
    method: "POST",
    path: `/api/admin/merchant-cashins/${encodeURIComponent(id)}/approve`,
    invalidJsonMessage:
      "The approve request contains invalid JSON.",
    requestTooLargeMessage:
      "The approve request is too large.",
  });
}
