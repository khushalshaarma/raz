import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { applySecurityHeaders } from "@/lib/security/headers";
import {
  checkRateLimit,
  getRateLimitHeaders,
  resolveApiRateLimit,
} from "@/lib/security/rate-limiter";
import { generateCorrelationId } from "@/lib/observability/correlation";

const ROLE_ROUTES: Record<string, string[]> = {
  MERCHANT: ["/merchant", "/api/merchant"],
  CUSTOMER: ["/customer", "/api/customer", "/api/shop"],
  ADMIN: ["/admin", "/api/admin"],
};

const PUBLIC_ROUTES = [
  "/",
  "/login",
  "/register",
  "/api/auth/login",
  "/api/auth/register",
  // Demo merchant entry. Public because it mints its own session from
  // server-side configuration; the route itself refuses to run unless demo
  // login is explicitly enabled and never in production. It stays subject to
  // the API rate limiter below.
  "/api/auth/demo",
  "/api/system/health",
];

/**
 * Resolve the client address from the proxy headers a real deployment sets.
 *
 * Browsers never send these, so in local development this returns "unknown" and
 * every request shares one bucket per path. That is unavoidable without a proxy,
 * which is why development uses a larger budget in `resolveApiRateLimit`.
 */
function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }

  return (
    request.headers.get("x-real-ip")?.trim() ||
    request.headers.get("cf-connecting-ip")?.trim() ||
    request.headers.get("fly-client-ip")?.trim() ||
    request.headers.get("true-client-ip")?.trim() ||
    "unknown"
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow static files and Next.js internals
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  ) {
    return applySecurityHeaders(NextResponse.next());
  }

  // Rate limiting for API routes
  if (pathname.startsWith("/api/")) {
    const clientIp = getClientIp(request);
    const config = resolveApiRateLimit(pathname);
    const rateLimitResult = checkRateLimit(`api:${clientIp}:${pathname}`, config);

    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded" },
        {
          status: 429,
          headers: getRateLimitHeaders(rateLimitResult),
        }
      );
    }
  }

  // Generate correlation ID
  const correlationId = generateCorrelationId();

  // Allow public routes
  if (PUBLIC_ROUTES.includes(pathname)) {
    const response = applySecurityHeaders(NextResponse.next());
    response.headers.set("x-correlation-id", correlationId);
    return response;
  }

  // Get token from cookies
  const token = request.cookies.get("growthos_token")?.value;

  if (!token) {
    if (pathname.startsWith("/api/")) {
      return applySecurityHeaders(
        NextResponse.json(
          { error: "Unauthorized", code: "SESSION_MISSING", sessionInvalid: true },
          { status: 401 }
        )
      );
    }
    return applySecurityHeaders(NextResponse.redirect(new URL("/login", request.url)));
  }

  const payload = await verifyToken(token);

  if (!payload) {
    // A token that is present but invalid/expired must never redirect an API
    // caller to the /login HTML page. `fetch()` follows the redirect and hands
    // back markup, so `await res.json()` throws a SyntaxError and the client
    // cannot distinguish "session expired" from a real transport failure — this
    // was the source of the misleading "Network error during verification"
    // after Razorpay Checkout. API routes get a JSON 401 instead; only
    // navigations are redirected.
    if (pathname.startsWith("/api/")) {
      const apiResponse = applySecurityHeaders(
        NextResponse.json(
          { error: "Unauthorized", code: "SESSION_EXPIRED", sessionInvalid: true },
          { status: 401 }
        )
      );
      apiResponse.cookies.delete("growthos_token");
      return apiResponse;
    }

    const response = applySecurityHeaders(NextResponse.redirect(new URL("/login", request.url)));
    response.cookies.delete("growthos_token");
    return response;
  }

  // Check role-based access
  for (const [role, prefixes] of Object.entries(ROLE_ROUTES)) {
    for (const prefix of prefixes) {
      if (pathname.startsWith(prefix)) {
        if (payload.role !== role) {
          if (pathname.startsWith("/api/")) {
            return applySecurityHeaders(
              NextResponse.json({ error: "Forbidden" }, { status: 403 })
            );
          }
          return applySecurityHeaders(NextResponse.redirect(new URL("/login", request.url)));
        }
      }
    }
  }

  // Add user info and security headers to response
  const response = applySecurityHeaders(NextResponse.next());
  response.headers.set("x-user-id", payload.userId);
  response.headers.set("x-user-role", payload.role);
  response.headers.set("x-user-email", payload.email);
  response.headers.set("x-correlation-id", correlationId);
  if (payload.merchantId) {
    response.headers.set("x-merchant-id", payload.merchantId);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
