// Weekly Summary Generator
// The only insights that matter:
// 1. Which outreach angle is getting the most positive replies
// 2. Which prospect profile converts fastest
// 3. Where deals are stalling and why
// 4. Pipeline projected revenue and close probability
// Plus: what Claude already adjusted in response

import { prisma } from "@/lib/prisma";
import { runAIJob } from "./job-runner";

export async function generateWeeklySummary(): Promise<string> {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Gather all data
  const [
    newContacts,
    dealsWon,
    dealsLost,
    activeDeals,
    repliesReceived,
    meetingsBooked,
    conversationLogs,
    insights,
    aiJobs,
    sequenceEnrollments,
    conversionFeedback,
  ] = await Promise.all([
    prisma.contact.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.deal.findMany({ where: { stage: "closed_won", updatedAt: { gte: weekAgo } } }),
    prisma.deal.findMany({ where: { stage: "closed_lost", updatedAt: { gte: weekAgo } } }),
    prisma.deal.findMany({
      where: { stage: { notIn: ["closed_won", "closed_lost"] } },
      include: { contact: true, activities: { orderBy: { createdAt: "desc" }, take: 1 } },
    }),
    prisma.aIConversationLog.count({ where: { direction: "inbound", createdAt: { gte: weekAgo } } }),
    prisma.meeting.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.aIConversationLog.findMany({
      where: { createdAt: { gte: weekAgo }, direction: "inbound" },
      select: { sentiment: true, intent: true, channel: true, objectionType: true },
    }),
    prisma.aIInsight.findMany({
      where: { createdAt: { gte: weekAgo }, status: "auto_actioned" },
      select: { type: true, title: true, actionsTaken: true },
    }),
    prisma.aIJob.aggregate({
      where: { createdAt: { gte: weekAgo }, status: "completed" },
      _count: true,
      _sum: { tokens: true, cost: true },
    }),
    prisma.sequenceEnrollment.findMany({
      where: { createdAt: { gte: weekAgo } },
      select: { status: true, channel: true },
    }),
    prisma.conversionFeedback.findMany({
      where: { createdAt: { gte: weekAgo } },
      select: { outcome: true, winningAngle: true, winningChannel: true, timeToConvert: true, dealValue: true },
    }),
  ]);

  // Calculate pipeline metrics
  const pipelineValue = activeDeals.reduce((sum, d) => sum + (d.amount || 0), 0);
  const projectedRevenue = activeDeals.reduce(
    (sum, d) => sum + (d.amount || 0) * ((d.probability || 50) / 100),
    0
  );

  // Find stalled deals
  const stalledDeals = activeDeals
    .filter((d) => {
      const lastActivity = d.activities[0];
      if (!lastActivity) return true;
      const days = Math.floor((Date.now() - lastActivity.createdAt.getTime()) / (1000 * 60 * 60 * 24));
      return days > 7;
    })
    .map((d) => ({
      name: d.name,
      stage: d.stage,
      amount: d.amount,
      daysSinceActivity: d.activities[0]
        ? Math.floor((Date.now() - d.activities[0].createdAt.getTime()) / (1000 * 60 * 60 * 24))
        : 999,
    }));

  // Aggregate outreach angles
  const positiveReplies = conversationLogs.filter((l) => l.sentiment === "positive");
  const replyByChannel: Record<string, number> = {};
  for (const r of positiveReplies) {
    replyByChannel[r.channel] = (replyByChannel[r.channel] || 0) + 1;
  }

  const input = {
    week: { from: weekAgo.toISOString(), to: now.toISOString() },
    metrics: {
      newContacts,
      dealsWon: dealsWon.length,
      dealsWonValue: dealsWon.reduce((s, d) => s + (d.amount || 0), 0),
      dealsLost: dealsLost.length,
      pipelineValue,
      projectedRevenue,
      repliesReceived,
      meetingsBooked,
      positiveReplies: positiveReplies.length,
      totalReplies: conversationLogs.length,
      aiJobsRun: aiJobs._count,
      aiTokensUsed: aiJobs._sum.tokens,
      aiCost: aiJobs._sum.cost,
    },
    stalledDeals,
    sentimentBreakdown: {
      positive: conversationLogs.filter((l) => l.sentiment === "positive").length,
      neutral: conversationLogs.filter((l) => l.sentiment === "neutral").length,
      negative: conversationLogs.filter((l) => l.sentiment === "negative").length,
    },
    channelPerformance: replyByChannel,
    objectionBreakdown: {
      timing: conversationLogs.filter((l) => l.objectionType === "timing").length,
      budget: conversationLogs.filter((l) => l.objectionType === "budget").length,
      authority: conversationLogs.filter((l) => l.objectionType === "authority").length,
      need: conversationLogs.filter((l) => l.objectionType === "need").length,
    },
    autoActions: insights.map((i) => ({ type: i.type, title: i.title, actions: i.actionsTaken })),
    conversionData: conversionFeedback,
    sequenceData: {
      total: sequenceEnrollments.length,
      active: sequenceEnrollments.filter((e) => e.status === "active").length,
      replied: sequenceEnrollments.filter((e) => e.status === "replied").length,
      completed: sequenceEnrollments.filter((e) => e.status === "completed").length,
    },
    instructions: `Write a weekly summary for a solo agency founder. Use plain language. Be direct. Cover exactly these 4 things:

1. OUTREACH PERFORMANCE: Which outreach angles are getting positive replies? Which channels work best? What's the reply rate?
2. CONVERSION INSIGHTS: Which prospect profile converts fastest? What's the average time to conversion? What patterns emerge?
3. PIPELINE STATUS: Where are deals stalling and why? Name specific deals. What should change?
4. REVENUE FORECAST: Pipeline value, projected revenue, close probability. Be realistic.

Then end with: "This week I adjusted..." — list every automatic action the AI took (scoring changes, sequence pauses, lifecycle transitions, channel escalations).

Keep it under 500 words. No corporate speak. Write like you're briefing yourself.`,
  };

  const result = await runAIJob("deal_advisor", "weekly_summary", input);
  const narrative = typeof result.output === "string"
    ? result.output
    : (result.output as { narrative?: string; summary?: string }).narrative
      || (result.output as { narrative?: string; summary?: string }).summary
      || JSON.stringify(result.output);

  // Save the summary
  await prisma.weeklySummary.create({
    data: {
      weekStarting: weekAgo,
      pipelineValue,
      dealsWon: dealsWon.length,
      dealsLost: dealsLost.length,
      newContacts,
      repliesReceived,
      meetingsBooked,
      stalledDeals: JSON.stringify(stalledDeals),
      projectedRevenue,
      aiAdjustments: JSON.stringify(insights.map((i) => ({ type: i.type, actions: i.actionsTaken }))),
      narrative,
    },
  });

  return narrative;
}
