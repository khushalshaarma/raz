import { SignJWT, jwtVerify } from "jose";
import type { JWTPayload as JoseJWTPayload } from "jose";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "growthos-dev-secret-change-in-production-2026"
);

const COOKIE_NAME = "growthos_token";
const TOKEN_EXPIRY = "7d";

export interface JWTPayload {
  userId: string;
  email: string;
  role: "MERCHANT" | "CUSTOMER" | "ADMIN";
  merchantId?: string;
  /**
   * True when the session was started through the demo merchant shortcut.
   *
   * This is a DISPLAY marker only. It grants no additional permission: the
   * claims above are identical to a normal password sign-in, and middleware and
   * the merchant guards read only `role` and `merchantId`.
   */
  demoMode?: boolean;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function signToken(payload: JWTPayload): Promise<string> {
  return new SignJWT(payload as unknown as JoseJWTPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(TOKEN_EXPIRY)
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as JWTPayload;
  } catch {
    return null;
  }
}

export async function setAuthCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });
}

export async function removeAuthCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function getAuthFromCookies(): Promise<JWTPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

/**
 * Read the session from a route handler's `NextRequest`.
 *
 * `getAuthFromCookies()` depends on `cookies()` from `next/headers`, which
 * throws "`cookies` was called outside a request scope" whenever it is invoked
 * outside a live Next.js render — which makes any route that depends on it
 * impossible to cover with unit tests. A route handler already receives the
 * request, so read the cookie off it directly.
 */
export async function getAuthFromRequest(
  request: { cookies: { get(name: string): { value: string } | undefined } }
): Promise<JWTPayload | null> {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

export function requireRole(user: JWTPayload | null, role: string): boolean {
  if (!user) return false;
  return user.role === role;
}
