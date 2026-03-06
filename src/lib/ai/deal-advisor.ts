import { prisma } from "@/lib/prisma";
import { runAIJob } from "./job-runner";

interface DealAnalysis {
  healthScore: number;
  winProbability: number;
  riskFactors: { risk: string; severity: "low" | "medium" | "high" }[];
  nextActions: { action: string; priority: "now" | "this_week" | "this_month" }[];
  pricingAdvice?: string;
  predictedCloseDate?: string;
  stageRecommendation?: string;
  insights: string[];
}

export async function analyzeDeal(dealId: string): Promise<DealAnalysis> {
  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    include: {
      contact: { include: { company: true } },
      company: true,
      activities: { orderBy: { createdAt: "desc" }, take: 20 },
      quotes: true,
    },
  });

  if (!deal) throw new Error("Deal not found");

  const daysSinceCreated = Math.floor(
    (Date.now() - deal.createdAt.getTime()) / (1000 * 60 * 60 * 24)
  );
  const daysSinceLastActivity = deal.activities[0]
    ? Math.floor(
        (Date.now() - deal.activities[0].createdAt.getTime()) / (1000 * 60 * 60 * 24)
      )
    : daysSinceCreated;

  const input = {
    deal: {
      name: deal.name,
      amount: deal.amount,
      stage: deal.stage,
      pipeline: deal.pipeline,
      probability: deal.probability,
      closeDate: deal.closeDate,
      daysSinceCreated,
      daysSinceLastActivity,
      lostReason: deal.lostReason,
    },
    contact: deal.contact
      ? {
          name: `${deal.contact.firstName} ${deal.contact.lastName}`,
          jobTitle: deal.contact.jobTitle,
          lifecycleStage: deal.contact.lifecycleStage,
          leadScore: deal.contact.leadScore,
        }
      : null,
    company: (deal.company || deal.contact?.company)
      ? {
          name: (deal.company || deal.contact?.company)?.name,
          industry: (deal.company || deal.contact?.company)?.industry,
          size: (deal.company || deal.contact?.company)?.size,
          revenue: (deal.company || deal.contact?.company)?.revenue,
        }
      : null,
    activities: deal.activities.map((a) => ({
      type: a.type,
      subject: a.subject,
      outcome: a.outcome,
      date: a.createdAt,
    })),
    quotes: deal.quotes.map((q) => ({
      total: q.total,
      status: q.status,
    })),
  };

  const result = await runAIJob("deal_advisor", "analyze_deal", input, { dealId });
  const analysis = result.output as DealAnalysis;

  // Create insights for high-risk deals
  if (analysis.healthScore < 40 || analysis.riskFactors.some((r) => r.severity === "high")) {
    await prisma.aIInsight.create({
      data: {
        type: "deal_risk",
        title: `Deal at risk: ${deal.name}`,
        description: analysis.riskFactors.map((r) => r.risk).join(". "),
        priority: analysis.healthScore < 25 ? "critical" : "high",
        resourceType: "deal",
        resourceId: dealId,
        actionItems: JSON.stringify(analysis.nextActions),
      },
    });
  }

  return analysis;
}

// Scan all active deals for insights
export async function scanDealsForInsights(): Promise<number> {
  const deals = await prisma.deal.findMany({
    where: { stage: { notIn: ["closed_won", "closed_lost"] } },
    select: { id: true },
  });

  let insightsCreated = 0;
  for (const deal of deals) {
    try {
      const analysis = await analyzeDeal(deal.id);
      if (analysis.healthScore < 50) insightsCreated++;
    } catch (err) {
      console.error(`Deal analysis failed for ${deal.id}:`, err);
    }
  }
  return insightsCreated;
}
