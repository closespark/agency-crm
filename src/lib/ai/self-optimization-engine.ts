// Self-Optimization Engine — the ice cream cone
// Every part of the system feeds every other part.
// Every close, loss, and churn rewrites the machine that produced it.
//
// Weekly Sunday audit: ICP → Scoring → Sequences → Gates → BANT → Client Health
// Event-driven: deal close → conversion recording → ICP update
//
// This file contains:
// 1. ICP self-rewriting from close/loss/churn data
// 2. Sequence performance tracking + auto-rewrite
// 3. Score weight self-calibration
// 4. StageGate threshold drift from true positive rates
// 5. Send time optimization
// 6. Weekly self-audit orchestrator
// 7. System changelog

import { prisma } from "@/lib/prisma";
import { runAIJob } from "./job-runner";
import { OPTIMIZATION_THRESHOLDS } from "./optimization-thresholds";
import { safeParseJSON } from "@/lib/safe-json";

// ============================================
// 1. CONVERSION RECORDING — fires on every deal close
// ============================================

export async function recordDealOutcome(
  dealId: string,
  outcome: "converted" | "lost"
): Promise<void> {
  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    include: {
      contact: {
        include: { company: true },
      },
    },
  });
  if (!deal || !deal.contact) return;

  const contact = deal.contact;
  const company = contact.company;

  // Find the prospect search that originated this contact
  const prospect = await prisma.prospect.findFirst({
    where: { contactId: contact.id },
    include: { search: true },
  });

  // Find which sequence/step produced the first positive reply
  const firstPositiveReply = await prisma.aIConversationLog.findFirst({
    where: { contactId: contact.id, direction: "inbound", sentiment: "positive" },
    orderBy: { createdAt: "asc" },
  });

  // Find the enrollment that was active at time of first reply
  const enrollment = firstPositiveReply
    ? await prisma.sequenceEnrollment.findFirst({
        where: {
          contactId: contact.id,
          createdAt: { lte: firstPositiveReply.createdAt },
        },
        orderBy: { createdAt: "desc" },
      })
    : null;

  // Calculate timing
  const firstTouch = await prisma.activity.findFirst({
    where: { contactId: contact.id },
    orderBy: { createdAt: "asc" },
  });

  const firstOutbound = await prisma.aIConversationLog.findFirst({
    where: { contactId: contact.id, direction: "outbound" },
    orderBy: { createdAt: "asc" },
  });

  const firstReply = await prisma.aIConversationLog.findFirst({
    where: { contactId: contact.id, direction: "inbound" },
    orderBy: { createdAt: "asc" },
  });

  // Collect objections encountered during this deal
  const objections = await prisma.aIConversationLog.findMany({
    where: { contactId: contact.id, objectionType: { not: null } },
  });

  // Collect signals that were present at first contact
  const signalWatches = await prisma.signalWatch.findMany({
    where: {
      OR: [
        { contactId: contact.id },
        ...(company ? [{ companyId: company.id }] : []),
      ],
      status: "triggered",
      triggeredAt: { lte: firstTouch?.createdAt || new Date() },
    },
  });

  await prisma.conversionFeedback.create({
    data: {
      contactId: contact.id,
      dealId,
      outcome,
      sourceSearch: prospect?.search?.id,
      icpCriteria: prospect?.search?.icp,
      winningAngle: prospect?.aiAnalysis
        ? (safeParseJSON<Record<string, unknown>>(prospect.aiAnalysis, {}).outreachAngle as string) || null
        : null,
      winningChannel: firstPositiveReply?.channel,
      winningSequenceId: enrollment?.sequenceId,
      winningStepNumber: enrollment?.currentStep,
      companyIndustry: company?.industry,
      companySize: company?.size,
      companyRevenue: company?.revenue,
      jobTitle: contact.jobTitle,
      geography: company?.country,
      fitScoreAtConversion: contact.fitScore,
      engagementScoreAtConversion: contact.engagementScore,
      bantScoreAtConversion: contact.bantScore,
      signalsAtFirstContact: signalWatches.length > 0
        ? JSON.stringify(signalWatches.map((w) => ({ type: w.type, data: w.triggerData })))
        : null,
      objections: objections.length > 0
        ? JSON.stringify(objections.map((o) => ({ type: o.objectionType, verbatim: o.objectionVerbatim })))
        : null,
      lostReason: outcome === "lost" ? deal.lostReason : null,
      lostToCompetitor: outcome === "lost" ? deal.lostToCompetitor : null,
      timeToConvert: firstTouch
        ? Math.floor((Date.now() - firstTouch.createdAt.getTime()) / (1000 * 60 * 60 * 24))
        : null,
      timeToFirstReply:
        firstOutbound && firstReply
          ? Math.floor((firstReply.createdAt.getTime() - firstOutbound.createdAt.getTime()) / (1000 * 60 * 60 * 24))
          : null,
      dealValue: deal.actualAmount || deal.amount,
    },
  });

  // Store objections in the objection library
  for (const obj of objections) {
    await prisma.objectionEntry.create({
      data: {
        type: obj.objectionType || "unknown",
        severity: "soft",
        verbatim: obj.objectionVerbatim || "",
        contactId: contact.id,
        dealId,
        dealOutcome: outcome === "converted" ? "won" : "lost",
      },
    });
  }
}

// Record churn outcome (feeds anti-ICP)
export async function recordChurnOutcome(
  clientLifecycleId: string
): Promise<void> {
  const cl = await prisma.clientLifecycle.findUnique({
    where: { id: clientLifecycleId },
  });
  if (!cl) return;

  const contact = await prisma.contact.findUnique({
    where: { id: cl.contactId },
    include: { company: true },
  });

  await prisma.conversionFeedback.create({
    data: {
      contactId: cl.contactId,
      dealId: cl.dealId,
      outcome: "churned",
      companyIndustry: contact?.company?.industry,
      companySize: contact?.company?.size,
      companyRevenue: contact?.company?.revenue,
      jobTitle: contact?.jobTitle,
      geography: contact?.company?.country,
      dealValue: cl.contractValue,
    },
  });
}

// ============================================
// 2. ICP SELF-REWRITING
// ============================================

export async function rewriteICP(): Promise<string> {
  // Pull all conversion data from last 90 days
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const conversions = await prisma.conversionFeedback.findMany({
    where: { createdAt: { gte: ninetyDaysAgo } },
  });

  const won = conversions.filter((c) => c.outcome === "converted");
  const lost = conversions.filter((c) => c.outcome === "lost");
  const churned = conversions.filter((c) => c.outcome === "churned");

  if (won.length + lost.length < OPTIMIZATION_THRESHOLDS.ICP_REWEIGHT_MIN_DEALS) {
    return `Insufficient data — accumulated ${won.length + lost.length} closed deals, need ${OPTIMIZATION_THRESHOLDS.ICP_REWEIGHT_MIN_DEALS}. Data logged, not acted on.`;
  }

  // Get current ICP
  const currentICP = await prisma.iCPProfile.findFirst({
    where: { isActive: true },
    orderBy: { version: "desc" },
  });

  const result = await runAIJob("lead_scorer", "icp_rewrite", {
    currentICP: currentICP ? {
      industries: safeParseJSON(currentICP.industries, null),
      companySizes: safeParseJSON(currentICP.companySizes, null),
      jobTitles: safeParseJSON(currentICP.jobTitles, null),
      growthSignals: safeParseJSON(currentICP.growthSignals, null),
    } : null,
    wonDeals: won.map((w) => ({
      industry: w.companyIndustry, size: w.companySize, revenue: w.companyRevenue,
      jobTitle: w.jobTitle, geography: w.geography,
      signals: safeParseJSON(w.signalsAtFirstContact, [] as Record<string, unknown>[]),
      dealValue: w.dealValue, timeToConvert: w.timeToConvert,
      winningChannel: w.winningChannel, winningAngle: w.winningAngle,
      fitScore: w.fitScoreAtConversion, bantScore: w.bantScoreAtConversion,
    })),
    lostDeals: lost.map((l) => ({
      industry: l.companyIndustry, size: l.companySize, revenue: l.companyRevenue,
      jobTitle: l.jobTitle, geography: l.geography,
      lostReason: l.lostReason, lostToCompetitor: l.lostToCompetitor,
      fitScore: l.fitScoreAtConversion, bantScore: l.bantScoreAtConversion,
    })),
    churnedClients: churned.map((c) => ({
      industry: c.companyIndustry, size: c.companySize, revenue: c.companyRevenue,
      jobTitle: c.jobTitle, dealValue: c.dealValue,
    })),
    instructions: `Rewrite the Ideal Customer Profile based on actual close/loss/churn data.

For each criterion, assign a weight -100 to +100:
- Positive weight = correlated with won deals
- Negative weight = correlated with lost deals or churn
- Zero = no signal

Return JSON:
{
  industries: [{ name, weight, evidence }],
  companySizes: [{ range, weight, evidence }],
  jobTitles: [{ title, weight, evidence }],
  geographies: [{ region, weight, evidence }],
  growthSignals: [{ signal, weight, evidence }],
  seniorityLevels: [{ level, weight, evidence }],
  excludeIndustries: [{ name, reason }],
  churnFingerprint: { description, signals: [] },
  expansionFingerprint: { description, signals: [] },
  topConvertingProfile: "description of ideal prospect",
  apolloSearchParams: { seniority_levels, job_titles, industries, employee_count_ranges, revenue_ranges },
  changes: [{ what, from, to, reason }]
}`,
  });

  const icp = result.output as Record<string, unknown>;

  // Deactivate old ICP
  if (currentICP) {
    await prisma.iCPProfile.update({
      where: { id: currentICP.id },
      data: { isActive: false },
    });
  }

  // Create new version
  await prisma.iCPProfile.create({
    data: {
      version: (currentICP?.version || 0) + 1,
      isActive: true,
      industries: JSON.stringify(icp.industries),
      companySizes: JSON.stringify(icp.companySizes),
      jobTitles: JSON.stringify(icp.jobTitles),
      geographies: JSON.stringify(icp.geographies),
      growthSignals: JSON.stringify(icp.growthSignals),
      seniorityLevels: JSON.stringify(icp.seniorityLevels),
      excludeIndustries: JSON.stringify(icp.excludeIndustries),
      churnFingerprint: JSON.stringify(icp.churnFingerprint),
      expansionFingerprint: JSON.stringify(icp.expansionFingerprint),
      topConvertingProfile: icp.topConvertingProfile as string,
      apolloSearchParams: JSON.stringify(icp.apolloSearchParams),
      totalDealsAnalyzed: conversions.length,
      winRate: won.length / Math.max(won.length + lost.length, 1),
      avgDealSize: won.length > 0
        ? won.reduce((sum, w) => sum + (w.dealValue || 0), 0) / won.length
        : null,
      avgTimeToClose: won.length > 0
        ? Math.round(won.reduce((sum, w) => sum + (w.timeToConvert || 0), 0) / won.length)
        : null,
    },
  });

  // Log changes to changelog
  const changes = (icp.changes as { what: string; from: string; to: string; reason: string }[]) || [];
  for (const change of changes) {
    await prisma.systemChangelog.create({
      data: {
        category: "icp",
        changeType: "icp_updated",
        description: `${change.what}: ${change.from} → ${change.to}`,
        previousValue: JSON.stringify({ value: change.from }),
        newValue: JSON.stringify({ value: change.to }),
        dataEvidence: change.reason,
        weekNumber: getISOWeekNumber(new Date()),
      },
    });
  }

  return `ICP v${(currentICP?.version || 0) + 1} generated from ${conversions.length} outcomes (${won.length} won, ${lost.length} lost, ${churned.length} churned). ${changes.length} changes logged.`;
}

// ============================================
// 3. SEQUENCE PERFORMANCE + AUTO-REWRITE
// ============================================

export async function trackSequencePerformance(): Promise<void> {
  const activeSequences = await prisma.sequence.findMany({
    where: { isActive: true },
    include: {
      enrollments: {
        include: { contact: true },
      },
    },
  });

  const periodStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const periodEnd = new Date();

  for (const seq of activeSequences) {
    const steps = safeParseJSON(seq.steps, [] as Array<{
      stepNumber: number;
      channel: string;
      subject?: string;
      body: string;
    }>);

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];

      // Count enrollments that reached this step in the period
      const reachedStep = seq.enrollments.filter(
        (e) => e.currentStep > i || e.status === "completed"
      );

      // Count outbound logs for this step
      const outboundLogs = await prisma.aIConversationLog.findMany({
        where: {
          contactId: { in: reachedStep.map((e) => e.contactId) },
          direction: "outbound",
          aiSummary: { contains: `step ${i + 1}` },
          createdAt: { gte: periodStart },
        },
      });

      // Count replies after this step
      const contactsAtStep = reachedStep.map((e) => e.contactId);
      const replies = await prisma.aIConversationLog.findMany({
        where: {
          contactId: { in: contactsAtStep },
          direction: "inbound",
          createdAt: { gte: periodStart },
        },
      });

      const positiveReplies = replies.filter((r) => r.sentiment === "positive");
      const negativeReplies = replies.filter((r) => r.sentiment === "negative");
      const sent = outboundLogs.length || reachedStep.length;

      // Track email events for this step
      const opens = await prisma.emailEvent.count({
        where: {
          contactId: { in: contactsAtStep },
          type: "opened",
          createdAt: { gte: periodStart },
        },
      });

      await prisma.sequencePerformance.upsert({
        where: {
          sequenceId_stepNumber_periodStart: {
            sequenceId: seq.id,
            stepNumber: i,
            periodStart,
          },
        },
        create: {
          sequenceId: seq.id,
          stepNumber: i,
          channel: step.channel || "email",
          sent,
          opened: opens,
          replied: replies.length,
          positiveReplied: positiveReplies.length,
          negativeReplied: negativeReplies.length,
          openRate: sent > 0 ? opens / sent : null,
          replyRate: sent > 0 ? replies.length / sent : null,
          positiveReplyRate: sent > 0 ? positiveReplies.length / sent : null,
          subjectLine: step.subject,
          messageAngle: (step.body || (step as Record<string, unknown>).angle as string || "").substring(0, 200),
          periodStart,
          periodEnd,
        },
        update: {
          sent,
          opened: opens,
          replied: replies.length,
          positiveReplied: positiveReplies.length,
          negativeReplied: negativeReplies.length,
          openRate: sent > 0 ? opens / sent : null,
          replyRate: sent > 0 ? replies.length / sent : null,
          positiveReplyRate: sent > 0 ? positiveReplies.length / sent : null,
        },
      });
    }
  }
}

export async function rewriteUnderperformingSteps(): Promise<number> {
  // Find the worst-performing step in each active sequence
  const sequences = await prisma.sequence.findMany({
    where: { isActive: true },
  });

  let rewrites = 0;

  for (const seq of sequences) {
    const steps = safeParseJSON(seq.steps, [] as Array<{
      stepNumber: number;
      channel: string;
      subject?: string;
      body: string;
      delayDays: number;
    }>);

    if (steps.length < 2) continue;

    // Get performance for all steps (minimum sample threshold)
    const perf = await prisma.sequencePerformance.findMany({
      where: { sequenceId: seq.id, sent: { gte: OPTIMIZATION_THRESHOLDS.SEQUENCE_REWRITE_MIN_SENDS } },
      orderBy: { periodStart: "desc" },
    });

    if (perf.length === 0) continue;

    // Find the worst step by positive reply rate
    const stepPerf: Record<number, { totalSent: number; totalPositive: number }> = {};
    for (const p of perf) {
      if (!stepPerf[p.stepNumber]) stepPerf[p.stepNumber] = { totalSent: 0, totalPositive: 0 };
      stepPerf[p.stepNumber].totalSent += p.sent;
      stepPerf[p.stepNumber].totalPositive += p.positiveReplied;
    }

    let worstStep = -1;
    let worstRate = Infinity;
    let bestAngle = "";

    for (const [stepNum, data] of Object.entries(stepPerf)) {
      const rate = data.totalSent > 0 ? data.totalPositive / data.totalSent : 0;
      if (rate < worstRate) {
        worstRate = rate;
        worstStep = parseInt(stepNum);
      }
    }

    // Find the best-performing angle across ALL sequences for this ICP
    const bestPerf = await prisma.sequencePerformance.findFirst({
      where: { sent: { gte: 10 }, positiveReplyRate: { not: null } },
      orderBy: { positiveReplyRate: "desc" },
    });
    if (bestPerf?.messageAngle) bestAngle = bestPerf.messageAngle;

    if (worstStep === -1 || worstStep >= steps.length) continue;

    const currentStep = steps[worstStep];

    // AI rewrites the underperforming step
    const result = await runAIJob("email_composer", "sequence_rewrite", {
      currentStep: {
        subject: currentStep.subject,
        body: currentStep.body,
        channel: currentStep.channel,
        stepNumber: worstStep + 1,
        totalSteps: steps.length,
      },
      performance: {
        sent: stepPerf[worstStep]?.totalSent || 0,
        positiveReplies: stepPerf[worstStep]?.totalPositive || 0,
        positiveReplyRate: worstRate,
      },
      bestPerformingAngle: bestAngle,
      sequenceName: seq.name,
      instructions: `This is step ${worstStep + 1} of ${steps.length} in the "${seq.name}" sequence.
Its positive reply rate is ${(worstRate * 100).toFixed(1)}%. That's the worst in the sequence.

The best-performing angle across all sequences is: "${bestAngle}"

Rewrite this step to improve the positive reply rate. Keep the same channel (${currentStep.channel}).
Match the tone and length of the best-performing angle.
Do NOT change the delay timing.

Return JSON: { subject: string, body: string, reasoning: string }`,
    });

    const rewrite = result.output as { subject: string; body: string; reasoning: string };

    // Apply the rewrite
    const previousBody = steps[worstStep].body || (steps[worstStep] as Record<string, unknown>).angle as string || "";
    const previousSubject = steps[worstStep].subject;
    steps[worstStep].body = rewrite.body;
    if (rewrite.subject) steps[worstStep].subject = rewrite.subject;

    await prisma.sequence.update({
      where: { id: seq.id },
      data: { steps: JSON.stringify(steps) },
    });

    // Log to changelog
    await prisma.systemChangelog.create({
      data: {
        category: "sequence",
        changeType: "step_rewritten",
        description: `${seq.name} step ${worstStep + 1} rewritten — positive reply rate was ${(worstRate * 100).toFixed(1)}%`,
        previousValue: JSON.stringify({ subject: previousSubject, body: previousBody.substring(0, 500) }),
        newValue: JSON.stringify({ subject: rewrite.subject, body: (rewrite.body || "").substring(0, 500) }),
        dataEvidence: rewrite.reasoning,
        weekNumber: getISOWeekNumber(new Date()),
      },
    });

    rewrites++;
  }

  return rewrites;
}

// ============================================
// 4. SCORE WEIGHT SELF-CALIBRATION
// ============================================

export async function calibrateScoreWeights(): Promise<number> {
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  const conversions = await prisma.conversionFeedback.findMany({
    where: { createdAt: { gte: ninetyDaysAgo } },
  });

  const won = conversions.filter((c) => c.outcome === "converted");
  const lost = conversions.filter((c) => c.outcome === "lost");

  if (won.length + lost.length < OPTIMIZATION_THRESHOLDS.SCORE_REWEIGHT_MIN_DEALS) return 0;

  // Get current scoring rules
  const rules = await prisma.leadScoreRule.findMany({ where: { isActive: true } });

  const result = await runAIJob("lead_scorer", "calibrate_weights", {
    currentRules: rules.map((r) => ({
      id: r.id, name: r.name, category: r.category,
      condition: r.condition, points: r.points, isAIManaged: r.isAIManaged,
    })),
    wonProfiles: won.map((w) => ({
      fitScore: w.fitScoreAtConversion, engagementScore: w.engagementScoreAtConversion,
      bantScore: w.bantScoreAtConversion, industry: w.companyIndustry,
      size: w.companySize, jobTitle: w.jobTitle, dealValue: w.dealValue,
      timeToConvert: w.timeToConvert, signals: w.signalsAtFirstContact,
    })),
    lostProfiles: lost.map((l) => ({
      fitScore: l.fitScoreAtConversion, engagementScore: l.engagementScoreAtConversion,
      bantScore: l.bantScoreAtConversion, industry: l.companyIndustry,
      size: l.companySize, jobTitle: l.jobTitle, lostReason: l.lostReason,
    })),
    instructions: `Recalibrate scoring weights based on actual outcomes.

Compare fitScore and engagementScore distributions at SQL stage between won and lost deals.
Identify which specific signals were present in won deals and absent/weaker in lost deals.

For each rule that should change, return:
{ ruleId, currentPoints, newPoints, reason }

Also check if the decay rate needs adjustment:
- If 30-day old signals are still predicting closes, slow the decay
- If they're not, steepen it

Return JSON: {
  adjustments: [{ ruleId, currentPoints, newPoints, reason }],
  newRules: [{ name, category, condition, points, reason }],
  decayAdjustment: { currentRate: 0.25, suggestedRate: number, reason },
  summary: "what changed and why"
}`,
  });

  const calibration = result.output as {
    adjustments: { ruleId: string; currentPoints: number; newPoints: number; reason: string }[];
    newRules: { name: string; category: string; condition: string; points: number; reason: string }[];
    decayAdjustment: { currentRate: number; suggestedRate: number; reason: string };
    summary: string;
  };

  let changes = 0;

  // Apply weight adjustments
  for (const adj of calibration.adjustments) {
    await prisma.leadScoreRule.update({
      where: { id: adj.ruleId },
      data: { points: adj.newPoints },
    });

    await prisma.systemChangelog.create({
      data: {
        category: "scoring",
        changeType: "weight_adjusted",
        description: `Score rule adjusted: ${adj.currentPoints} → ${adj.newPoints} points`,
        previousValue: JSON.stringify({ points: adj.currentPoints }),
        newValue: JSON.stringify({ points: adj.newPoints }),
        dataEvidence: adj.reason,
        weekNumber: getISOWeekNumber(new Date()),
      },
    });

    changes++;
  }

  // Create new AI-managed rules
  for (const rule of calibration.newRules) {
    await prisma.leadScoreRule.create({
      data: {
        name: rule.name,
        category: rule.category,
        condition: rule.condition,
        points: rule.points,
        isAIManaged: true,
      },
    });

    await prisma.systemChangelog.create({
      data: {
        category: "scoring",
        changeType: "weight_adjusted",
        description: `New scoring rule: "${rule.name}" (${rule.points} pts)`,
        newValue: JSON.stringify(rule),
        dataEvidence: rule.reason,
        weekNumber: getISOWeekNumber(new Date()),
      },
    });

    changes++;
  }

  return changes;
}

// ============================================
// 5. STAGEGATE THRESHOLD DRIFT
// ============================================

export async function calibrateStageGates(): Promise<number> {
  const gates = await prisma.stageGate.findMany({
    where: { isActive: true, confidenceThreshold: { not: null } },
  });

  const weekNumber = getISOWeekNumber(new Date());
  const year = new Date().getFullYear();
  let adjusted = 0;

  for (const gate of gates) {
    // Find transitions through this gate in the LAST WEEK only (for this week's record)
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const transitions = await prisma.lifecycleTransition.findMany({
      where: {
        objectType: gate.objectType,
        fromStage: gate.fromStage,
        toStage: gate.toStage,
        createdAt: { gte: weekAgo },
      },
    });

    // Evaluate outcomes for transitions old enough to have results (from 2+ weeks ago)
    const olderTransitions = await prisma.lifecycleTransition.findMany({
      where: {
        objectType: gate.objectType,
        fromStage: gate.fromStage,
        toStage: gate.toStage,
        createdAt: {
          gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
          lt: weekAgo,
        },
      },
    });

    let truePositives = 0;
    let falsePositives = 0;
    let inconclusive = 0;

    for (const t of olderTransitions) {
      const nextTransition = await prisma.lifecycleTransition.findFirst({
        where: {
          objectType: t.objectType,
          objectId: t.objectId,
          fromStage: t.toStage,
          createdAt: { gt: t.createdAt },
        },
      });

      if (gate.objectType === "deal") {
        const deal = await prisma.deal.findUnique({ where: { id: t.objectId } });
        if (deal?.stage === "closed_won" || nextTransition) truePositives++;
        else if (deal?.stage === "closed_lost") falsePositives++;
        else inconclusive++;
      } else {
        if (nextTransition) truePositives++;
        else {
          const daysSince = Math.floor((Date.now() - t.createdAt.getTime()) / (1000 * 60 * 60 * 24));
          if (daysSince > 30) falsePositives++;
          else inconclusive++;
        }
      }
    }

    // Write immutable per-gate per-week accuracy record
    // Historical weeks are NEVER updated — only the current week can be refreshed
    const total = truePositives + falsePositives;
    const currentWeekNumber = getISOWeekNumber(new Date());
    const currentYear = new Date().getFullYear();
    const existing = await prisma.stageGateAccuracy.findUnique({
      where: {
        stageGateId_weekNumber_year: { stageGateId: gate.id, weekNumber, year },
      },
    });

    if (!existing) {
      await prisma.stageGateAccuracy.create({
        data: {
          stageGateId: gate.id,
          objectType: gate.objectType,
          fromStage: gate.fromStage,
          toStage: gate.toStage,
          weekNumber,
          year,
          totalTransitions: transitions.length + olderTransitions.length,
          truePositives,
          falsePositives,
          inconclusive,
          accuracy: total > 0 ? truePositives / total : null,
          confidenceThresholdAtTime: gate.confidenceThreshold,
        },
      });
    } else if (weekNumber === currentWeekNumber && year === currentYear) {
      // Only update if this is the CURRENT week — historical records are immutable
      await prisma.stageGateAccuracy.update({
        where: {
          stageGateId_weekNumber_year: { stageGateId: gate.id, weekNumber, year },
        },
        data: {
          totalTransitions: transitions.length + olderTransitions.length,
          truePositives,
          falsePositives,
          inconclusive,
          accuracy: total > 0 ? truePositives / total : null,
        },
      });
    }
    // else: historical record exists — do not overwrite (immutability enforced)
    else {
      console.warn(
        `[StageGateAccuracy] Record already exists for gate=${gate.id} week=${weekNumber} year=${year}. ` +
        `Skipping update — possible clock/timezone issue if this is unexpected.`
      );
    }

    // Only drift threshold if we have enough total decisions
    const allTimeAccuracy = await prisma.stageGateAccuracy.findMany({
      where: { stageGateId: gate.id },
      orderBy: { createdAt: "desc" },
      take: 12, // last 12 weeks
    });

    const totalDecisions = allTimeAccuracy.reduce((sum, a) => sum + a.truePositives + a.falsePositives, 0);
    if (totalDecisions < OPTIMIZATION_THRESHOLDS.STAGE_GATE_DRIFT_MIN_DECISIONS) continue;

    // Calculate recent accuracy (last 4 weeks, not all-time average)
    const recentWeeks = allTimeAccuracy.slice(0, 4);
    const recentTP = recentWeeks.reduce((sum, a) => sum + a.truePositives, 0);
    const recentFP = recentWeeks.reduce((sum, a) => sum + a.falsePositives, 0);
    const recentTotal = recentTP + recentFP;
    if (recentTotal < 5) continue;

    const recentAccuracy = recentTP / recentTotal;
    const currentThreshold = gate.confidenceThreshold || 0.7;

    let newThreshold = currentThreshold;
    if (recentAccuracy < 0.6) {
      newThreshold = Math.min(0.95, currentThreshold + 0.05);
    } else if (recentAccuracy > 0.85) {
      newThreshold = Math.max(0.5, currentThreshold - 0.03);
    }

    if (Math.abs(newThreshold - currentThreshold) > 0.01) {
      await prisma.stageGate.update({
        where: { id: gate.id },
        data: { confidenceThreshold: newThreshold },
      });

      await prisma.systemChangelog.create({
        data: {
          category: "stage_gate",
          changeType: "threshold_changed",
          description: `${gate.objectType} gate ${gate.fromStage}→${gate.toStage}: threshold ${(currentThreshold * 100).toFixed(0)}% → ${(newThreshold * 100).toFixed(0)}%`,
          previousValue: JSON.stringify({ threshold: currentThreshold }),
          newValue: JSON.stringify({ threshold: newThreshold }),
          dataEvidence: `Recent 4-week accuracy: ${(recentAccuracy * 100).toFixed(0)}% (${recentTP} TP, ${recentFP} FP). Total decisions: ${totalDecisions}.`,
          weekNumber,
        },
      });

      adjusted++;
    }
  }

  return adjusted;
}

// ============================================
// 6. SEND TIME OPTIMIZATION
// ============================================

export async function optimizeSendTimes(): Promise<void> {
  // Analyze reply rates by day of week, hour, and prospect profile
  const replies = await prisma.aIConversationLog.findMany({
    where: {
      direction: "inbound",
      sentiment: { in: ["positive", "neutral"] },
      createdAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
      contactId: { not: null },
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  if (replies.length < OPTIMIZATION_THRESHOLDS.SEND_TIME_MIN_REPLIES) return;

  // Build time distribution
  const timeBuckets: Record<string, { replies: number; positive: number }> = {};

  for (const reply of replies) {
    const day = reply.createdAt.getDay(); // 0=Sun, 6=Sat
    const hour = reply.createdAt.getHours();
    const key = `${day}_${hour}`;
    if (!timeBuckets[key]) timeBuckets[key] = { replies: 0, positive: 0 };
    timeBuckets[key].replies++;
    if (reply.sentiment === "positive") timeBuckets[key].positive++;
  }

  // Find optimal send windows (sort by positive reply count)
  const ranked = Object.entries(timeBuckets)
    .map(([key, data]) => {
      const [day, hour] = key.split("_").map(Number);
      return { day, hour, ...data };
    })
    .sort((a, b) => b.positive - a.positive);

  const topWindows = ranked.slice(0, 10);

  await prisma.systemChangelog.create({
    data: {
      category: "send_timing",
      changeType: "weight_adjusted",
      description: `Send time optimization updated. Top windows: ${topWindows.slice(0, 3).map((w) => `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][w.day]} ${w.hour}:00`).join(", ")}`,
      newValue: JSON.stringify(topWindows),
      dataEvidence: `Analyzed ${replies.length} replies from last 90 days`,
      weekNumber: getISOWeekNumber(new Date()),
    },
  });
}

// ============================================
// 7. WEEKLY SELF-AUDIT — Sunday orchestrator
// ============================================

// The dependency chain is: outcomes → fingerprints → ICP → scoring → gates → outreach
// Each step feeds the next. Order is inviolable.
export async function runWeeklySelfAudit(pausedDomains: string[] = []): Promise<string> {
  const weekNumber = getISOWeekNumber(new Date());
  const auditResults: string[] = [];

  const isPaused = (domain: string) => pausedDomains.includes(domain);

  if (pausedDomains.length > 0) {
    auditResults.push(`Paused domains: ${pausedDomains.join(", ")}`);
  }

  // Step 1. OUTCOMES: Already recorded event-driven on deal close/churn.
  // Just verify we have data.
  const recentOutcomes = await prisma.conversionFeedback.count({
    where: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
  });
  auditResults.push(`Outcomes: ${recentOutcomes} recorded this week`);

  // Step 2. ICP: Rewrite from accumulated outcomes (includes churn fingerprint)
  if (isPaused("icp_optimization")) {
    auditResults.push(`ICP: SKIPPED (domain paused by QA audit)`);
  } else {
    try {
      const icpResult = await rewriteICP();
      auditResults.push(`ICP: ${icpResult}`);
    } catch (err) {
      auditResults.push(`ICP: Error — ${err}`);
    }
  }

  // Step 3. SCORING: Recalibrate weights BEFORE next batchScore
  if (isPaused("scoring")) {
    auditResults.push(`Scoring: SKIPPED (domain paused by QA audit)`);
  } else {
    try {
      const scoreChanges = await calibrateScoreWeights();
      auditResults.push(`Scoring: ${scoreChanges} weight adjustments`);
    } catch (err) {
      auditResults.push(`Scoring: Error — ${err}`);
    }
  }

  // Step 4. GATES: Adjust confidence thresholds BEFORE any auto-advance
  if (isPaused("stage_gates")) {
    auditResults.push(`Stage gates: SKIPPED (domain paused by QA audit)`);
  } else {
    try {
      const gateChanges = await calibrateStageGates();
      auditResults.push(`Stage gates: ${gateChanges} thresholds adjusted`);
    } catch (err) {
      auditResults.push(`Stage gates: Error — ${err}`);
    }
  }

  // Step 5. OUTREACH: Track performance and rewrite underperformers
  try {
    await trackSequencePerformance();
    const rewrites = await rewriteUnderperformingSteps();
    auditResults.push(`Sequences: ${rewrites} steps rewritten`);
  } catch (err) {
    auditResults.push(`Sequences: Error — ${err}`);
  }

  // Step 6. SEND TIMING: Optimize based on reply patterns
  try {
    await optimizeSendTimes();
    auditResults.push(`Send timing: optimized`);
  } catch (err) {
    auditResults.push(`Send timing: Error — ${err}`);
  }

  // Step 7. KNOWLEDGE ENGINE: Fetch sources, extract & validate insights
  try {
    const { fetchKnowledgeSources, extractInsights, extractPipelineInsights, validateInsights, updateSourceReliability } = await import("./knowledge-engine");
    const fetched = await fetchKnowledgeSources();
    const extracted = await extractInsights();
    const pipelineInsights = await extractPipelineInsights();
    const validated = await validateInsights();
    await updateSourceReliability();
    auditResults.push(`Knowledge Engine: ${fetched} sources fetched, ${extracted + pipelineInsights} insights extracted, ${validated} validated`);
  } catch (err) {
    auditResults.push(`Knowledge Engine: Error — ${err}`);
  }

  // Step 8. CONTENT ENGINE: Generate next week's calendar + drafts
  try {
    const { generateWeeklyContentCalendar, generateContentDrafts, optimizeContentStrategy } = await import("./content-engine");
    const calendar = await generateWeeklyContentCalendar();
    const drafts = await generateContentDrafts();
    const optimization = await optimizeContentStrategy();
    auditResults.push(`Content Engine: calendar (${calendar.newsletter}N/${calendar.blog}B/${calendar.linkedin}L/${calendar.twitter}T), ${drafts} drafts generated`);
    auditResults.push(`Content optimization: ${optimization.substring(0, 200)}`);
  } catch (err) {
    auditResults.push(`Content Engine: Error — ${err}`);
  }

  // Step 9. WEEKLY SUMMARY: Decisions changelog, not metrics
  try {
    await generateWeeklySummary(weekNumber, auditResults);
    auditResults.push(`Weekly summary: generated`);
  } catch (err) {
    auditResults.push(`Weekly summary: Error — ${err}`);
  }

  return auditResults.join("\n");
}

async function generateWeeklySummary(weekNumber: number, auditResults: string[]): Promise<void> {
  const weekStart = getWeekStart(new Date());

  // Gather context metrics (minimal — the narrative is about decisions, not numbers)
  const [dealsWon, dealsLost, newContacts, replies, meetings, changelog] = await Promise.all([
    prisma.deal.count({ where: { stage: "closed_won", updatedAt: { gte: weekStart } } }),
    prisma.deal.count({ where: { stage: "closed_lost", updatedAt: { gte: weekStart } } }),
    prisma.contact.count({ where: { createdAt: { gte: weekStart } } }),
    prisma.aIConversationLog.count({ where: { direction: "inbound", createdAt: { gte: weekStart } } }),
    prisma.meeting.count({ where: { createdAt: { gte: weekStart } } }),
    prisma.systemChangelog.findMany({ where: { weekNumber }, orderBy: { createdAt: "asc" } }),
  ]);

  const pipelineValue = await prisma.deal.aggregate({
    where: { stage: { notIn: ["closed_won", "closed_lost"] } },
    _sum: { amount: true },
  });

  // AI generates decision-focused narrative, not a metrics dump
  const result = await runAIJob("lifecycle_manager", "weekly_narrative", {
    metrics: { dealsWon, dealsLost, newContacts, replies, meetings, pipelineValue: pipelineValue._sum.amount },
    systemChanges: changelog.map((c) => ({
      category: c.category,
      description: c.description,
      evidence: c.dataEvidence,
      previousValue: c.previousValue,
      newValue: c.newValue,
    })),
    auditResults,
    instructions: `Write a decisions-focused weekly summary. NOT a metrics dashboard — a changelog of what the system changed, why, and what it expects to happen.

For each autonomous change this week, format as:
- SIGNAL OBSERVED: what data pattern was detected
- CONCLUSION: what the system concluded from it
- CHANGE MADE: exactly what was adjusted
- EXPECTED OUTCOME: what should improve as a result
- VERIFICATION: how we'll know next week if it worked

Context: ${dealsWon} deals won, ${dealsLost} lost, ${replies} replies, pipeline $${(pipelineValue._sum.amount || 0).toLocaleString()}.

If fewer than 5 system changes were made, explain why (insufficient data, thresholds not met, etc.).

End with 1-2 sentences on what to expect next week based on current pipeline state.

Tone: direct, specific, no fluff. This is read in 2 minutes by a solo agency founder.
Return JSON: {
  narrative: string,
  decisions: [{ signal, conclusion, change, expectedOutcome, verification }],
  topOutreachAngle: string,
  topConvertingProfile: string,
  projectedRevenue: number
}`,
  });

  const summary = result.output as {
    narrative: string;
    decisions: { signal: string; conclusion: string; change: string; expectedOutcome: string; verification: string }[];
    topOutreachAngle: string;
    topConvertingProfile: string;
    projectedRevenue: number;
  };

  await prisma.weeklySummary.create({
    data: {
      weekStarting: weekStart,
      pipelineValue: pipelineValue._sum.amount,
      dealsWon,
      dealsLost,
      newContacts,
      repliesReceived: replies,
      meetingsBooked: meetings,
      topOutreachAngle: summary.topOutreachAngle,
      topConvertingProfile: summary.topConvertingProfile,
      projectedRevenue: summary.projectedRevenue,
      aiAdjustments: JSON.stringify(summary.decisions),
      narrative: summary.narrative,
    },
  });
}

// ============================================
// UTILITIES
// ============================================

function getISOWeekNumber(date: Date): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
}

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday start
  return new Date(d.setDate(diff));
}
