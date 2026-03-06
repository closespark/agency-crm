// Layer 5 — Weekly QA Audit
// Runs as the FIRST step of the Sunday self-audit, BEFORE any optimization.
// "Do not optimize a broken system."

import { prisma } from "@/lib/prisma";
import { aiJSON } from "@/lib/ai/claude";

export interface WeeklyQAReport {
  status: "healthy" | "degraded" | "broken";
  checks: WeeklyQACheck[];
  pausedDomains: string[]; // domains where self-optimization should be paused
  timestamp: string;
}

export interface WeeklyQACheck {
  name: string;
  status: "pass" | "fail" | "warning";
  details: string;
  severity: "info" | "warning" | "critical";
}

export async function runWeeklyQAAudit(): Promise<WeeklyQAReport> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const checks: WeeklyQACheck[] = [];
  const pausedDomains: string[] = [];

  // 1. Runtime validation failures this week
  const validationFailures = await prisma.rawEventLog.count({
    where: {
      source: "qa_runtime",
      createdAt: { gte: weekAgo },
    },
  });
  checks.push({
    name: "Runtime validation failures",
    status: validationFailures === 0 ? "pass" : validationFailures > 10 ? "fail" : "warning",
    details: `${validationFailures} runtime validation failures in the last 7 days`,
    severity: validationFailures > 10 ? "critical" : validationFailures > 0 ? "warning" : "info",
  });
  if (validationFailures > 10) pausedDomains.push("api_integrations");

  // 2. Self-optimization data accumulation
  const recentDeals = await prisma.deal.count({
    where: {
      stage: { in: ["closed_won", "closed_lost"] },
      updatedAt: { gte: weekAgo },
    },
  });
  const conversionFeedback = await prisma.conversionFeedback.count({
    where: { createdAt: { gte: weekAgo } },
  });
  checks.push({
    name: "Self-optimization data accumulation",
    status: conversionFeedback >= recentDeals ? "pass" : "warning",
    details: `${recentDeals} deals closed, ${conversionFeedback} conversion feedbacks recorded`,
    severity: conversionFeedback < recentDeals ? "warning" : "info",
  });

  // 3. recordConversion() fired for every deal close
  const closedDeals = await prisma.deal.count({
    where: { stage: "closed_won", updatedAt: { gte: weekAgo } },
  });
  const wonFeedbacks = await prisma.conversionFeedback.count({
    where: { outcome: "converted", createdAt: { gte: weekAgo } },
  });
  const conversionGap = closedDeals - wonFeedbacks;
  checks.push({
    name: "recordConversion() completeness",
    status: conversionGap === 0 ? "pass" : conversionGap <= 2 ? "warning" : "fail",
    details: `${closedDeals} deals closed_won, ${wonFeedbacks} conversion feedbacks. Gap: ${conversionGap}`,
    severity: conversionGap > 2 ? "critical" : conversionGap > 0 ? "warning" : "info",
  });
  if (conversionGap > 2) pausedDomains.push("icp_optimization");

  // 4. Dirty flags being set and cleared
  const dirtyContacts = await prisma.contact.count({ where: { scoreDirty: true } });
  const totalContacts = await prisma.contact.count();
  const dirtyPercent = totalContacts > 0 ? (dirtyContacts / totalContacts) * 100 : 0;
  checks.push({
    name: "Score dirty flag management",
    status: dirtyPercent < 20 ? "pass" : dirtyPercent < 50 ? "warning" : "fail",
    details: `${dirtyContacts}/${totalContacts} contacts have dirty scores (${dirtyPercent.toFixed(1)}%)`,
    severity: dirtyPercent >= 50 ? "critical" : dirtyPercent >= 20 ? "warning" : "info",
  });
  if (dirtyPercent >= 50) pausedDomains.push("scoring");

  // 5. StageGate advances with null required fields
  const recentTransitions = await prisma.lifecycleTransition.findMany({
    where: { createdAt: { gte: weekAgo } },
    select: { gateValidation: true },
    take: 200,
  });
  let nullFieldAdvances = 0;
  for (const t of recentTransitions) {
    if (t.gateValidation) {
      try {
        const validation = JSON.parse(t.gateValidation);
        if (validation.missingFields?.length > 0) nullFieldAdvances++;
      } catch { /* skip malformed */ }
    }
  }
  checks.push({
    name: "StageGate integrity",
    status: nullFieldAdvances === 0 ? "pass" : nullFieldAdvances <= 3 ? "warning" : "fail",
    details: `${nullFieldAdvances} stage advances with missing required fields this week`,
    severity: nullFieldAdvances > 3 ? "critical" : nullFieldAdvances > 0 ? "warning" : "info",
  });
  if (nullFieldAdvances > 3) pausedDomains.push("stage_gates");

  // 6. Content calendar publishing on schedule
  const scheduledContent = await prisma.contentDraft.count({
    where: {
      status: "scheduled",
      publishAt: { gte: weekAgo, lte: new Date() },
    },
  });
  const publishedContent = await prisma.contentDraft.count({
    where: {
      status: "published",
      publishedAt: { gte: weekAgo },
    },
  });
  checks.push({
    name: "Content calendar publishing",
    status: scheduledContent === 0 || publishedContent > 0 ? "pass" : "warning",
    details: `${publishedContent} pieces published, ${scheduledContent} still scheduled (past due)`,
    severity: scheduledContent > 3 ? "warning" : "info",
  });

  // 7. Newsletter engagement → contact score flow
  const newsletterClicks = await prisma.rawEventLog.count({
    where: {
      source: "newsletter",
      eventType: "click",
      createdAt: { gte: weekAgo },
    },
  });
  const scoreUpdatesFromNewsletter = await prisma.aIInsight.count({
    where: {
      type: "newsletter_warm_lead",
      createdAt: { gte: weekAgo },
    },
  });
  checks.push({
    name: "Newsletter engagement → score pipeline",
    status: newsletterClicks === 0 || scoreUpdatesFromNewsletter > 0 ? "pass" : "warning",
    details: `${newsletterClicks} newsletter clicks, ${scoreUpdatesFromNewsletter} warm lead insights generated`,
    severity: newsletterClicks > 10 && scoreUpdatesFromNewsletter === 0 ? "warning" : "info",
  });

  // 8. Worker health — autopilot ran this week
  const lastAutopilot = await prisma.systemChangelog.findFirst({
    where: { category: "autopilot", changeType: "daily_run" },
    orderBy: { createdAt: "desc" },
  });
  const hoursSinceAutopilot = lastAutopilot
    ? (Date.now() - lastAutopilot.createdAt.getTime()) / (1000 * 60 * 60)
    : Infinity;
  checks.push({
    name: "Worker autopilot health",
    status: hoursSinceAutopilot < 26 ? "pass" : hoursSinceAutopilot < 50 ? "warning" : "fail",
    details: lastAutopilot
      ? `Last autopilot run: ${lastAutopilot.createdAt.toISOString()} (${hoursSinceAutopilot.toFixed(1)} hours ago)`
      : "No autopilot runs found",
    severity: hoursSinceAutopilot >= 50 ? "critical" : hoursSinceAutopilot >= 26 ? "warning" : "info",
  });
  if (hoursSinceAutopilot >= 50) pausedDomains.push("all");

  // Determine overall status
  const criticalChecks = checks.filter((c) => c.severity === "critical");
  const warningChecks = checks.filter((c) => c.severity === "warning");
  const overallStatus: WeeklyQAReport["status"] =
    criticalChecks.length > 0 ? "broken" : warningChecks.length > 0 ? "degraded" : "healthy";

  // Log the report
  await prisma.systemChangelog.create({
    data: {
      category: "qa",
      changeType: "weekly_audit",
      description: `Weekly QA audit: ${overallStatus}. ${criticalChecks.length} critical, ${warningChecks.length} warnings.${pausedDomains.length > 0 ? ` Paused domains: ${pausedDomains.join(", ")}` : ""}`,
      dataEvidence: JSON.stringify({ checks, pausedDomains }),
    },
  });

  return {
    status: overallStatus,
    checks,
    pausedDomains,
    timestamp: new Date().toISOString(),
  };
}
