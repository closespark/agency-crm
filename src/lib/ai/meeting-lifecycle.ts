// Meeting Lifecycle Engine — handles the full autonomous loop:
// 1. Pre-meeting: send reminder email (24h before)
// 2. Post-meeting: receive transcript from tl;dv webhook
// 3. Post-meeting: AI analyzes transcript → BANT, deal signals, follow-up email
// 4. Post-meeting: Update CRM (contact, deal stage, engagement score)
// 5. Post-meeting: Send follow-up email with transcript-based content
// 6. Post-meeting: Auto-generate PandaDocs proposal if deal advances
// 7. No-show: detect and send reschedule email
//
// All of this runs autonomously — the only human input is attending the meeting.

import { prisma } from "@/lib/prisma";
import { runAIJob } from "./job-runner";
import { sendEmail } from "@/lib/integrations/gmail";
import { advanceContactStage } from "./lifecycle-engine";

async function getAdminUserId(): Promise<string> {
  const admin = await prisma.user.findFirst({ where: { role: "admin" } });
  if (!admin) throw new Error("No admin user found");
  return admin.id;
}

// ============================================
// 1. PRE-MEETING REMINDERS
// ============================================

/**
 * Sends reminder emails for meetings starting in the next 24 hours.
 * Called by the worker on every tick. Skips meetings that already had reminders sent.
 */
export async function sendMeetingReminders(): Promise<number> {
  const now = new Date();
  const twentyFourHoursFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const upcoming = await prisma.meeting.findMany({
    where: {
      status: "scheduled",
      startTime: { gte: now, lte: twentyFourHoursFromNow },
      reminderSentAt: null,
      contactId: { not: null },
    },
  });

  let sent = 0;

  for (const meeting of upcoming) {
    try {
      const contact = await prisma.contact.findUnique({
        where: { id: meeting.contactId! },
      });
      if (!contact?.email) continue;

      const formattedDate = meeting.startTime.toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
      });
      const formattedTime = meeting.startTime.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });

      const senderName = process.env.EMAIL_SIGNATURE_NAME || process.env.BRANDED_FROM_NAME || "The team";

      await sendEmail({
        to: contact.email,
        subject: `Reminder: Our meeting tomorrow at ${formattedTime}`,
        body: `<div>
          <p>Hi ${contact.firstName},</p>
          <p>Quick reminder — we're meeting tomorrow, <strong>${formattedDate}</strong> at <strong>${formattedTime}</strong>.</p>
          ${meeting.description ? `<p>For context, here's what you mentioned: <em>"${meeting.description.split("\n")[0]}"</em></p>` : ""}
          <p>If there's anything specific you'd like to cover, feel free to reply and let me know — I'll come prepared.</p>
          <p>See you then,<br>${senderName}</p>
        </div>`,
      });

      await prisma.meeting.update({
        where: { id: meeting.id },
        data: { reminderSentAt: new Date() },
      });

      sent++;
    } catch (err) {
      console.error(`[meeting-lifecycle] Failed to send reminder for meeting ${meeting.id}:`, err);
    }
  }

  return sent;
}

// ============================================
// 2. NO-SHOW DETECTION
// ============================================

/**
 * Detects meetings that ended 30+ minutes ago but are still "scheduled" (no transcript received).
 * Marks them as no_show and sends a reschedule email.
 */
export async function detectNoShows(): Promise<number> {
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

  const noShows = await prisma.meeting.findMany({
    where: {
      status: "scheduled",
      endTime: { lte: thirtyMinutesAgo },
      contactId: { not: null },
    },
    include: {
      transcript: true,
    },
  });

  let detected = 0;

  for (const meeting of noShows) {
    // If a transcript exists, they showed up — mark as completed instead
    if (meeting.transcript) {
      await prisma.meeting.update({
        where: { id: meeting.id },
        data: { status: "completed" },
      });
      continue;
    }

    try {
      await prisma.meeting.update({
        where: { id: meeting.id },
        data: { status: "no_show" },
      });

      const contact = await prisma.contact.findUnique({
        where: { id: meeting.contactId! },
      });

      if (contact?.email) {
        const senderName = process.env.EMAIL_SIGNATURE_NAME || process.env.BRANDED_FROM_NAME || "The team";
        const bookingUrl = process.env.EMAIL_SIGNATURE_BOOKING_URL;

        await sendEmail({
          to: contact.email,
          subject: "Missed you today — want to reschedule?",
          body: `<div>
            <p>Hi ${contact.firstName},</p>
            <p>Looks like we weren't able to connect today — no worries at all, things come up.</p>
            <p>I'd still love to chat. ${bookingUrl
              ? `You can grab a new time here: <a href="${bookingUrl}">${bookingUrl.replace(/^https?:\/\//, "")}</a>`
              : "Just reply to this email with a time that works and I'll get it on the calendar."}</p>
            <p>Talk soon,<br>${senderName}</p>
          </div>`,
        });

        await prisma.activity.create({
          data: {
            userId: await getAdminUserId(),
            contactId: contact.id,
            type: "email",
            subject: "No-show follow-up sent",
            body: "Automated reschedule email sent after meeting no-show",
          },
        });
      }

      detected++;
    } catch (err) {
      console.error(`[meeting-lifecycle] Failed to process no-show for meeting ${meeting.id}:`, err);
    }
  }

  return detected;
}

// ============================================
// 3. TRANSCRIPT ANALYSIS
// ============================================

interface TranscriptAnalysis {
  summary: string;
  actionItems: { item: string; owner: "us" | "them"; dueDate?: string }[];
  bantExtract: {
    budget: string | null;
    authority: string | null;
    need: string | null;
    timeline: string | null;
    confidence: "low" | "medium" | "high";
  };
  dealSignals: {
    buyIntent: "strong" | "moderate" | "weak" | "none";
    objections: string[];
    nextSteps: string[];
    stageRecommendation: "advance_to_proposal" | "advance_to_negotiation" | "stay" | "close_lost";
    reasoning: string;
  };
  sentiment: string;
  followUpEmail: {
    subject: string;
    body: string;
  };
}

/**
 * Analyzes a meeting transcript and triggers the full post-meeting automation chain.
 * Called when tl;dv webhook delivers a transcript.
 */
export async function processTranscript(meetingId: string): Promise<void> {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    include: { transcript: true },
  });
  if (!meeting?.transcript) throw new Error("No transcript found for meeting");
  if (meeting.transcript.analyzedAt) return; // Already analyzed

  const contactId = meeting.contactId;
  if (!contactId) throw new Error("Meeting has no contact");

  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    include: {
      company: true,
      deals: { where: { stage: { notIn: ["closed_won", "closed_lost"] } }, take: 1 },
    },
  });
  if (!contact) throw new Error("Contact not found");

  // Get pre-meeting brief if available
  const brief = await prisma.meetingBrief.findUnique({ where: { meetingId } });

  const deal = contact.deals[0];

  // Run AI analysis
  const result = await runAIJob("transcript_analyzer", "analyze_transcript", {
    transcript: meeting.transcript.rawTranscript,
    contact: {
      name: `${contact.firstName} ${contact.lastName}`,
      email: contact.email,
      jobTitle: contact.jobTitle,
      company: contact.company?.name,
      lifecycleStage: contact.lifecycleStage,
    },
    deal: deal ? { name: deal.name, stage: deal.stage, amount: deal.amount } : null,
    preMeetingBrief: brief ? {
      painPoints: brief.painPoints,
      recommendedAngle: brief.recommendedAngle,
      likelyObjections: brief.likelyObjections,
    } : null,
    meetingTitle: meeting.title,
  }, { contactId, dealId: deal?.id });

  const analysis = result.output as TranscriptAnalysis;

  // Save analysis to transcript record
  await prisma.meetingTranscript.update({
    where: { meetingId },
    data: {
      summary: analysis.summary,
      actionItems: JSON.stringify(analysis.actionItems),
      bantExtract: JSON.stringify(analysis.bantExtract),
      dealSignals: JSON.stringify(analysis.dealSignals),
      sentiment: analysis.sentiment,
      analyzedAt: new Date(),
    },
  });

  // Mark meeting as completed
  await prisma.meeting.update({
    where: { id: meetingId },
    data: { status: "completed" },
  });

  // === 4. UPDATE CRM FROM TRANSCRIPT ===
  await updateCrmFromAnalysis(contact.id, deal?.id || null, analysis);

  // === 5. SEND FOLLOW-UP EMAIL ===
  await sendFollowUpEmail(contact.id, meetingId, analysis);

  // === 6. AUTO-ADVANCE DEAL + PANDADOCS ===
  if (deal) {
    await handleDealProgression(deal.id, contact.id, analysis);
  }

  // Log to activity timeline
  await prisma.activity.create({
    data: {
      userId: await getAdminUserId(),
      contactId: contact.id,
      type: "meeting",
      subject: `Meeting completed: ${meeting.title}`,
      body: analysis.summary,
    },
  });

  console.log(`[meeting-lifecycle] Processed transcript for meeting ${meetingId}: sentiment=${analysis.sentiment}, buyIntent=${analysis.dealSignals.buyIntent}`);
}

// ============================================
// 4. CRM UPDATES FROM ANALYSIS
// ============================================

async function updateCrmFromAnalysis(
  contactId: string,
  dealId: string | null,
  analysis: TranscriptAnalysis
): Promise<void> {
  const bant = analysis.bantExtract;

  // Update contact BANT fields
  const contactUpdate: Record<string, unknown> = {
    engagementScore: { increment: 15 }, // Meeting attendance = high engagement
    scoreDirty: true,
  };

  if (bant.budget) contactUpdate.bantBudget = bant.budget;
  if (bant.authority) contactUpdate.bantAuthority = bant.authority;
  if (bant.need) contactUpdate.bantNeed = bant.need;
  if (bant.timeline) contactUpdate.bantTimeline = bant.timeline;

  await prisma.contact.update({
    where: { id: contactId },
    data: contactUpdate,
  });

  // Create action item tasks
  const admin = await prisma.user.findFirst({ where: { role: "admin" } });
  if (admin) {
    for (const item of analysis.actionItems.filter((a) => a.owner === "us")) {
      await prisma.task.create({
        data: {
          title: item.item,
          description: `Action item from meeting transcript. Auto-generated.`,
          type: "follow_up",
          priority: "high",
          status: "pending",
          userId: admin.id,
          contactId,
          dueDate: item.dueDate ? new Date(item.dueDate) : new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        },
      });
    }
  }
}

// ============================================
// 5. SEND FOLLOW-UP EMAIL
// ============================================

async function sendFollowUpEmail(
  contactId: string,
  meetingId: string,
  analysis: TranscriptAnalysis
): Promise<void> {
  const contact = await prisma.contact.findUnique({ where: { id: contactId } });
  if (!contact?.email) return;

  try {
    await sendEmail({
      to: contact.email,
      subject: analysis.followUpEmail.subject,
      body: analysis.followUpEmail.body,
    });

    // Mark follow-up as sent
    await prisma.meetingTranscript.update({
      where: { meetingId },
      data: { followUpSent: true },
    });

    await prisma.activity.create({
      data: {
        userId: await getAdminUserId(),
        contactId,
        type: "email",
        subject: analysis.followUpEmail.subject,
        body: "Post-meeting follow-up email sent (AI-generated from transcript)",
      },
    });
  } catch (err) {
    console.error(`[meeting-lifecycle] Failed to send follow-up email for meeting ${meetingId}:`, err);
  }
}

// ============================================
// 6. DEAL PROGRESSION + PANDADOCS
// ============================================

async function handleDealProgression(
  dealId: string,
  contactId: string,
  analysis: TranscriptAnalysis
): Promise<void> {
  const recommendation = analysis.dealSignals.stageRecommendation;

  if (recommendation === "advance_to_proposal") {
    // Advance deal to proposal_sent via lifecycle engine
    const { advanceDealStage } = await import("./lifecycle-engine");

    try {
      await advanceDealStage(dealId, "proposal_sent", "transcript_analysis", analysis.dealSignals.reasoning);

      // Auto-generate PandaDocs proposal
      try {
        const { createProposalFromDeal } = await import("@/lib/integrations/pandadocs");
        await createProposalFromDeal(dealId);
        console.log(`[meeting-lifecycle] Auto-generated PandaDocs proposal for deal ${dealId}`);
      } catch (err) {
        console.error(`[meeting-lifecycle] PandaDocs proposal generation failed for deal ${dealId}:`, err);
        // Create a task to manually generate the proposal
        const admin = await prisma.user.findFirst({ where: { role: "admin" } });
        if (admin) {
          await prisma.task.create({
            data: {
              title: `Generate proposal for deal (PandaDocs auto-generation failed)`,
              description: `AI recommended advancing to proposal after meeting. Auto-generation failed — create manually. Reason: ${analysis.dealSignals.reasoning}`,
              type: "follow_up",
              priority: "critical",
              status: "pending",
              userId: admin.id,
              contactId,
            },
          });
        }
      }
    } catch (err) {
      console.error(`[meeting-lifecycle] Deal advancement failed:`, err);
    }
  } else if (recommendation === "advance_to_negotiation") {
    try {
      const { advanceDealStage } = await import("./lifecycle-engine");
      await advanceDealStage(dealId, "negotiation", "transcript_analysis", analysis.dealSignals.reasoning);
    } catch (err) {
      console.error(`[meeting-lifecycle] Deal advancement to negotiation failed:`, err);
    }
  } else if (recommendation === "close_lost") {
    try {
      const { advanceDealStage } = await import("./lifecycle-engine");
      await advanceDealStage(dealId, "closed_lost", "transcript_analysis", analysis.dealSignals.reasoning);
    } catch (err) {
      console.error(`[meeting-lifecycle] Deal close_lost failed:`, err);
    }
  }

  // If there are objections, create an AI insight
  if (analysis.dealSignals.objections.length > 0) {
    await prisma.aIInsight.create({
      data: {
        type: "deal_risk",
        title: `Objections raised in meeting`,
        description: `During the meeting, the following objections were raised:\n${analysis.dealSignals.objections.map((o) => `- ${o}`).join("\n")}\n\nBuy intent: ${analysis.dealSignals.buyIntent}`,
        reasoning: analysis.dealSignals.reasoning,
        priority: analysis.dealSignals.buyIntent === "weak" || analysis.dealSignals.buyIntent === "none" ? "critical" : "medium",
        resourceType: "deal",
        resourceId: dealId,
        status: "new",
      },
    });
  }
}
