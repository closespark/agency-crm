import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const page = parseInt(searchParams.get("page") || "1");
  const pageSize = parseInt(searchParams.get("pageSize") || "25");
  const agentId = searchParams.get("agentId") || "";
  const status = searchParams.get("status") || "";
  const type = searchParams.get("type") || "";

  const where: Record<string, unknown> = {};

  if (agentId) {
    where.agentId = agentId;
  }
  if (status) {
    where.status = status;
  }
  if (type) {
    where.type = type;
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [data, total, summary] = await Promise.all([
    prisma.aIJob.findMany({
      where,
      include: {
        agent: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.aIJob.count({ where }),
    prisma.aIJob.aggregate({
      where: { createdAt: { gte: thirtyDaysAgo } },
      _count: true,
      _sum: { tokens: true, cost: true },
    }),
  ]);

  return NextResponse.json({
    data,
    meta: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
    summary: {
      totalJobs: summary._count,
      totalTokens: summary._sum.tokens || 0,
      totalCost: summary._sum.cost || 0,
    },
  });
}
