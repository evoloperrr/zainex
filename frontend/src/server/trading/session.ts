import {
  randomUUID,
} from "node:crypto";

import type {
  NextRequest,
  NextResponse,
} from "next/server";

const COOKIE_NAME =
  "zainex_demo_session";

const SESSION_PATTERN =
  /^[a-f0-9-]{36}$/i;

const MAX_AGE_SECONDS =
  60 * 60 * 24 * 30;

// ZAINEX_MULTI_USER_GOOGLE_AUTH_V1

export interface DemoSession {
  sessionId: string;
  isNew: boolean;
}

export function getOrCreateDemoSession(
  request: NextRequest,
): DemoSession {
  const existing =
    request.cookies.get(
      COOKIE_NAME,
    )?.value;

  if (
    existing &&
    SESSION_PATTERN.test(existing)
  ) {
    return {
      sessionId: existing,
      isNew: false,
    };
  }

  return {
    sessionId: randomUUID(),
    isNew: true,
  };
}

export function applyDemoSessionCookie(
  response: NextResponse,
  session: DemoSession,
): void {
  if (!session.isNew) {
    return;
  }

  response.cookies.set({
    name: COOKIE_NAME,
    value: session.sessionId,
    httpOnly: true,
    sameSite: "lax",
    secure:
      process.env.NODE_ENV ===
      "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}
