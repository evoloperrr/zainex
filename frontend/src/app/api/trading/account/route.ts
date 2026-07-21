import {
  NextRequest,
} from "next/server";

import {
  proxySpotToLaravel,
} from "@/server/trading/spot/laravel-bridge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
) {
  return proxySpotToLaravel({
    request,
    path: "/api/trading/spot/account",
    method: "GET",
  });
}
