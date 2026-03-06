// Scoring Feedback Loop
// Analyzes which prospect profiles actually converted and re-weights the scoring model.
// Gets smarter the longer you use it.

import { prisma } from "@/lib/prisma";
import { runAIJob } from "./job-runner";
import { safeParseJSON } from "@/lib/safe-json";

interface ScoringAdjustment {
  dimension: string;
  currentWeight: number;
  suggestedWeight: number;
  reasoning: string;
}

interface ICPRefinement {
  criteria: string;
  currentValue: string;
  suggestedValue: string;
  evidence: string;
}

interface FeedbackAnalysis {
  scoringAdjustments: ScoringAdjustment[];
  icpRefinements: ICPRefinement[];
  topConvertingProfile: string;
  averageTimeToConvert: number;
  winningChannels: { channel: string; conversionRate: number }[];
  winningAngles: { angle: string; positiveReplyRate: number }[];
  summary: string;
}

// Record a conversion outcome for the feedback loop
export async function recordConversion(params: {
  contactId: string;
  dealId?: string;
  outcome: "converted" | "lost" | "stalled";
  dealValue?: number;
  notes?: string;
}): Promise<void> {
  const contact = await prisma.contact.findUnique({
    where: { id: params.contactId },
    include: {
      company: true,
      sequenceEnrollments: { include: { sequence: true } },
    },
  });
  if (!contact) return;

  // Find which prospect search originally found them
  const prospect = await prisma.prospect.findFirst({
    where: { contactId: params.contactId },
    include: { search: true },
  });

  // Find which channel got the conversion
  const lastReply = await prisma.aIConversationLog.findFirst({
    where: { contactId: params.contactId, direction: "inbound", sentiment: "positive" },
    orderBy: { createdAt: "desc" },
  });

  // Find objections encountered
  const objections = await prisma.aIConversationLog.findMany({
    where: { contactId: params.contactId, objectionType: { not: null } },
  });

  // Calculate time to convert
  const firstTouch = await prisma.activity.findFirst({
    where: { contactId: params.contactId },
    orderBy: { createdAt: "asc" },
  });
  const timeToConvert = firstTouch
    ? Math.floor((Date.now() - firstTouch.createdAt.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  await prisma.conversionFeedback.create({
    data: {
      contactId: params.contactId,
      dealId: params.dealId,
      outcome: params.outcome,
      sourceSearch: prospect?.search?.id,
      icpCriteria: prospect?.search?.icp,
      winningAngle: prospect?.aiAnalysis
        ? (safeParseJSON<Record<string, unknown>>(prospect.aiAnalysis, {}).outreachAngle as string) || null
        : null,
      winningChannel: lastReply?.channel,
      objections: JSON.stringify(
        objections.map((o) => ({ type: o.objectionType, verbatim: o.objectionVerbatim }))
      ),
      timeToConvert,
      dealValue: params.dealValue,
      notes: params.notes,
    },
  });
}

// Analyze all conversion data and generate scoring/ICP adjustments
export async function analyzeFeedbackLoop(): Promise<FeedbackAnalysis> {
  const conversions = await prisma.conversionFeedback.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const converted = conversions.filter((c) => c.outcome === "converted");
  const lost = conversions.filter((c) => c.outcome === "lost");

  // Aggregate winning channels
  const channelCounts: Record<string, { wins: number; total: number }> = {};
  for (const c of conversions) {
    const ch = c.winningChannel || "unknown";
    if (!channelCounts[ch]) channelCounts[ch] = { wins: 0, total: 0 };
    channelCounts[ch].total++;
    if (c.outcome === "converted") channelCounts[ch].wins++;
  }

  // Aggregate winning angles
  const angleCounts: Record<string, { positive: number; total: number }> = {};
  for (const c of converted) {
    if (c.winningAngle) {
      if (!angleCounts[c.winningAngle]) angleCounts[c.winningAngle] = { positive: 0, total: 0 };
      angleCounts[c.winningAngle].positive++;
      angleCounts[c.winningAngle].total++;
    }
  }

  const input = {
    conversions: conversions.map((c) => ({
      outcome: c.outcome,
      icpCriteria: safeParseJSON(c.icpCriteria, null),
      winningAngle: c.winningAngle,
      winningChannel: c.winningChannel,
      objections: safeParseJSON(c.objections, [] as Record<string, unknown>[]),
      timeToConvert: c.timeToConvert,
      dealValue: c.dealValue,
    })),
    totalConverted: converted.length,
    totalLost: lost.length,
    channelData: Object.entries(channelCounts).map(([ch, d]) => ({
      channel: ch,
      conversionRate: d.total > 0 ? Math.round((d.wins / d.total) * 100) : 0,
      total: d.total,
    })),
    instructions: `Analyze this conversion data and provide:
1. scoringAdjustments: Which scoring dimensions should be weighted differently? (e.g., if most conversions come from specific industries, increase firmographic weight)
2. icpRefinements: How should the Ideal Customer Profile be narrowed? What criteria predict conversion?
3. topConvertingProfile: Describe the prospect profile that converts best
4. averageTimeToConvert: Average days from first touch to conversion
5. winningChannels: Which channels have the highest conversion rate?
6. winningAngles: Which outreach angles get the most positive responses?
7. summary: A plain-language paragraph explaining what's working, what's not, and what should change

Be specific. Reference actual data patterns. This feedback loop is how the system gets smarter over time.`,
  };

  const result = await runAIJob("lead_scorer", "feedback_analysis", input);
  const analysis = result.output as FeedbackAnalysis;

  // Auto-apply scoring adjustments to AI-managed rules
  for (const adj of analysis.scoringAdjustments) {
    await prisma.leadScoreRule.updateMany({
      where: {
        category: adj.dimension,
        isAIManaged: true,
      },
      data: {
        points: adj.suggestedWeight,
      },
    });
  }

  // Create insight with the analysis
  await prisma.aIInsight.create({
    data: {
      type: "scoring_adjustment",
      title: "Scoring model updated based on conversion data",
      description: analysis.summary,
      reasoning: `Analyzed ${conversions.length} conversions. Win rate: ${converted.length}/${conversions.length}. Top profile: ${analysis.topConvertingProfile}. Avg time to convert: ${analysis.averageTimeToConvert} days.`,
      priority: "medium",
      resourceType: "contact",
      resourceId: "system",
      actionItems: JSON.stringify(analysis.scoringAdjustments),
      actionsTaken: JSON.stringify(analysis.scoringAdjustments.map((a) => `${a.dimension}: ${a.currentWeight} -> ${a.suggestedWeight}`)),
      status: "auto_actioned",
    },
  });

  return analysis;
}
