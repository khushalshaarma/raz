import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "X-DNS-Prefetch-Control": "on",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
};

const CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://checkout.razorpay.com https://api.razorpay.com",
  "style-src 'self' 'unsafe-inline' https://checkout.razorpay.com",
  "img-src 'self' data: blob: https://api.razorpay.com https://checkout.razorpay.com",
  "font-src 'self'",
  "connect-src 'self' https://api.razorpay.com https://checkout.razorpay.com",
  "frame-src 'self' https://api.razorpay.com https://checkout.razorpay.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

export function applySecurityHeaders(response: NextResponse): NextResponse {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }
  response.headers.set("Content-Security-Policy", CSP_DIRECTIVES);
  return response;
}

export function securityHeadersMiddleware(request: NextRequest): NextResponse | null {
  if (request.nextUrl.pathname.startsWith("/_next")) return null;
  if (request.nextUrl.pathname.includes(".")) return null;

  const response = NextResponse.next();
  return applySecurityHeaders(response);
}
