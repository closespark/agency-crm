// GET /api/content/performance — content performance dashboard data

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [performance, subscriberStats, channelBreakdown] = await Promise.all([
    // Recent content performance
    prisma.contentPerformance.findMany({
      where: { measuredAt: { gte: thirtyDaysAgo } },
      include: {
        draft: { select: { title: true, channel: true, publishedAt: true } },
      },
      orderBy: { engagementRate: "desc" },
      take: 20,
    }),
    // Newsletter subscriber stats
    prisma.newsletterSubscriber.aggregate({
      where: { isActive: true },
      _count: true,
      _avg: { openRate: true, clickRate: true },
    }),
    // Performance by channel
    prisma.contentPerformance.groupBy({
      by: ["channel"],
      where: { measuredAt: { gte: thirtyDaysAgo } },
      _sum: {
        opens: true,
        clicks: true,
        views: true,
        comments: true,
        pipelineEntriesGenerated: true,
      },
      _avg: { engagementRate: true },
      _count: true,
    }),
  ]);

  const totalPipelineEntries = performance.reduce(
    (sum, p) => sum + p.pipelineEntriesGenerated,
    0
  );

  return NextResponse.json({
    performance,
    subscribers: {
      total: subscriberStats._count,
      avgOpenRate: subscriberStats._avg.openRate,
      avgClickRate: subscriberStats._avg.clickRate,
    },
    channelBreakdown,
    totalPipelineEntries,
  });
}
