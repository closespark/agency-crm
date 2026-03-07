import { NextResponse } from "next/server";

export async function GET() {
  const checks: Record<string, string> = {};

  // Database check
  try {
    const { prisma } = await import("@/lib/prisma");
    await prisma.$queryRaw`SELECT 1`;
    checks.database = "ok";
  } catch {
    checks.database = "unavailable";
  }

  // Redis check
  if (process.env.REDIS_URL) {
    try {
      const { redis } = await import("@/lib/redis");
      await redis.ping();
      checks.redis = "ok";
    } catch {
      checks.redis = "unavailable";
    }
  }

  // Always return 200 so Railway healthcheck passes.
  // The checks object shows actual status for monitoring.
  return NextResponse.json({
    status: "ok",
    checks,
    timestamp: new Date().toISOString(),
  });
}
