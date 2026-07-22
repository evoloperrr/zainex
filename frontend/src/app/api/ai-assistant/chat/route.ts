import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  proxyFuturesToLaravel,
} from "@/server/trading/futures/laravel-bridge";

// ZAINEX_GENERAL_AI_ASSISTANT_NEXT_ROUTE_V1

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
): Promise<NextResponse> {
  return proxyFuturesToLaravel({
    request,
    method: "POST",
    path: "/api/ai-assistant/chat",
    invalidJsonMessage:
      "The assistant request contains invalid JSON.",
    requestTooLargeMessage:
      "The assistant request is too large.",
    maxRequestBytes: 100_000,
  });
}
