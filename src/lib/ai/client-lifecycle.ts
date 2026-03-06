// Client Lifecycle Engine — the post-sale revenue pipeline
// This is where 80% of agency revenue lives: retainers, renewals, expansion, upsells.
// Stages: onboarding → active → renewal → expansion → at_risk → churned → win_back
//
// Autonomous health monitoring: every client gets a health score that degrades
// on negative signals and improves on positive ones.

import { prisma } from "@/lib/prisma";
import { advanceClientStage } from "./lifecycle-engine";

// Health score adjustment rules
const HEALTH_ADJUSTMENTS = {
  // Positive signals
  nps_9_plus: +10,
  csat_positive: +5,
  positive_ticket_resolution: +3,
  on_time_delivery: +5,
  referral_given: +15,
  scope_expansion: +10,

  // Negative signals
  negative_ticket: -8,
  missed_deadline: -10,
  scope_creep_unresolved: -5,
  no_response_14_days: -10,
  nps_below_7: -15,
  churn_mention: -25,
};

export async function processClientHealthChecks(): Promise<number> {
  let processed = 0;

  const clients = await prisma.clientLifecycle.findMany({
    where: {
      stage: { notIn: ["churned"] },
      OR: [
        { lastHealthCheck: null },
        { lastHealthCheck: { lte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } }, // weekly
      ],
    },
    include: { contact: true },
    take: 50,
  });

  for (const cl of clients) {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    let healthDelta = 0;

    // Check recent tickets
    const recentTickets = await prisma.ticket.findMany({
      where: { contactId: cl.contactId, createdAt: { gte: sevenDaysAgo } },
    });

    const negativeTickets = recentTickets.filter((t) => t.sentiment === "negative").length;
    const positiveResolutions = recentTickets.filter(
      (t) => t.status === "closed" && t.sentiment === "positive"
    ).length;

    healthDelta += negativeTickets * HEALTH_ADJUSTMENTS.negative_ticket;
    healthDelta += positiveResolutions * HEALTH_ADJUSTMENTS.positive_ticket_resolution;

    // Check scope creep
    const scopeCreepTickets = recentTickets.filter((t) => t.scopeCreep).length;
    healthDelta += scopeCreepTickets * HEALTH_ADJUSTMENTS.scope_creep_unresolved;

    // Check recent NPS/CSAT
    const recentSurvey = await prisma.feedbackSurvey.findFirst({
      where: { contactId: cl.contactId, createdAt: { gte: sevenDaysAgo } },
      orderBy: { createdAt: "desc" },
    });
    if (recentSurvey) {
      if (recentSurvey.type === "nps") {
        if (recentSurvey.score >= 9) healthDelta += HEALTH_ADJUSTMENTS.nps_9_plus;
        else if (recentSurvey.score < 7) healthDelta += HEALTH_ADJUSTMENTS.nps_below_7;
      }
      if (recentSurvey.type === "csat" && recentSurvey.score >= 4) {
        healthDelta += HEALTH_ADJUSTMENTS.csat_positive;
      }
    }

    // Check activity recency
    const lastActivity = await prisma.activity.findFirst({
      where: { contactId: cl.contactId },
      orderBy: { createdAt: "desc" },
    });
    if (lastActivity) {
      const daysSince = Math.floor(
        (Date.now() - lastActivity.createdAt.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysSince > 14) healthDelta += HEALTH_ADJUSTMENTS.no_response_14_days;
    }

    // Apply health delta (clamp 0-100)
    const newHealth = Math.max(0, Math.min(100, cl.healthScore + healthDelta));

    // Determine churn risk level
    let churnRiskLevel = "low";
    if (newHealth < 30) churnRiskLevel = "critical";
    else if (newHealth < 50) churnRiskLevel = "high";
    else if (newHealth < 70) churnRiskLevel = "medium";

    await prisma.clientLifecycle.update({
      where: { id: cl.id },
      data: {
        healthScore: newHealth,
        churnRiskLevel,
        lastHealthCheck: new Date(),
        ticketCount: recentTickets.length + cl.ticketCount,
        avgTicketSentiment: negativeTickets > positiveResolutions ? "negative" : positiveResolutions > negativeTickets ? "positive" : "neutral",
        lastActivityAt: lastActivity?.createdAt,
        scopeCreepCount: cl.scopeCreepCount + scopeCreepTickets,
      },
    });

    // Auto-stage transitions based on health
    if (churnRiskLevel === "critical" && cl.stage !== "at_risk" && cl.stage !== "churned") {
      await advanceClientStage(cl.id, "at_risk", "ai_auto", `Health score dropped to ${newHealth}`);
    }

    // Onboarding → Active: after 30 days if health > 60
    if (cl.stage === "onboarding") {
      const daysSinceOnboarding = cl.stageEnteredAt
        ? Math.floor((Date.now() - cl.stageEnteredAt.getTime()) / (1000 * 60 * 60 * 24))
        : 0;
      if (daysSinceOnboarding >= 30 && newHealth >= 60) {
        await advanceClientStage(cl.id, "active", "ai_auto", "30 days post-onboarding, health score stable");
      }
    }

    processed++;
  }

  return processed;
}

// Process contract renewals: move to renewal stage 60 days before expiry
export async function processRenewals(): Promise<number> {
  const sixtyDaysFromNow = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
  let processed = 0;

  const upForRenewal = await prisma.clientLifecycle.findMany({
    where: {
      renewalDate: { lte: sixtyDaysFromNow, gte: new Date() },
      stage: "active",
    },
  });

  for (const cl of upForRenewal) {
    await advanceClientStage(cl.id, "renewal", "ai_auto", "60 days before contract renewal");
    processed++;
  }

  return processed;
}

// Mark churned clients and prepare win-back tracking
export async function processChurns(): Promise<number> {
  let processed = 0;

  // Contracts that have expired without renewal
  const expired = await prisma.clientLifecycle.findMany({
    where: {
      contractEndDate: { lte: new Date() },
      stage: { in: ["renewal", "at_risk"] },
    },
  });

  for (const cl of expired) {
    await advanceClientStage(cl.id, "churned", "ai_auto", "Contract expired without renewal");
    processed++;
  }

  return processed;
}
