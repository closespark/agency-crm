import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    autopilotStatus,
    insights,
    errors,
    changelog,
    totalContacts,
    activeDeals,
    pipelineValue,
    activeEnrollments,
    failedJobs7d,
  ] = await Promise.all([
    prisma.systemChangelog.findFirst({
      where: { category: "autopilot", changeType: "status" },
      orderBy: { createdAt: "desc" },
    }),
    prisma.aIInsight.findMany({
      where: { createdAt: { gte: threeDaysAgo } },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        type: true,
        title: true,
        description: true,
        priority: true,
        status: true,
        createdAt: true,
      },
    }),
    prisma.aIJob.findMany({
      where: { status: "failed", createdAt: { gte: twentyFourHoursAgo } },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        type: true,
        error: true,
        createdAt: true,
        agent: { select: { name: true } },
      },
    }),
    prisma.systemChangelog.findMany({
      where: { category: { not: "autopilot" }, createdAt: { gte: thirtyDaysAgo } },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        category: true,
        changeType: true,
        description: true,
        expectedImpact: true,
        createdAt: true,
      },
    }),
    prisma.contact.count(),
    prisma.deal.count({ where: { stage: { notIn: ["closed_won", "closed_lost"] } } }),
    prisma.deal.aggregate({
      where: { stage: { notIn: ["closed_won", "closed_lost"] } },
      _sum: { amount: true },
    }),
    prisma.sequenceEnrollment.count({ where: { status: "active" } }),
    prisma.aIJob.count({
      where: { status: "failed", createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
    }),
  ]);

  return NextResponse.json({
    data: {
      autopilot: {
        isActive: autopilotStatus?.description?.includes("activated") ?? false,
        lastChangedAt: autopilotStatus?.createdAt?.toISOString() ?? null,
      },
      insights,
      errors: errors.map((e) => ({
        id: e.id,
        type: e.type,
        error: e.error,
        agentName: e.agent?.name || "unknown",
        createdAt: e.createdAt.toISOString(),
      })),
      changelog,
      stats: {
        totalContacts,
        activeDeals,
        pipelineValue: pipelineValue._sum.amount || 0,
        activeEnrollments,
        failedJobs7d,
      },
    },
  });
}
