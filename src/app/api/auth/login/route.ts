import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword, signToken, setAuthCookie } from "@/lib/auth";
import { successResponse, badRequestResponse, errorResponse } from "@/lib/errors";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return badRequestResponse("Email and password are required");
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return badRequestResponse("Invalid credentials");
    }

    const isValid = await verifyPassword(password, user.password);
    if (!isValid) {
      return badRequestResponse("Invalid credentials");
    }

    // Get merchant ID if user is a merchant
    let merchantId: string | undefined;
    if (user.role === "MERCHANT") {
      const merchant = await prisma.merchant.findUnique({
        where: { ownerId: user.id },
      });
      merchantId = merchant?.id;
    }

    const tokenPayload = {
      userId: user.id,
      email: user.email,
      role: user.role as "MERCHANT" | "CUSTOMER" | "ADMIN",
      ...(merchantId && { merchantId }),
    };

    const token = await signToken(tokenPayload);
    await setAuthCookie(token);

    return successResponse({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        merchantId,
      },
      token,
    });
  } catch (error) {
    console.error("Login error:", error);
    return errorResponse("Login failed");
  }
}
