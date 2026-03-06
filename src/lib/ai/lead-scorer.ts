// Lead Scorer — dual-score model
// fitScore: demographic + firmographic (NEVER decays)
// engagementScore: behavioral + recency (decays 25%/month, resets at 90 days)
// leadScore = fitScore + engagementScore (capped at 100)
//
// Scoring thresholds:
// - MQL: leadScore >= 60 (top 20% of leads)
// - SQL: BANT 3/4+ confirmed
//
// Negative scoring:
// - Personal/generic email domain: -10
// - Competitor domain: -20
// - 30+ days inactive: behavioral decay handled by score-decay.ts

import { prisma } from "@/lib/prisma";
import { runAIJob } from "./job-runner";

interface ScoreResult {
  totalScore: number;
  fitScore: number;       // 0-55 (demographic 0-30, firmographic 0-25)
  engagementScore: number; // 0-45 (behavioral 0-25, recency 0-20)
  breakdown: {
    demographic: number;
    firmographic: number;
    behavioral: number;
    recency: number;
    negative: number; // deductions
  };
  lifecycleStage: string;
  leadStatus: string;
  reasoning: string;
  nextAction: string;
}

export async function scoreContact(contactId: string): Promise<ScoreResult> {
  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    include: {
      company: true,
      activities: { orderBy: { createdAt: "desc" }, take: 20 },
      deals: true,
      emailEvents: { orderBy: { createdAt: "desc" }, take: 50 },
      formSubmissions: true,
      sequenceEnrollments: true,
    },
  });

  if (!contact) throw new Error("Contact not found");

  const emailOpens = contact.emailEvents.filter((e) => e.type === "opened").length;
  const emailClicks = contact.emailEvents.filter((e) => e.type === "clicked").length;
  const emailReplies = contact.activities.filter((a) => a.type === "email").length;
  const meetings = contact.activities.filter((a) => a.type === "meeting").length;
  const lastActivity = contact.activities[0]?.createdAt;
  const daysSinceLastActivity = lastActivity
    ? Math.floor((Date.now() - lastActivity.getTime()) / (1000 * 60 * 60 * 24))
    : 999;

  // Check for high-intent actions
  const conversationLogs = await prisma.aIConversationLog.findMany({
    where: { contactId, direction: "inbound" },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  const hasPositiveReply = conversationLogs.some((l) => l.sentiment === "positive");
  const hasMeetingRequest = conversationLogs.some((l) => l.intent === "meeting_request");

  const input = {
    contact: {
      name: `${contact.firstName} ${contact.lastName}`,
      email: contact.email,
      jobTitle: contact.jobTitle,
      currentStage: contact.lifecycleStage,
      currentStatus: contact.leadStatus,
      source: contact.source,
      bantScore: contact.bantScore,
      bantBudget: contact.bantBudget,
      bantAuthority: contact.bantAuthority,
      bantNeed: contact.bantNeed,
      bantTimeline: contact.bantTimeline,
    },
    company: contact.company
      ? {
          name: contact.company.name,
          industry: contact.company.industry,
          size: contact.company.size,
          revenue: contact.company.revenue,
        }
      : null,
    engagement: {
      emailOpens,
      emailClicks,
      emailReplies,
      meetings,
      formSubmissions: contact.formSubmissions.length,
      totalActivities: contact.activities.length,
      daysSinceLastActivity,
      activeDeals: contact.deals.length,
      sequenceEnrollments: contact.sequenceEnrollments.length,
      hasPositiveReply,
      hasMeetingRequest,
    },
    instructions: `Score this contact using the dual-score model:

FIT SCORE (0-55, persists forever):
  - DEMOGRAPHIC (0-30): Decision-maker title (Founder/CEO/Director = +25, VP = +20, Manager = +15, Individual contributor = +5). Right job function for agency services.
  - FIRMOGRAPHIC (0-25): Company size in ICP range (+15), industry match (+10), revenue match (+5).
  - NEGATIVE: Personal/generic email domain (-10), competitor domain (-20).

ENGAGEMENT SCORE (0-45, subject to decay):
  - BEHAVIORAL (0-25): Demo/consultation request (+30), pricing page 2+ visits (+20), case study download (+15), email click (+5), email open (+3).
  - RECENCY (0-20): Activity in last 7 days (+20), last 14 days (+15), last 30 days (+10), last 60 days (+5), 60+ days (+0).

Total = fitScore + engagementScore (cap at 100).

Also determine lifecycle stage based on these thresholds:
- subscriber: score 0-20
- lead: score 21-59
- mql: score 60+ OR high-intent action (meeting request, positive reply)
- sql: BANT 3/4+ confirmed
- opportunity: active deal exists
- customer/evangelist: only via deal close or explicit advancement

Return: { totalScore, fitScore, engagementScore, breakdown: { demographic, firmographic, behavioral, recency, negative }, lifecycleStage, leadStatus, reasoning, nextAction }`,
  };

  const result = await runAIJob("lead_scorer", "score_lead", input, { contactId });
  const scoreData = result.output as ScoreResult;

  // Update contact with dual scores — do NOT directly set lifecycle stage
  // (lifecycle transitions are handled by lifecycle-engine.ts with forward-only enforcement)
  await prisma.contact.update({
    where: { id: contactId },
    data: {
      leadScore: scoreData.totalScore,
      fitScore: scoreData.fitScore,
      engagementScore: scoreData.engagementScore,
      leadStatus: scoreData.leadStatus,
      scoreDirty: false,
      lastScoreEvaluated: new Date(),
    },
  });

  return scoreData;
}

// Batch score contacts that need rescoring
// Only scores contacts where: dirty flag is true OR lastScoreEvaluated > 7 days ago
// Event-driven scoring with weekly sweep as safety net, not a full table scan
export async function batchScoreContacts(): Promise<{ scored: number; errors: number }> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const contacts = await prisma.contact.findMany({
    where: {
      OR: [
        { scoreDirty: true },
        { lastScoreEvaluated: null },
        { lastScoreEvaluated: { lt: sevenDaysAgo } },
      ],
    },
    select: { id: true },
    take: 50,
  });

  let scored = 0;
  let errors = 0;

  for (const contact of contacts) {
    try {
      await scoreContact(contact.id);
      scored++;
    } catch (err) {
      console.error(`Scoring failed for contact ${contact.id}:`, err);
      errors++;
    }
  }

  return { scored, errors };
}
