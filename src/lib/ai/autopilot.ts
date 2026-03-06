// Autopilot engine — the brain that runs the autonomous CRM
// Orchestrates all AI agents, lifecycle engine, and integrations
// Runs daily (or on-demand) without any human interaction

import { prisma } from "@/lib/prisma";
import { batchScoreContacts } from "./lead-scorer";
import { scanDealsForInsights } from "./deal-advisor";
import { runAIJob } from "./job-runner";
import { processChannelEscalations } from "./channel-coordinator";
import { checkSignals } from "./signal-monitor";
import { generateUpcomingBriefs } from "./meeting-brief";
import { processHandoffQueue } from "./domain-handoff";
import { analyzeFeedbackLoop } from "./scoring-feedback";
import { processAutoAdvanceRules } from "./lifecycle-engine";
import { processScoreDecay } from "./score-decay";
import { analyzeTicketSignals, classifyTicket } from "./ticket-intelligence";
import { processClientHealthChecks, processRenewals, processChurns } from "./client-lifecycle";
import { safeParseJSON } from "@/lib/safe-json";

export interface AutopilotStatus {
  isActive: boolean;
  lastRunAt: Date | null;
  stats: {
    contactsScored: number;
    repliesAnalyzed: number;
    dealsAnalyzed: number;
    insightsGenerated: number;
    sequenceStepsExecuted: number;
    meetingsBooked: number;
    lifecycleAdvances: number;
    handoffsProcessed: number;
    clientHealthChecks: number;
    ticketSignals: number;
  };
}

// Process all pending sequence enrollments
export async function processSequenceQueue(): Promise<number> {
  const due = await prisma.sequenceEnrollment.findMany({
    where: {
      status: "active",
      nextActionAt: { lte: new Date() },
    },
    include: {
      sequence: true,
      contact: { include: { company: true } },
    },
    take: 20,
  });

  let processed = 0;

  for (const enrollment of due) {
    try {
      const steps = safeParseJSON(enrollment.sequence.steps, []) as Array<{
        stepNumber: number;
        channel: string;
        delayDays: number;
        subject?: string;
        body: string;
      }>;

      const currentStep = steps[enrollment.currentStep];
      if (!currentStep) {
        await prisma.sequenceEnrollment.update({
          where: { id: enrollment.id },
          data: { status: "completed", completedAt: new Date() },
        });
        continue;
      }

      // Personalize the message using AI
      const personalizedResult = await runAIJob(
        "email_composer",
        "personalize_step",
        {
          template: currentStep,
          contact: {
            firstName: enrollment.contact.firstName,
            lastName: enrollment.contact.lastName,
            email: enrollment.contact.email,
            jobTitle: enrollment.contact.jobTitle,
            companyName: enrollment.contact.company?.name,
            industry: enrollment.contact.company?.industry,
          },
        },
        { contactId: enrollment.contactId }
      );

      const personalized = personalizedResult.output as {
        subject?: string;
        body: string;
      };

      // Determine sending route based on contact's domain tier
      const enrolledContact = await prisma.contact.findUnique({
        where: { id: enrollment.contactId },
        select: { email: true, domainTier: true },
      });

      let gmailMeta: { gmailMessageId?: string; gmailThreadId?: string } = {};

      let emailSent = false;

      if (currentStep.channel === "email" && enrolledContact?.email) {
        if (enrolledContact.domainTier === "warm") {
          // Warm domain → send via Gmail API (branded domain)
          // If Gmail fails, this step fails — do NOT log as sent
          const { sendEmail } = await import("@/lib/integrations/gmail");
          const result = await sendEmail({
            to: enrolledContact.email,
            subject: personalized.subject || currentStep.subject || "",
            body: personalized.body,
          });
          gmailMeta = { gmailMessageId: result.messageId, gmailThreadId: result.threadId };
          emailSent = true;
        }
        // Cold domain contacts: Instantly handles sending via its own campaign system.
        // The sequence enrollment for cold contacts is managed by Instantly's scheduler,
        // not our processSequenceQueue. If we get here for a cold contact, it means
        // the sequence wasn't pushed to Instantly — skip this step without logging as sent.
      }

      // Only log activity if the email was actually sent (or if non-email channel like LinkedIn notes)
      if (emailSent || currentStep.channel !== "email") {
        const adminUser = await prisma.user.findFirst({ where: { role: "admin" } });
        await prisma.activity.create({
          data: {
            type: currentStep.channel === "linkedin" ? "note" : "email",
            subject: personalized.subject || currentStep.subject,
            body: personalized.body,
            userId: adminUser?.id || "",
            contactId: enrollment.contactId,
          },
        });

        await prisma.aIConversationLog.create({
          data: {
            contactId: enrollment.contactId,
            channel: currentStep.channel,
            direction: "outbound",
            rawContent: personalized.body,
            aiSummary: `Sequence step ${enrollment.currentStep + 1}: ${currentStep.channel} outreach`,
            metadata: gmailMeta.gmailMessageId ? JSON.stringify({
              ...gmailMeta,
              sentVia: "gmail_api",
              domainTier: "warm",
            }) : undefined,
          },
        });
      } else {
        // Cold contact not pushed to Instantly — advance the step to prevent infinite loop,
        // but log as skipped so the system knows this step wasn't actually delivered.
        console.warn(`[autopilot] Sequence step ${enrollment.currentStep + 1} for ${enrollment.contactId}: skipped (cold contact not in Instantly)`);
      }

      // Lead auto-advance: outreach logged → "attempting"
      const leads = await prisma.lead.findMany({
        where: { contactId: enrollment.contactId, stage: "new" },
      });
      for (const lead of leads) {
        const { advanceLeadStage } = await import("./lifecycle-engine");
        await advanceLeadStage(lead.id, "attempting", "ai_auto", "Outreach activity logged");
      }

      // Advance to next step
      const nextStep = steps[enrollment.currentStep + 1];
      await prisma.sequenceEnrollment.update({
        where: { id: enrollment.id },
        data: {
          currentStep: enrollment.currentStep + 1,
          nextActionAt: nextStep
            ? new Date(Date.now() + nextStep.delayDays * 24 * 60 * 60 * 1000)
            : null,
          status: nextStep ? "active" : "completed",
          completedAt: nextStep ? null : new Date(),
        },
      });

      processed++;
    } catch (err) {
      console.error(`Sequence step failed for enrollment ${enrollment.id}:`, err);
    }
  }

  return processed;
}

// Full daily autonomous run — zero human interaction required
export async function generateDailyInsights(): Promise<number> {
  let insightCount = 0;

  // === INBOX SYNC ===

  // 0. Pull new emails from Gmail into CRM (replies auto-trigger analysis)
  try {
    const { syncInbox } = await import("@/lib/integrations/gmail");
    await syncInbox();
  } catch (err) {
    console.error("Gmail inbox sync failed:", err);
  }

  // === SCORING & QUALIFICATION ===

  // 1. Apply score decay (25%/month behavioral, full reset at 90 days)
  await processScoreDecay();

  // 2. Re-score stale contacts
  const scoreResult = await batchScoreContacts();
  insightCount += scoreResult.scored;

  // 3. Process lifecycle auto-advance rules (subscriber→lead→mql→sql based on score/BANT)
  const lifecycleAdvances = await processAutoAdvanceRules();
  insightCount += lifecycleAdvances;

  // === PIPELINE MANAGEMENT ===

  // 4. Scan deals for risks and stalled deals
  const dealInsights = await scanDealsForInsights();
  insightCount += dealInsights;

  // 5. Find engagement drops (score >= 50, no activity in 14+ days)
  const recentlyEngaged = await prisma.contact.findMany({
    where: {
      leadScore: { gte: 50 },
      activities: {
        none: {
          createdAt: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) },
        },
      },
    },
    select: { id: true, firstName: true, lastName: true, leadScore: true },
    take: 20,
  });

  for (const contact of recentlyEngaged) {
    await prisma.aIInsight.create({
      data: {
        type: "engagement_drop",
        title: `${contact.firstName} ${contact.lastName} hasn't engaged in 14+ days`,
        description: `Lead score: ${contact.leadScore}. No recent activity. Consider re-engagement.`,
        priority: contact.leadScore >= 70 ? "high" : "medium",
        resourceType: "contact",
        resourceId: contact.id,
        actionItems: JSON.stringify([
          { action: "Send personalized re-engagement email", priority: "this_week" },
          { action: "Check LinkedIn for recent activity", priority: "today" },
        ]),
      },
    });
    insightCount++;
  }

  // 6. Find hot leads (score >= 70, MQL/SQL, no deal)
  const hotLeads = await prisma.contact.findMany({
    where: {
      leadScore: { gte: 70 },
      lifecycleStage: { in: ["mql", "sql"] },
      deals: { none: {} },
    },
    select: { id: true, firstName: true, lastName: true, leadScore: true },
    take: 10,
  });

  for (const lead of hotLeads) {
    await prisma.aIInsight.create({
      data: {
        type: "hot_lead",
        title: `Hot lead: ${lead.firstName} ${lead.lastName} (score: ${lead.leadScore})`,
        description: "High-scoring lead with no active deal. Auto-creating deal.",
        priority: "high",
        resourceType: "contact",
        resourceId: lead.id,
        actionItems: JSON.stringify([
          { action: "Deal auto-created at Discovery stage", priority: "now" },
          { action: "Schedule discovery call", priority: "today" },
        ]),
        status: "auto_actioned",
      },
    });

    // Auto-create deal for hot leads
    await prisma.deal.create({
      data: {
        name: `${lead.firstName} ${lead.lastName} - Deal`,
        stage: "discovery",
        pipeline: "new_business",
        probability: 10,
        stageEnteredAt: new Date(),
        contactId: lead.id,
      },
    });

    insightCount++;
  }

  // === CHANNEL & OUTREACH MANAGEMENT ===

  // 7. Process channel escalations (linkedin → email → phone)
  await processChannelEscalations();

  // 8. Check Apollo signals (job changes, hiring spikes, funding)
  await checkSignals();

  // 9. Process domain handoff queue (send warm touchpoints from branded domain)
  await processHandoffQueue();

  // === PRE-MEETING PREP ===

  // 10. Generate meeting briefs for meetings in next 24 hours
  await generateUpcomingBriefs();

  // === POST-SALE & CLIENT LIFECYCLE ===

  // 11. Classify unclassified tickets for revenue signals
  const unclassifiedTickets = await prisma.ticket.findMany({
    where: { sentiment: null, contactId: { not: null } },
    select: { id: true },
    take: 20,
  });
  for (const ticket of unclassifiedTickets) {
    try {
      await classifyTicket(ticket.id);
    } catch (err) {
      console.error(`Ticket classification failed for ${ticket.id}:`, err);
    }
  }

  // 12. Analyze ticket signals → churn/upsell/referral
  const ticketSignals = await analyzeTicketSignals();
  insightCount += ticketSignals;

  // 13. Client health checks (weekly)
  await processClientHealthChecks();

  // 14. Process contract renewals (60 days before expiry → renewal stage)
  await processRenewals();

  // 15. Mark expired contracts as churned
  await processChurns();

  // === WEEKLY SELF-OPTIMIZATION ===

  // 16. Sunday: QA audit FIRST, then self-optimization (never optimize a broken system)
  const dayOfWeek = new Date().getDay();
  if (dayOfWeek === 0) {
    // Step A: Run QA audit before any optimization
    let qaHealthy = true;
    let pausedDomains: string[] = [];
    try {
      const { runWeeklyQAAudit } = await import("@/lib/qa/weekly-qa-audit");
      const qaReport = await runWeeklyQAAudit();
      qaHealthy = qaReport.status !== "broken";
      pausedDomains = qaReport.pausedDomains;
      console.log(`[autopilot] Weekly QA: ${qaReport.status} (${qaReport.checks.filter(c => c.status === "fail").length} failures, paused: ${pausedDomains.join(", ") || "none"})`);
    } catch (err) {
      console.error("Weekly QA audit failed:", err);
    }

    // Step B: Only run self-optimization if QA is not broken
    if (qaHealthy && !pausedDomains.includes("all")) {
      try {
        const { runWeeklySelfAudit } = await import("./self-optimization-engine");
        await runWeeklySelfAudit(pausedDomains);
      } catch (err) {
        console.error("Weekly self-audit failed:", err);
      }
    } else {
      console.warn("[autopilot] Skipping self-optimization — QA audit status: broken or all domains paused");
    }
  }

  // 17. Monday: Legacy feedback loop (supplementary to Sunday audit)
  if (dayOfWeek === 1) {
    await analyzeFeedbackLoop();
  }

  return insightCount;
}

// Get autopilot dashboard stats
export async function getAutopilotStats(): Promise<AutopilotStatus["stats"]> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    contactsScored, repliesAnalyzed, dealsAnalyzed, insights,
    sequenceSteps, meetings, lifecycleTransitions, handoffs,
    clientChecks, ticketSignals,
  ] = await Promise.all([
    prisma.aIJob.count({
      where: { type: "score_lead", status: "completed", createdAt: { gte: thirtyDaysAgo } },
    }),
    prisma.aIJob.count({
      where: { type: "analyze_reply", status: "completed", createdAt: { gte: thirtyDaysAgo } },
    }),
    prisma.aIJob.count({
      where: { type: "analyze_deal", status: "completed", createdAt: { gte: thirtyDaysAgo } },
    }),
    prisma.aIInsight.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
    prisma.aIJob.count({
      where: { type: "personalize_step", status: "completed", createdAt: { gte: thirtyDaysAgo } },
    }),
    prisma.meeting.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
    prisma.lifecycleTransition.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
    prisma.domainHandoff.count({ where: { handoffStatus: "sent", createdAt: { gte: thirtyDaysAgo } } }),
    prisma.clientLifecycle.count({ where: { lastHealthCheck: { gte: thirtyDaysAgo } } }),
    prisma.aIInsight.count({
      where: {
        type: { in: ["churn_warning", "upsell_opportunity", "referral_opportunity", "ticket_churn_signal", "ticket_upsell_signal"] },
        createdAt: { gte: thirtyDaysAgo },
      },
    }),
  ]);

  return {
    contactsScored,
    repliesAnalyzed,
    dealsAnalyzed,
    insightsGenerated: insights,
    sequenceStepsExecuted: sequenceSteps,
    meetingsBooked: meetings,
    lifecycleAdvances: lifecycleTransitions,
    handoffsProcessed: handoffs,
    clientHealthChecks: clientChecks,
    ticketSignals,
  };
}
