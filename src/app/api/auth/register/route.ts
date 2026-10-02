import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, signToken, setAuthCookie } from "@/lib/auth";
import { validateEmail, validatePassword, validateRole } from "@/lib/validations";
import { successResponse, badRequestResponse, errorResponse } from "@/lib/errors";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, name, role = "CUSTOMER" } = body;

    if (!email || !password || !name) {
      return badRequestResponse("Email, password, and name are required");
    }

    if (!validateEmail(email)) {
      return badRequestResponse("Invalid email format");
    }

    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      return badRequestResponse(passwordValidation.errors.join(", "));
    }

    if (!validateRole(role)) {
      return badRequestResponse("Invalid role. Must be MERCHANT, CUSTOMER, or ADMIN");
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return badRequestResponse("Email already registered");
    }

    const hashedPassword = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        role,
      },
    });

    const tokenPayload = {
      userId: user.id,
      email: user.email,
      role: user.role as "MERCHANT" | "CUSTOMER" | "ADMIN",
    };

    const token = await signToken(tokenPayload);
    await setAuthCookie(token);

    return successResponse({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      token,
    }, 201);
  } catch (error) {
    console.error("Registration error:", error);
    return errorResponse("Registration failed");
  }
}
