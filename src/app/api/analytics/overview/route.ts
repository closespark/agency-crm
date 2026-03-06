import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

  const [
    totalContacts,
    totalDeals,
    wonDeals,
    lostDeals,
    openTickets,
    allDeals,
    contactsByMonth,
    dealsByStage,
    ticketsByStatus,
    recentActivities,
    topOwners,
  ] = await Promise.all([
    prisma.contact.count(),
    prisma.deal.count(),
    prisma.deal.findMany({
      where: { stage: "closed_won" },
      select: { amount: true },
    }),
    prisma.deal.count({ where: { stage: "closed_lost" } }),
    prisma.ticket.count({
      where: { status: { in: ["new", "waiting_on_contact", "waiting_on_us", "in_progress", "review_qa"] } },
    }),
    prisma.deal.findMany({
      where: { stage: "closed_won" },
      select: { amount: true, createdAt: true },
    }),
    prisma.contact.findMany({
      where: { createdAt: { gte: sixMonthsAgo } },
      select: { createdAt: true },
    }),
    prisma.deal.groupBy({
      by: ["stage"],
      _count: { id: true },
      _sum: { amount: true },
    }),
    prisma.ticket.groupBy({
      by: ["status"],
      _count: { id: true },
    }),
    prisma.activity.findMany({
      where: {
        createdAt: {
          gte: new Date(now.getTime() - 8 * 7 * 24 * 60 * 60 * 1000),
        },
      },
      select: { type: true, createdAt: true },
    }),
    prisma.deal.groupBy({
      by: ["ownerId"],
      where: { stage: "closed_won", ownerId: { not: null } },
      _sum: { amount: true },
      _count: { id: true },
      orderBy: { _sum: { amount: "desc" } },
      take: 5,
    }),
  ]);

  // Process contacts by month
  const contactsPerMonth: { month: string; count: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const label = d.toLocaleString("en-US", { month: "short", year: "2-digit" });
    const monthStart = new Date(d.getFullYear(), d.getMonth(), 1);
    const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    const count = contactsByMonth.filter(
      (c: { createdAt: Date }) => c.createdAt >= monthStart && c.createdAt < monthEnd
    ).length;
    contactsPerMonth.push({ month: label, count });
  }

  // Process deals by stage
  const stageOrder = [
    "discovery", "proposal_sent", "negotiation", "contract_sent", "closed_won", "closed_lost",
  ];
  const stageLabels: Record<string, string> = {
    discovery: "Discovery", proposal_sent: "Proposal Sent",
    negotiation: "Negotiation", contract_sent: "Contract Sent",
    closed_won: "Closed Won", closed_lost: "Closed Lost",
  };
  const dealStages = stageOrder.map((stage) => {
    const found = dealsByStage.find(
      (d: { stage: string }) => d.stage === stage
    );
    return {
      stage: stageLabels[stage] || stage,
      count: found?._count?.id ?? 0,
      amount: found?._sum?.amount ?? 0,
    };
  });

  // Process tickets by status
  const statusLabels: Record<string, string> = {
    new: "New", waiting_on_contact: "Waiting on Contact", waiting_on_us: "Waiting on Us",
    in_progress: "In Progress", review_qa: "Review/QA", closed: "Closed",
  };
  const ticketStatuses = Object.keys(statusLabels).map((status) => {
    const found = ticketsByStatus.find(
      (t: { status: string }) => t.status === status
    );
    return {
      status: statusLabels[status],
      count: found?._count?.id ?? 0,
    };
  });

  // Process activities by week
  const activityByWeek: { week: string; email: number; call: number; meeting: number; note: number; task: number }[] = [];
  for (let i = 7; i >= 0; i--) {
    const weekStart = new Date(now.getTime() - (i + 1) * 7 * 24 * 60 * 60 * 1000);
    const weekEnd = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000);
    const weekLabel = weekStart.toLocaleString("en-US", { month: "short", day: "numeric" });
    const weekActivities = recentActivities.filter(
      (a: { createdAt: Date }) => a.createdAt >= weekStart && a.createdAt < weekEnd
    );
    activityByWeek.push({
      week: weekLabel,
      email: weekActivities.filter((a: { type: string }) => a.type === "email").length,
      call: weekActivities.filter((a: { type: string }) => a.type === "call").length,
      meeting: weekActivities.filter((a: { type: string }) => a.type === "meeting").length,
      note: weekActivities.filter((a: { type: string }) => a.type === "note").length,
      task: weekActivities.filter((a: { type: string }) => a.type === "task").length,
    });
  }

  // Revenue over time (last 6 months)
  const revenueOverTime: { month: string; revenue: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const label = d.toLocaleString("en-US", { month: "short", year: "2-digit" });
    const monthStart = new Date(d.getFullYear(), d.getMonth(), 1);
    const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    const monthRevenue = allDeals
      .filter((deal: { createdAt: Date }) => deal.createdAt >= monthStart && deal.createdAt < monthEnd)
      .reduce((sum: number, deal: { amount: number | null }) => sum + (deal.amount || 0), 0);
    revenueOverTime.push({ month: label, revenue: monthRevenue });
  }

  // Top owners - fetch names
  const ownerIds = topOwners
    .map((o: { ownerId: string | null }) => o.ownerId)
    .filter((id: string | null): id is string => id !== null);
  const ownerUsers = await prisma.user.findMany({
    where: { id: { in: ownerIds } },
    select: { id: true, name: true },
  });
  const topPerformers = topOwners.map((o: { ownerId: string | null; _count: { id: number }; _sum: { amount: number | null } }) => {
    const user = ownerUsers.find((u: { id: string }) => u.id === o.ownerId);
    return {
      name: user?.name || "Unknown",
      deals: o._count.id,
      revenue: o._sum.amount || 0,
    };
  });

  // Calculate KPIs
  const totalRevenue = wonDeals.reduce(
    (sum: number, d: { amount: number | null }) => sum + (d.amount || 0), 0
  );
  const avgDealSize = wonDeals.length > 0 ? totalRevenue / wonDeals.length : 0;
  const closedDeals = wonDeals.length + lostDeals;
  const winRate = closedDeals > 0 ? Math.round((wonDeals.length / closedDeals) * 100) : 0;

  return NextResponse.json({
    data: {
      kpis: {
        totalContacts,
        totalDeals,
        dealsWon: wonDeals.length,
        totalRevenue,
        avgDealSize,
        winRate,
        openTickets,
      },
      contactsPerMonth,
      dealStages,
      ticketStatuses,
      activityByWeek,
      revenueOverTime,
      topPerformers,
    },
  });
}
