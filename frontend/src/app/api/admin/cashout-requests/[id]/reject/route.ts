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
    path: `/api/admin/cashout-requests/${encodeURIComponent(id)}/reject`,
    invalidJsonMessage:
      "The reject request contains invalid JSON.",
    requestTooLargeMessage:
      "The reject request is too large.",
  });
}
