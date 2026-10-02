import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword, signToken, setAuthCookie } from "@/lib/auth";
import { successResponse, errorResponse, notFoundResponse } from "@/lib/errors";
import { getDemoLoginAvailability, getDemoMerchantCredentials } from "@/lib/config/demo";

/**
 * Demo merchant entry.
 *
 * Creates a genuine, fully authenticated MERCHANT session for the seeded demo
 * account so a presentation can skip the sign-in form.
 *
 * This is NOT an authentication bypass. It performs the same work as
 * `/api/auth/login`:
 *   - the configured demo password is verified against the stored bcrypt hash
 *     via `verifyPassword`,
 *   - the session JWT is minted by `signToken` with the same payload shape,
 *   - it is delivered through `setAuthCookie` as an httpOnly cookie.
 *
 * Consequently every downstream guard (middleware, `merchantGuard`, merchant
 * scoping) applies unchanged, and the session carries only that one merchant's
 * id — no admin privileges are implied.
 *
 * Responses never contain the password, the hash, or the raw token.
 */
export async function POST(_request: NextRequest) {
  try {
    const availability = getDemoLoginAvailability();

    // Fail closed and stay indistinguishable from "route not available" so the
    // endpoint cannot be probed in a production deployment.
    if (!availability.enabled) {
      return notFoundResponse("Not found");
    }

    const credentials = getDemoMerchantCredentials();
    if (!credentials) {
      console.error(
        "Demo login is enabled but DEMO_MERCHANT_PASSWORD is not configured; refusing to start a demo session"
      );
      return errorResponse("Demo login is not configured");
    }

    const user = await prisma.user.findUnique({ where: { email: credentials.email } });
    if (!user) {
      console.error(
        `Demo login enabled but the demo merchant "${credentials.email}" does not exist. Run the seed (npm run db:seed).`
      );
      return errorResponse("Demo merchant is not seeded");
    }

    // The demo shortcut is a MERCHANT-only convenience. Refuse any other role so
    // it can never be used to obtain an admin session.
    if (user.role !== "MERCHANT") {
      return errorResponse("Demo login is restricted to merchant accounts");
    }

    const passwordValid = await verifyPassword(credentials.password, user.password);
    if (!passwordValid) {
      // The seeded password no longer matches the configured demo password.
      console.error(
        `Demo login password does not match the stored hash for ${credentials.email}.`
      );
      return errorResponse("Demo login is not configured");
    }

    const merchant = await prisma.merchant.findUnique({ where: { ownerId: user.id } });
    if (!merchant) {
      console.error(`Demo merchant user ${credentials.email} has no merchant record.`);
      return errorResponse("Demo merchant is not seeded");
    }

    const token = await signToken({
      userId: user.id,
      email: user.email,
      role: "MERCHANT",
      merchantId: merchant.id,
      // Display-only marker so the dashboard can show a "demo mode" banner.
      demoMode: true,
    });
    await setAuthCookie(token);

    // No token in the body: the browser only needs the cookie plus enough
    // information to route itself.
    return successResponse({
      user: {
        id: user.id,
        name: user.name,
        role: "MERCHANT",
        merchantId: merchant.id,
        demoMode: true,
      },
      demo: true,
      redirectTo: "/merchant/dashboard",
    });
  } catch (error) {
    console.error("Demo login error:", error);
    return errorResponse("Demo login failed");
  }
}