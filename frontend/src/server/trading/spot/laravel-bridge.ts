import {
  randomUUID,
} from "node:crypto";

import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  applyDemoSessionCookie,
  getOrCreateDemoSession,
  type DemoSession,
} from "@/server/trading/session";

import { auth } from "@/auth";

// ZAINEX_SPOT_DB_PERSISTENCE_V1

const DEFAULT_BACKEND_URL =
  "http://127.0.0.1:8000";

const DEFAULT_TIMEOUT_MS = 25_000;

const MAX_REQUEST_BYTES = 16_384;

type SpotProxyMethod = "GET" | "POST";

interface SpotProxyOptions {
  request: NextRequest;
  path: string;
  method: SpotProxyMethod;
  invalidJsonMessage?: string;
  requestTooLargeMessage?: string;
}

function finalizeResponse(
  response: NextResponse,
  session: DemoSession,
): NextResponse {
  response.headers.set(
    "Cache-Control",
    "no-store",
  );

  applyDemoSessionCookie(response, session);

  return response;
}

function errorResponse(
  session: DemoSession,
  status: number,
  code: string,
  message: string,
): NextResponse {
  return finalizeResponse(
    NextResponse.json(
      {
        ok: false,
        error: {
          code,
          message,
        },
      },
      {
        status,
      },
    ),
    session,
  );
}

function backendUrl(): string {
  return (
    process.env.ZAINEX_BACKEND_URL
      ?.trim()
      .replace(/\/+$/, "") ||
    DEFAULT_BACKEND_URL
  );
}

async function readPostBody(
  request: NextRequest,
  session: DemoSession,
  invalidJsonMessage: string,
  requestTooLargeMessage: string,
): Promise<
  | {
      ok: true;
      raw: string;
    }
  | {
      ok: false;
      response: NextResponse;
    }
> {
  const declaredLength = Number(
    request.headers.get("content-length") ?? "0",
  );

  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_REQUEST_BYTES
  ) {
    return {
      ok: false,
      response: errorResponse(
        session,
        413,
        "REQUEST_TOO_LARGE",
        requestTooLargeMessage,
      ),
    };
  }

  const raw = await request.text();

  const actualLength = new TextEncoder()
    .encode(raw)
    .byteLength;

  if (actualLength > MAX_REQUEST_BYTES) {
    return {
      ok: false,
      response: errorResponse(
        session,
        413,
        "REQUEST_TOO_LARGE",
        requestTooLargeMessage,
      ),
    };
  }

  try {
    JSON.parse(raw);
  }
  catch {
    return {
      ok: false,
      response: errorResponse(
        session,
        400,
        "INVALID_JSON",
        invalidJsonMessage,
      ),
    };
  }

  return {
    ok: true,
    raw,
  };
}

export async function proxySpotToLaravel(
  options: SpotProxyOptions,
): Promise<NextResponse> {
  const session = getOrCreateDemoSession(
    options.request,
  );

  const internalToken =
    process.env.INTELIBRAIN_INTERNAL_TOKEN?.trim();

  if (!internalToken) {
    return errorResponse(
      session,
      503,
      "SPOT_BACKEND_NOT_CONFIGURED",
      "The Laravel Spot backend is not configured.",
    );
  }

  const authSession = await auth();

  const userEmail =
    authSession?.user?.email
      ?.trim()
      .toLowerCase() ?? "";

  let body: string | undefined;

  if (options.method === "POST") {
    const parsed = await readPostBody(
      options.request,
      session,
      options.invalidJsonMessage ??
        "The Spot request contains invalid JSON.",
      options.requestTooLargeMessage ??
        "The Spot request is too large.",
    );

    if (!parsed.ok) {
      return parsed.response;
    }

    body = parsed.raw;
  }

  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${backendUrl()}${options.path}`,
      {
        method: options.method,
        cache: "no-store",
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          ...(options.method === "POST"
            ? { "Content-Type": "application/json" }
            : {}),
          "X-Zainex-Internal-Token": internalToken,
          "X-Zainex-Session-Id": session.sessionId,
          "X-Zainex-Request-Id": randomUUID(),
          ...(userEmail
            ? { "X-Zainex-User-Email": userEmail }
            : {}),
          "User-Agent":
            options.request.headers.get(
              "user-agent",
            ) ?? "ZAINEX Next.js Spot Bridge",
        },
        ...(body === undefined
          ? {}
          : { body }),
      },
    );

    const raw = await response.text();

    let payload: unknown;

    try {
      payload = JSON.parse(raw);
    }
    catch {
      return errorResponse(
        session,
        502,
        "SPOT_BACKEND_INVALID_RESPONSE",
        "The Laravel Spot backend returned an invalid response.",
      );
    }

    return finalizeResponse(
      NextResponse.json(payload, {
        status: response.status,
      }),
      session,
    );
  }
  catch (error) {
    return errorResponse(
      session,
      error instanceof Error &&
        error.name === "AbortError"
        ? 504
        : 503,
      error instanceof Error &&
        error.name === "AbortError"
        ? "SPOT_BACKEND_TIMEOUT"
        : "SPOT_BACKEND_UNAVAILABLE",
      error instanceof Error &&
        error.name === "AbortError"
        ? "The Laravel Spot backend timed out."
        : "The Laravel Spot backend is unavailable.",
    );
  }
  finally {
    clearTimeout(timeout);
  }
}
