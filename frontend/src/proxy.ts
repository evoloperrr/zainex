import {
  auth,
} from "@/auth";

import {
  NextResponse,
} from "next/server";

// ZAINEX_MULTI_USER_GOOGLE_AUTH_V1
// ZAINEX_PREMIUM_PUBLIC_SITE_V1
// ZAINEX_THREE_LEVEL_REFERRALS_V1

export default auth((request) => {
  const email =
    request.auth?.user?.email
      ?.trim()
      .toLowerCase() ?? "";

  if (email !== "") {
    return NextResponse.next();
  }

  if (
    request.nextUrl.pathname.startsWith(
      "/api/",
    )
  ) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code:
            "AUTHENTICATION_REQUIRED",
          message:
            "Sign in with a verified Google account.",
        },
      },
      {
        status: 401,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }

  const authUrl =
    request.nextUrl.clone();

  authUrl.pathname = "/auth";
  authUrl.search = "";

  return NextResponse.redirect(
    authUrl,
  );
});

export const config = {
  matcher: [
    "/market/:path*",
    "/wallet/:path*",
    "/billing/:path*",
    "/rewards/:path*",
    "/workflow/:path*",
    "/profile/:path*",
    "/ai-strategies/:path*",
    "/api/market/:path*",
    "/api/referrals/:path*",
    "/api/trading/:path*",
  ],
};
