import {
  auth,
} from "@/auth";

import {
  NextResponse,
} from "next/server";

// ZAINEX_MULTI_USER_GOOGLE_AUTH_V1
// ZAINEX_THREE_LEVEL_REFERRALS_V1

const BACKEND_URL =
  (
    process.env.ZAINEX_BACKEND_URL ??
    "http://127.0.0.1:8000"
  ).replace(/\/+$/, "");

type LinkPayload = {
  ok?: boolean;
  sessionId?: string;
};

function referralCodeFrom(
  request: Request,
): string {
  const candidate =
    new URL(request.url)
      .searchParams
      .get("ref")
      ?.trim()
      .toUpperCase() ?? "";

  return /^[A-Z0-9]{6,32}$/.test(
    candidate,
  )
    ? candidate
    : "";
}

function failure(
  request: Request,
  referralCode: string,
): NextResponse {
  const url =
    new URL(
      "/auth",
      request.url,
    );

  url.searchParams.set(
    "error",
    "ProvisioningFailed",
  );

  if (referralCode) {
    url.searchParams.set(
      "ref",
      referralCode,
    );
  }

  return NextResponse.redirect(url);
}

export async function GET(
  request: Request,
): Promise<NextResponse> {
  const referralCode =
    referralCodeFrom(request);

  const session = await auth();

  const email =
    session?.user?.email
      ?.trim()
      .toLowerCase() ?? "";

  if (email === "") {
    const authUrl =
      new URL(
        "/auth",
        request.url,
      );

    if (referralCode) {
      authUrl.searchParams.set(
        "ref",
        referralCode,
      );
    }

    return NextResponse.redirect(
      authUrl,
    );
  }

  const name =
    session?.user?.name
      ?.trim() ||
    email.split("@")[0] ||
    "ZAINEX User";

  const token =
    process.env
      .INTELIBRAIN_INTERNAL_TOKEN
      ?.trim();

  if (!token) {
    return failure(
      request,
      referralCode,
    );
  }

  let response: Response;

  try {
    response = await fetch(
      `${BACKEND_URL}/api/auth/google-link`,
      {
        method: "POST",
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "Content-Type":
            "application/json",
          "X-Zainex-Internal-Token":
            token,
        },
        body: JSON.stringify({
          email,
          name,
          referralCode:
            referralCode || undefined,
        }),
      },
    );
  }
  catch {
    return failure(
      request,
      referralCode,
    );
  }

  let payload: LinkPayload;

  try {
    payload =
      (await response.json()) as
        LinkPayload;
  }
  catch {
    return failure(
      request,
      referralCode,
    );
  }

  const sessionId =
    payload.sessionId?.trim() ?? "";

  if (
    !response.ok ||
    payload.ok !== true ||
    !/^[a-f0-9-]{36}$/i.test(
      sessionId,
    )
  ) {
    return failure(
      request,
      referralCode,
    );
  }

  const result =
    NextResponse.redirect(
      new URL(
        "/dashboard",
        request.url,
      ),
    );

  result.cookies.set({
    name: "zainex_demo_session",
    value: sessionId,
    httpOnly: true,
    sameSite: "lax",
    secure:
      process.env.NODE_ENV ===
      "production",
    path: "/",
    maxAge:
      60 * 60 * 24 * 30,
  });

  return result;
}