import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";

/**
 * Edge gate — Next.js `proxy` convention (the successor to `middleware`).
 *
 * This is a *fast* first line only: it verifies the session JWT's signature and
 * expiry so unauthenticated visitors are redirected before any page renders.
 * It is deliberately not the authorisation boundary — role checks and record
 * ownership are enforced server-side in every route handler and server component
 * (see `src/lib/auth/guard.ts`), because a cookie alone must never be trusted.
 */

const PUBLIC_PATHS = ["/sign-in", "/sign-up", "/verify"];
const PUBLIC_API = [
  "/api/auth/sign-in",
  "/api/auth/sign-up",
  "/api/auth/verify",
  "/api/auth/session",
];

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const isPublicPage = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const isPublicApi = PUBLIC_API.includes(pathname);
  const claims = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);

  if (isPublicApi) return NextResponse.next();

  if (isPublicPage) {
    // A token can verify at the edge yet be rejected by the app (revoked after
    // sign-out, deactivated account, changed role) because only the app reads the
    // database. When the app bounces such a visitor here it appends ?expired, and
    // we drop the cookie so they land on sign-in instead of looping.
    if (claims && request.nextUrl.searchParams.has("expired")) {
      const response = NextResponse.next();
      response.cookies.delete(SESSION_COOKIE);
      return response;
    }
    if (claims) {
      return NextResponse.redirect(new URL("/overview", request.url));
    }
    return NextResponse.next();
  }

  if (!claims) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        {
          error: {
            code: "UNAUTHENTICATED",
            message: "Your session has expired.",
            hint: "Sign in again to continue.",
          },
        },
        { status: 401 },
      );
    }
    const target = new URL("/sign-in", request.url);
    if (pathname !== "/") target.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(target);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Everything except Next internals, the favicon and static assets.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)",
  ],
};
