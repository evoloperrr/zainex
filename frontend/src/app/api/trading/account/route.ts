import { randomUUID } from "node:crypto";

import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  normalizeTradingError,
} from "@/server/trading/errors";
import {
  tradingExecutionService,
} from "@/server/trading/execution-service";
import {
  applyDemoSessionCookie,
  getOrCreateDemoSession,
} from "@/server/trading/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
): Promise<NextResponse> {
  const session = getOrCreateDemoSession(request);

  try {
    const account = await tradingExecutionService.getAccount({
      sessionId: session.sessionId,
      requestId: randomUUID(),
    });

    const response = NextResponse.json(
      {
        ok: true,
        enabledAdapters:
          tradingExecutionService.getEnabledAdapters(),
        account,
      },
      {
        status: 200,
      },
    );

    response.headers.set("Cache-Control", "no-store");
    applyDemoSessionCookie(response, session);

    return response;
  } catch (error) {
    const normalized = normalizeTradingError(error);

    const response = NextResponse.json(
      normalized.body,
      {
        status: normalized.status,
      },
    );

    response.headers.set("Cache-Control", "no-store");
    applyDemoSessionCookie(response, session);

    return response;
  }
}
