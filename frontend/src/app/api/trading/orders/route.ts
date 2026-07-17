import { randomUUID } from "node:crypto";

import {
  NextRequest,
  NextResponse,
} from "next/server";

import { TradingError } from "@/server/trading/errors";
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

const MAX_REQUEST_BYTES = 16_384;

function finalizeResponse(
  response: NextResponse,
  session: ReturnType<typeof getOrCreateDemoSession>,
): NextResponse {
  response.headers.set("Cache-Control", "no-store");
  applyDemoSessionCookie(response, session);
  return response;
}

export async function GET(
  request: NextRequest,
): Promise<NextResponse> {
  const session = getOrCreateDemoSession(request);

  try {
    const orders = await tradingExecutionService.getOrders({
      sessionId: session.sessionId,
      requestId: randomUUID(),
    });

    return finalizeResponse(
      NextResponse.json(
        {
          ok: true,
          mode: "paper",
          orders,
        },
        {
          status: 200,
        },
      ),
      session,
    );
  } catch (error) {
    const normalized = normalizeTradingError(error);

    return finalizeResponse(
      NextResponse.json(
        normalized.body,
        {
          status: normalized.status,
        },
      ),
      session,
    );
  }
}

export async function POST(
  request: NextRequest,
): Promise<NextResponse> {
  const session = getOrCreateDemoSession(request);

  try {
    const contentLengthHeader =
      request.headers.get("content-length");

    const contentLength = contentLengthHeader
      ? Number(contentLengthHeader)
      : 0;

    if (
      Number.isFinite(contentLength) &&
      contentLength > MAX_REQUEST_BYTES
    ) {
      throw new TradingError(
        "REQUEST_TOO_LARGE",
        "The order request is too large.",
        413,
      );
    }

    const contentType =
      request.headers.get("content-type") ?? "";

    if (
      !contentType
        .toLowerCase()
        .includes("application/json")
    ) {
      throw new TradingError(
        "JSON_REQUIRED",
        "Content-Type must be application/json.",
        415,
      );
    }

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      throw new TradingError(
        "INVALID_JSON",
        "The order request contains invalid JSON.",
        400,
      );
    }

    const result =
      await tradingExecutionService.executeOrder(
        {
          sessionId: session.sessionId,
          requestId: randomUUID(),
        },
        body,
      );

    return finalizeResponse(
      NextResponse.json(
        {
          ok: true,
          mode: "paper",
          liveTrading: false,
          result,
        },
        {
          status: result.idempotentReplay ? 200 : 201,
        },
      ),
      session,
    );
  } catch (error) {
    const normalized = normalizeTradingError(error);

    return finalizeResponse(
      NextResponse.json(
        normalized.body,
        {
          status: normalized.status,
        },
      ),
      session,
    );
  }
}
