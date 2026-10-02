import { NextResponse } from "next/server";
import type { JWTPayload } from "@/lib/auth";

export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function errorResponse(message: string, status: number = 500) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Role + authentication guard for API route handlers.
 * - missing/invalid session         -> 401
 * - authenticated but wrong role    -> 403
 * - authenticated, correct role     -> returns the user for downstream use
 */
export function authorizeRoutes(
  user: JWTPayload | null,
  allowedRoles: Array<"MERCHANT" | "CUSTOMER" | "ADMIN">
): { response: NextResponse } | { user: JWTPayload } {
  if (!user) {
    return { response: unauthorizedResponse() };
  }
  if (!allowedRoles.includes(user.role)) {
    return { response: forbiddenResponse() };
  }
  return { user };
}

export function unauthorizedResponse(message = "Unauthorized") {
  return NextResponse.json({ error: message }, { status: 401 });
}

/**
 * Guard for merchant-scoped APIs.
 * - not authenticated                              -> 401
 * - authenticated but not MERCHANT                 -> 403
 * - MERCHANT but missing merchantId (bad session)  -> 403
 */
export function merchantGuard(
  user: JWTPayload | null
): { response: NextResponse } | { merchantId: string } {
  if (!user) {
    return { response: unauthorizedResponse() };
  }
  if (user.role !== "MERCHANT" || !user.merchantId) {
    return { response: forbiddenResponse() };
  }
  return { merchantId: user.merchantId };
}

export function forbiddenResponse(message = "Forbidden") {
  return NextResponse.json({ error: message }, { status: 403 });
}

export function notFoundResponse(message = "Not found") {
  return NextResponse.json({ error: message }, { status: 404 });
}

export function badRequestResponse(message = "Bad request") {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function successResponse<T>(data: T, status: number = 200) {
  return NextResponse.json(data, { status });
}
