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
        angle?: string;
        goal?: string;
        objectionToAddress?: string;
        tone?: string;
        subject?: string;
        body?: string;
      }>;

      const currentStep = steps[enrollment.currentStep];
      if (!currentStep) {
        await prisma.sequenceEnrollment.update({
          where: { id: enrollment.id },
          data: { status: "completed", completedAt: new Date() },
        });
        continue;
      }

      // Gather full contact intelligence for AI copy generation
      const { gatherContactIntelligence, generateStepCopy } = await import("./sequence-generator");
      const intel = await gatherContactIntelligence(enrollment.contactId, enrollment.sequenceId);

      let personalized: { subject?: string; body: string };

      // New-style steps have angle/goal — generate copy from scratch using full intelligence
      // Old-style steps have pre-written body — fall back to basic personalization
      if (currentStep.angle) {
        const copy = await generateStepCopy({
          step: currentStep as import("./sequence-generator").SequenceStep,
          intel,
          sequenceName: enrollment.sequence.name,
          sequenceStrategy: enrollment.sequence.description || "",
        });
        personalized = copy;
      } else {
        // Legacy fallback for old sequences with pre-written body text
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
            // Even for legacy sequences, feed in available intelligence
            discoveryNotes: intel.conversations
              .filter((c) => c.direction === "inbound")
              .map((c) => c.summary || c.content)
              .join("\n"),
            bantData: intel.bant,
            engagementData: intel.engagement,
          },
          { contactId: enrollment.contactId }
        );
        personalized = personalizedResult.output as { subject?: string; body: string };
      }

      // Determine sending route based on contact's domain tier
      const enrolledContact = await prisma.contact.findUnique({
        where: { id: enrollment.contactId },
        select: { email: true, domainTier: true },
      });

      let gmailMeta: { gmailMessageId?: string; gmailThreadId?: string } = {};
      let vapiMeta: { vapiCallId?: string } = {};

      let stepExecuted = false;

      if (currentStep.channel === "email" && enrolledContact?.email) {
        if (enrolledContact.domainTier === "warm") {
          const { sendEmail } = await import("@/lib/integrations/gmail");
          const result = await sendEmail({
            to: enrolledContact.email,
            subject: personalized.subject || currentStep.subject || "",
            body: personalized.body,
          });
          gmailMeta = { gmailMessageId: result.messageId, gmailThreadId: result.threadId };
          stepExecuted = true;
        }
      } else if (currentStep.channel === "call") {
        // Place outbound AI call via Vapi
        try {
          const contactForCall = await prisma.contact.findUnique({
            where: { id: enrollment.contactId },
            select: { phone: true, firstName: true, lastName: true, company: { select: { name: true } } },
          });
          if (contactForCall?.phone) {
            const { vapi } = await import("@/lib/integrations/vapi");
            // Find first available assistant
            const assistants = await vapi.assistants.list();
            const assistant = assistants[0];
            if (assistant) {
              const call = await vapi.calls.create({
                assistantId: assistant.id,
                customer: {
                  number: contactForCall.phone,
                  name: `${contactForCall.firstName} ${contactForCall.lastName}`,
                },
                assistantOverrides: {
                  firstMessage: personalized.body.substring(0, 500),
                  model: {
                    systemPrompt: `You are calling ${contactForCall.firstName} ${contactForCall.lastName}${contactForCall.company?.name ? ` from ${contactForCall.company.name}` : ""}. Goal: ${currentStep.goal || "follow up on previous outreach"}. Tone: ${currentStep.tone || "professional and friendly"}.`,
                  },
                },
              });
              vapiMeta = { vapiCallId: call.id };
              stepExecuted = true;
            } else {
              console.warn(`[autopilot] No Vapi assistant configured — skipping call step`);
            }
          } else {
            console.warn(`[autopilot] No phone number for contact ${enrollment.contactId} — skipping call step`);
          }
        } catch (err) {
          console.error(`[autopilot] Vapi call failed for ${enrollment.contactId}:`, err);
        }
      } else if (currentStep.channel === "linkedin") {
        // LinkedIn steps are logged as notes — actual delivery depends on Meet Alfred or Zapier
        stepExecuted = true;
      }

      if (stepExecuted) {
        const adminUser = await prisma.user.findFirst({ where: { role: "admin" } });
        const activityType = currentStep.channel === "call" ? "call" : currentStep.channel === "linkedin" ? "note" : "email";
        await prisma.activity.create({
          data: {
            type: activityType,
            subject: personalized.subject || currentStep.subject,
            body: personalized.body,
            userId: adminUser?.id || "",
            contactId: enrollment.contactId,
          },
        });

        const channelMeta = gmailMeta.gmailMessageId
          ? JSON.stringify({ ...gmailMeta, sentVia: "gmail_api", domainTier: "warm" })
          : vapiMeta.vapiCallId
            ? JSON.stringify({ ...vapiMeta, sentVia: "vapi" })
            : undefined;

        await prisma.aIConversationLog.create({
          data: {
            contactId: enrollment.contactId,
            channel: currentStep.channel,
            direction: "outbound",
            rawContent: personalized.body,
            aiSummary: `Sequence step ${enrollment.currentStep + 1}: ${currentStep.channel} outreach`,
            metadata: channelMeta,
          },
        });
      } else {
        console.warn(`[autopilot] Sequence step ${enrollment.currentStep + 1} for ${enrollment.contactId}: skipped (channel: ${currentStep.channel}, no delivery route)`);
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
    // Auto-enroll in re-engagement sequence if not already in one
    const activeEnrollment = await prisma.sequenceEnrollment.findFirst({
      where: { contactId: contact.id, status: "active" },
    });

    let autoActioned = false;
    if (!activeEnrollment) {
      const reengageSequence = await prisma.sequence.findFirst({
        where: { isActive: true },
        orderBy: { createdAt: "asc" },
      });
      if (reengageSequence) {
        const steps = safeParseJSON(reengageSequence.steps, [] as Array<{ delayDays: number }>);
        const firstDelay = steps[0]?.delayDays || 0;
        await prisma.sequenceEnrollment.create({
          data: {
            sequenceId: reengageSequence.id,
            contactId: contact.id,
            status: "active",
            currentStep: 0,
            channel: "email",
            nextActionAt: new Date(Date.now() + firstDelay * 24 * 60 * 60 * 1000),
            metadata: JSON.stringify({ source: "engagement_drop_reengage" }),
          },
        });
        autoActioned = true;
      }
    }

    await prisma.aIInsight.create({
      data: {
        type: "engagement_drop",
        title: `${contact.firstName} ${contact.lastName} hasn't engaged in 14+ days`,
        description: `Lead score: ${contact.leadScore}. No recent activity. ${autoActioned ? "Auto-enrolled in re-engagement sequence." : "Already in active sequence."}`,
        priority: contact.leadScore >= 70 ? "high" : "medium",
        resourceType: "contact",
        resourceId: contact.id,
        status: autoActioned ? "auto_actioned" : "new",
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
    select: { id: true, firstName: true, lastName: true, leadScore: true, companyId: true },
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
        companyId: lead.companyId || undefined,
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
