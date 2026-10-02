import { NextRequest } from "next/server";
import { removeAuthCookie, getAuthFromCookies } from "@/lib/auth";
import { successResponse, errorResponse, unauthorizedResponse } from "@/lib/errors";

export async function GET() {
  try {
    const user = await getAuthFromCookies();
    if (!user) {
      return unauthorizedResponse();
    }
    return successResponse({ user });
  } catch (error) {
    console.error("Auth check error:", error);
    return errorResponse("Auth check failed");
  }
}

export async function POST() {
  try {
    await removeAuthCookie();
    return successResponse({ message: "Logged out" });
  } catch (error) {
    console.error("Logout error:", error);
    return errorResponse("Logout failed");
  }
}
