import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse } from "@/lib/errors";

export async function GET() {
  try {
    const [applicationStatus, databaseStatus, lastHealth] = await Promise.all([
      Promise.resolve(true),
      (async () => {
        try {
          await prisma.$queryRaw`SELECT 1`;
          return true;
        } catch {
          return false;
        }
      })(),
      prisma.systemHealth.findFirst({
        orderBy: { lastCheckedAt: "desc" },
      }),
    ]);

    const health = {
      application: applicationStatus ? "ok" : "degraded",
      api: applicationStatus ? "ok" : "degraded",
      database: databaseStatus ? "ok" : "down",
      environment: process.env.NODE_ENV || "development",
      lastCheckedAt: lastHealth?.lastCheckedAt || new Date().toISOString(),
    };

    if (lastHealth) {
      await prisma.systemHealth.update({
        where: { id: lastHealth.id },
        data: {
          application: health.application,
          api: health.api,
          database: health.database,
          lastCheckedAt: new Date(),
        },
      });
    } else {
      await prisma.systemHealth.create({
        data: {
          application: health.application,
          api: health.api,
          database: health.database,
          environment: process.env.NODE_ENV || "development",
        },
      });
    }

    return successResponse({ health });
  } catch (error) {
    console.error("System health error:", error);
    return errorResponse("System health check failed");
  }
}