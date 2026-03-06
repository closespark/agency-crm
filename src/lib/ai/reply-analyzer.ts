import { prisma } from "@/lib/prisma";
import { runAIJob } from "./job-runner";
import { isWarmIntent, triggerDomainHandoff } from "./domain-handoff";
import { onReplyReceived } from "./channel-coordinator";
import { extractBANT } from "./bant-extractor";
import { advanceContactStage, advanceLeadStage } from "./lifecycle-engine";

interface ReplyAnalysis {
  sentiment: "positive" | "neutral" | "negative" | "urgent";
  intent: "interested" | "objection" | "question" | "meeting_request" | "not_interested" | "out_of_office" | "referral" | "unsubscribe";
  // Deep objection extraction
  objection?: {
    type: "timing" | "budget" | "authority" | "need" | "competition";
    verbatim: string; // their exact words
    severity: "soft" | "hard"; // soft = can overcome, hard = dealbreaker
  };
  keyPoints: string[];
  suggestedResponse: string;
  // Confidence impact on the deal
  confidenceDelta: number; // -100 to +100
  // Channel preference detection
  preferredChannel: "email" | "linkedin" | "phone";
  channelSignal: string; // why this channel is preferred
  // Downstream auto-actions (not suggestions — ACTIONS)
  autoActions: {
    action: string;
    type: "update_lifecycle" | "create_deal" | "schedule_meeting" | "enroll_sequence" | "update_lead_score" | "pause_sequences" | "escalate_channel" | "mark_unqualified" | "create_task" | "send_reply";
    config: Record<string, unknown>;
    reason: string;
  }[];
  urgency: "immediate" | "today" | "this_week" | "not_urgent";
}

export async function analyzeReply(
  content: string,
  contactId?: string,
  channel: string = "email"
): Promise<ReplyAnalysis> {
  let contactContext = null;
  let dealContext = null;

  if (contactId) {
    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
      include: {
        company: true,
        activities: { orderBy: { createdAt: "desc" }, take: 10 },
        deals: { where: { stage: { notIn: ["closed_lost", "closed_won"] } } },
        sequenceEnrollments: { where: { status: "active" }, include: { sequence: true } },
      },
    });
    if (contact) {
      contactContext = {
        name: `${contact.firstName} ${contact.lastName}`,
        email: contact.email,
        jobTitle: contact.jobTitle,
        company: contact.company?.name,
        industry: contact.company?.industry,
        currentStage: contact.lifecycleStage,
        leadStatus: contact.leadStatus,
        leadScore: contact.leadScore,
        activeDeals: contact.deals.map((d) => ({ id: d.id, name: d.name, stage: d.stage, amount: d.amount })),
        activeSequences: contact.sequenceEnrollments.map((e) => ({ id: e.id, name: e.sequence.name, step: e.currentStep })),
        recentActivities: contact.activities.map((a) => ({
          type: a.type, subject: a.subject, date: a.createdAt,
        })),
      };
      if (contact.deals[0]) {
        dealContext = contact.deals[0];
      }
    }
  }

  const input = {
    message: content,
    channel,
    contact: contactContext,
    activeDeal: dealContext ? { id: dealContext.id, stage: dealContext.stage, amount: dealContext.amount } : null,
    instructions: `Analyze this reply deeply. Extract:
1. Sentiment and intent
2. If there's an objection: classify as timing/budget/authority/need/competition, quote their EXACT words, rate severity (soft=can overcome, hard=dealbreaker)
3. Calculate confidenceDelta (-100 to +100): how much should deal confidence change based on this reply? Positive reply = +10 to +30. Meeting request = +40. Objection = -10 to -30. Not interested = -80.
4. Detect preferred channel from reply style and where they replied
5. Generate autoActions — NOT suggestions, but actual actions to execute automatically:
   - If positive: update_lifecycle to sql, create_deal if none exists, update_lead_score +20
   - If meeting request: schedule_meeting, pause_sequences
   - If objection (soft): send_reply with objection-handling response, create_task for follow-up
   - If objection (hard timing): update_lifecycle to lead, enroll_sequence for nurture
   - If not interested: mark_unqualified, pause_sequences
   - If out_of_office: create_task to follow up after their return
   - If reply on linkedin but sequence is email: note preferredChannel as linkedin
6. suggestedResponse: draft a reply appropriate for the context`,
  };

  const result = await runAIJob("reply_analyzer", "analyze_reply", input, { contactId, dealId: dealContext?.id });
  const analysis = result.output as ReplyAnalysis;

  // Store enriched conversation log
  await prisma.aIConversationLog.create({
    data: {
      contactId,
      dealId: dealContext?.id,
      channel,
      direction: "inbound",
      rawContent: content,
      aiSummary: analysis.keyPoints.join(". "),
      sentiment: analysis.sentiment,
      intent: analysis.intent,
      objectionType: analysis.objection?.type,
      objectionVerbatim: analysis.objection?.verbatim,
      confidenceDelta: analysis.confidenceDelta,
      preferredChannel: analysis.preferredChannel,
      suggestedAction: JSON.stringify(analysis.autoActions),
      autoActioned: true,
    },
  });

  // Mark contact for re-scoring (reply is a signal change)
  if (contactId) {
    await prisma.contact.update({
      where: { id: contactId },
      data: { scoreDirty: true },
    });
  }

  // Domain handoff: if intent is warm and contact is on cold tier, trigger handoff
  if (contactId && isWarmIntent(analysis.intent)) {
    try {
      await triggerDomainHandoff({
        contactId,
        intent: analysis.intent,
        channel,
        reasoning: `Reply sentiment: ${analysis.sentiment}. Confidence delta: ${analysis.confidenceDelta > 0 ? "+" : ""}${analysis.confidenceDelta}. Key points: ${analysis.keyPoints.join("; ")}`,
      });
    } catch (err) {
      console.error(`Domain handoff failed for contact ${contactId}:`, err);
    }
  }

  // Channel coordination: notify the coordinator about the reply
  if (contactId) {
    try {
      await onReplyReceived(contactId, channel as "email" | "linkedin" | "phone");
    } catch (err) {
      console.error(`Channel coordination failed for contact ${contactId}:`, err);
    }
  }

  // BANT extraction: auto-extract qualification data from every inbound message
  if (contactId) {
    try {
      await extractBANT(content, contactId, channel);
    } catch (err) {
      console.error(`BANT extraction failed for contact ${contactId}:`, err);
    }
  }

  // Lead pipeline auto-advance: reply received → "connected"
  if (contactId) {
    try {
      const leads = await prisma.lead.findMany({
        where: { contactId, stage: { in: ["new", "attempting"] } },
      });
      for (const lead of leads) {
        await advanceLeadStage(lead.id, "connected", "ai_auto", "Reply received from prospect");
      }
    } catch (err) {
      console.error(`Lead pipeline advance failed for contact ${contactId}:`, err);
    }
  }

  // Lifecycle auto-advance based on intent
  if (contactId && analysis.intent === "meeting_request") {
    try {
      await advanceContactStage(contactId, "sql", "ai_auto", "Meeting request received — advancing to SQL");
    } catch (err) {
      // Forward-only enforcement may block this (contact already at SQL+), which is expected
      console.warn(`Lifecycle advance to SQL skipped for ${contactId}:`, err instanceof Error ? err.message : err);
    }
  }

  // Execute auto-actions
  for (const action of analysis.autoActions) {
    try {
      await executeAutoAction(action, contactId, dealContext?.id);
    } catch (err) {
      console.error(`Auto-action "${action.type}" failed for contact ${contactId}:`, err);
    }
  }

  // Create insight with full reasoning
  if (analysis.urgency === "immediate" || analysis.intent === "meeting_request" || analysis.objection?.severity === "hard") {
    await prisma.aIInsight.create({
      data: {
        type: analysis.intent === "meeting_request" ? "meeting_suggestion" : analysis.objection ? "deal_risk" : "hot_lead",
        title: `${contactContext?.name || "Contact"}: ${analysis.intent}${analysis.objection ? ` (${analysis.objection.type})` : ""}`,
        description: analysis.keyPoints.join(". "),
        reasoning: `Reply analyzed on ${channel}. Sentiment: ${analysis.sentiment}. Confidence delta: ${analysis.confidenceDelta > 0 ? "+" : ""}${analysis.confidenceDelta}. ${analysis.objection ? `Objection: "${analysis.objection.verbatim}"` : ""}`,
        priority: analysis.urgency === "immediate" ? "critical" : "high",
        resourceType: dealContext ? "deal" : "contact",
        resourceId: dealContext?.id || contactId || "",
        actionItems: JSON.stringify(analysis.autoActions),
        actionsTaken: JSON.stringify(analysis.autoActions.map((a) => a.action)),
        status: "auto_actioned",
      },
    });
  }

  return analysis;
}

async function executeAutoAction(
  action: ReplyAnalysis["autoActions"][0],
  contactId?: string,
  dealId?: string
) {
  switch (action.type) {
    case "update_lifecycle":
      if (contactId) {
        const { advanceContactStage: advStage } = await import("./lifecycle-engine");
        await advStage(
          contactId,
          action.config.stage as any,
          "ai_auto",
          action.reason || `Auto-action: advance to ${action.config.stage}`
        );
      }
      break;
    case "update_lead_score":
      if (contactId) {
        const contact = await prisma.contact.findUnique({ where: { id: contactId } });
        if (contact) {
          await prisma.contact.update({
            where: { id: contactId },
            data: { leadScore: Math.max(0, Math.min(100, contact.leadScore + (action.config.delta as number))) },
          });
        }
      }
      break;
    case "pause_sequences":
      if (contactId) {
        await prisma.sequenceEnrollment.updateMany({
          where: { contactId, status: "active" },
          data: { status: "paused" },
        });
        // Also update channel lock
        await prisma.channelLock.updateMany({
          where: { contactId },
          data: { lastResponseAt: new Date() },
        });
      }
      break;
    case "mark_unqualified":
      if (contactId) {
        // Mark as unqualified (lead status only — lifecycle stays at current stage, no backward moves)
        await prisma.contact.update({
          where: { id: contactId },
          data: { leadStatus: "unqualified" },
        });
        await prisma.sequenceEnrollment.updateMany({
          where: { contactId, status: "active" },
          data: { status: "completed" },
        });
        // Record in audit trail even though lifecycle stage doesn't change
        await prisma.lifecycleTransition.create({
          data: {
            objectType: "contact",
            objectId: contactId,
            fromStage: "current",
            toStage: "unqualified_status",
            triggeredBy: "ai_auto",
            reason: action.reason || "AI marked contact as unqualified based on reply analysis",
            metadata: JSON.stringify({ leadStatus: "unqualified", sequencesStopped: true }),
          },
        });
      }
      break;
    case "create_task":
      if (contactId) {
        const admin = await prisma.user.findFirst({ where: { role: "admin" } });
        if (admin) {
          await prisma.task.create({
            data: {
              title: action.config.title as string || action.action,
              description: action.reason,
              type: "follow_up",
              priority: "high",
              userId: admin.id,
              contactId,
              dueDate: action.config.dueDate
                ? new Date(action.config.dueDate as string)
                : new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
            },
          });
        }
      }
      break;
    case "create_deal":
      if (contactId) {
        const existingDeal = await prisma.deal.findFirst({
          where: { contactId, stage: { notIn: ["closed_won", "closed_lost"] } },
        });
        if (!existingDeal) {
          const dealContact = await prisma.contact.findUnique({
            where: { id: contactId },
            include: { company: true },
          });
          if (dealContact) {
            await prisma.deal.create({
              data: {
                name: `${dealContact.firstName} ${dealContact.lastName} - ${dealContact.company?.name || "Deal"}`,
                stage: "discovery",
                pipeline: "new_business",
                probability: 10,
                stageEnteredAt: new Date(),
                contactId,
                companyId: dealContact.companyId,
              },
            });
          }
        }
      }
      break;
    case "schedule_meeting":
      if (contactId) {
        const meetingContact = await prisma.contact.findUnique({
          where: { id: contactId },
          select: { firstName: true, lastName: true, email: true },
        });
        if (meetingContact) {
          // Create a meeting record in CRM
          await prisma.meeting.create({
            data: {
              title: `Discovery Call - ${meetingContact.firstName} ${meetingContact.lastName}`,
              description: action.reason || "Auto-created from meeting request reply",
              startTime: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // placeholder: 2 days from now
              endTime: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000 + 30 * 60 * 1000),
              type: "consultation",
              contactId,
              status: "requested",
            },
          });
          // Pause sequences while meeting is being scheduled
          await prisma.sequenceEnrollment.updateMany({
            where: { contactId, status: "active" },
            data: { status: "paused" },
          });
          // Send booking link reply via Gmail
          if (meetingContact.email && process.env.EMAIL_SIGNATURE_BOOKING_URL) {
            const { sendEmail } = await import("@/lib/integrations/gmail");
            await sendEmail({
              to: meetingContact.email,
              subject: `Let's find a time — ${meetingContact.firstName}`,
              body: `Hi ${meetingContact.firstName},\n\nGreat to hear from you. Here's my calendar — pick any time that works:\n\n${process.env.EMAIL_SIGNATURE_BOOKING_URL}\n\nLooking forward to it.`,
            });
          }
        }
      }
      break;
    case "send_reply":
      if (contactId) {
        const replyContact = await prisma.contact.findUnique({
          where: { id: contactId },
          select: { email: true, firstName: true },
        });
        if (replyContact?.email && action.config.body) {
          const { sendEmail } = await import("@/lib/integrations/gmail");
          await sendEmail({
            to: replyContact.email,
            subject: (action.config.subject as string) || `Re: ${replyContact.firstName}`,
            body: action.config.body as string,
          });
          await prisma.aIConversationLog.create({
            data: {
              contactId,
              channel: "email",
              direction: "outbound",
              rawContent: action.config.body as string,
              aiSummary: `Auto-reply: ${action.reason || "objection handling"}`,
              autoActioned: true,
            },
          });
        }
      }
      break;
    case "enroll_sequence":
      if (contactId && action.config.sequenceId) {
        // Check if already enrolled
        const existingEnrollment = await prisma.sequenceEnrollment.findFirst({
          where: { contactId, status: "active" },
        });
        if (!existingEnrollment) {
          await prisma.sequenceEnrollment.create({
            data: {
              sequenceId: action.config.sequenceId as string,
              contactId,
              status: "active",
              channel: (action.config.channel as string) || "email",
              currentStep: 0,
              nextActionAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // start tomorrow
            },
          });
        }
      }
      break;
    case "escalate_channel":
      if (contactId) {
        // Create urgent task for manual follow-up via escalated channel
        const escalateAdmin = await prisma.user.findFirst({ where: { role: "admin" } });
        if (escalateAdmin) {
          await prisma.task.create({
            data: {
              title: `Escalate to ${action.config.channel || "phone"}: ${action.reason || "high-intent contact"}`,
              description: `Contact requires escalation to ${action.config.channel || "phone"} channel. Original channel is not progressing.`,
              type: "call",
              priority: "urgent",
              userId: escalateAdmin.id,
              contactId,
              dueDate: new Date(Date.now() + 4 * 60 * 60 * 1000), // 4 hours from now
            },
          });
        }
        // If Vapi is configured and escalation is to phone, attempt AI call
        if ((action.config.channel === "phone" || !action.config.channel) && process.env.VAPI_API_KEY) {
          const escalateContact = await prisma.contact.findUnique({
            where: { id: contactId },
            select: { phone: true, firstName: true },
          });
          if (escalateContact?.phone) {
            try {
              const { vapi } = await import("@/lib/integrations/vapi");
              const assistants = await vapi.assistants.list();
              const defaultAssistant = assistants[0];
              if (defaultAssistant) {
                await vapi.calls.create({
                  assistantId: defaultAssistant.id,
                  customer: {
                    number: escalateContact.phone,
                    name: escalateContact.firstName || undefined,
                  },
                });
              }
            } catch (err) {
              console.error(`[reply-analyzer] Vapi escalation call failed for ${contactId}:`, err);
            }
          }
        }
      }
      break;
  }
}
