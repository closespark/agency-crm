import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const checks: Record<string, string> = {};

  // Database check
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = "ok";
  } catch {
    checks.database = "error";
  }

  // Redis check (optional)
  if (process.env.REDIS_URL) {
    try {
      const { redis } = await import("@/lib/redis");
      await redis.ping();
      checks.redis = "ok";
    } catch {
      checks.redis = "error";
    }
  }

  // Worker health check: verify autopilot ran within last 26 hours
  try {
    const lastRun = await prisma.systemChangelog.findFirst({
      where: { category: "autopilot", changeType: "daily_run" },
      orderBy: { createdAt: "desc" },
    });
    if (lastRun) {
      const hoursSinceRun = (Date.now() - lastRun.createdAt.getTime()) / (1000 * 60 * 60);
      checks.worker = hoursSinceRun < 26 ? "ok" : "stale";
      checks.lastAutopilot = lastRun.createdAt.toISOString();
    } else {
      checks.worker = "no_runs";
    }
  } catch {
    checks.worker = "error";
  }

  const healthy = checks.database === "ok";

  return NextResponse.json(
    {
      status: healthy ? "healthy" : "unhealthy",
      checks,
      timestamp: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503 }
  );
}
