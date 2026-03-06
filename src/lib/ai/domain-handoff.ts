// Domain Handoff — Cold to Warm transition
// Instantly pre-warmed domains handle cold outreach.
// The moment Claude detects warm intent (positive reply, meeting request, interest),
// Instantly stops and the next touchpoint comes from the branded agency domain.
//
// Cold = Instantly (pre-warmed Google accounts, shared US IP, high-volume prospecting)
// Warm = Branded domain (real agency identity, MQL conversations, SQL progression, proposals, close)

import { prisma } from "@/lib/prisma";
import { instantly } from "@/lib/integrations/instantly";
import { runAIJob } from "./job-runner";
import { safeParseJSON } from "@/lib/safe-json";

type WarmIntent = "interested" | "meeting_request" | "referral" | "question";

const WARM_INTENTS: WarmIntent[] = ["interested", "meeting_request", "referral", "question"];

const BRANDED_DOMAIN = () => process.env.BRANDED_AGENCY_DOMAIN || "";
const BRANDED_FROM_NAME = () => process.env.BRANDED_FROM_NAME || "";
const BRANDED_FROM_EMAIL = () => process.env.BRANDED_FROM_EMAIL || "";

// Check if an intent warrants domain handoff
export function isWarmIntent(intent: string): boolean {
  return WARM_INTENTS.includes(intent as WarmIntent);
}

// Trigger domain handoff when Claude detects warm intent
export async function triggerDomainHandoff(params: {
  contactId: string;
  intent: string;
  channel: string;
  reasoning?: string;
}): Promise<string | null> {
  const { contactId, intent, channel, reasoning } = params;

  // Only handoff if contact is still on cold tier
  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    include: {
      company: true,
      sequenceEnrollments: { where: { status: "active" }, include: { sequence: true } },
    },
  });

  if (!contact || contact.domainTier === "warm") return null;

  // Find the active Instantly campaign for this contact
  const instantlyCampaign = await findInstantlyCampaign(contact.email);

  // Find active sequence enrollments (these are the Instantly-driven sequences)
  const activeEnrollments = contact.sequenceEnrollments;

  // Step 1: Stop Instantly sequence
  if (instantlyCampaign?.instantlyId) {
    try {
      // Remove lead from Instantly campaign (stops all further cold emails)
      await instantly.campaigns.pause(instantlyCampaign.instantlyId);
    } catch (err) {
      console.error("Failed to pause Instantly campaign during handoff:", err);
    }
  }

  // Step 2: Pause all active cold sequence enrollments
  for (const enrollment of activeEnrollments) {
    await prisma.sequenceEnrollment.update({
      where: { id: enrollment.id },
      data: { status: "completed", completedAt: new Date() },
    });
  }

  // Step 3: Generate the warm touchpoint using AI
  const warmTouchpoint = await generateWarmTouchpoint({
    contact,
    intent,
    channel,
  });

  // Step 4: Create the handoff record
  const handoff = await prisma.domainHandoff.create({
    data: {
      contactId,
      fromDomain: instantlyCampaign?.name || "instantly-prewarmed",
      toDomain: BRANDED_DOMAIN() || "branded-agency",
      triggerIntent: intent,
      triggerChannel: channel,
      instantlyCampaignId: instantlyCampaign?.id,
      sequenceEnrollmentId: activeEnrollments[0]?.id,
      handoffStatus: "queued",
      nextTouchpoint: JSON.stringify(warmTouchpoint),
      reasoning: reasoning || `Intent shifted to ${intent} on ${channel}. Transitioning from cold outreach to branded domain.`,
    },
  });

  // Step 5: Update contact to warm tier
  await prisma.contact.update({
    where: { id: contactId },
    data: { domainTier: "warm" },
  });

  // Step 6: If there's a warm sequence configured, enroll them
  const warmSequence = await prisma.sequence.findFirst({
    where: {
      isActive: true,
      name: { contains: "warm" },
    },
  });

  if (warmSequence) {
    await prisma.sequenceEnrollment.create({
      data: {
        sequenceId: warmSequence.id,
        contactId,
        status: "active",
        channel: channel === "linkedin" ? "linkedin" : "email",
        nextActionAt: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 hours from now
        metadata: JSON.stringify({
          domainHandoff: true,
          handoffId: handoff.id,
          triggerIntent: intent,
          brandedDomain: BRANDED_DOMAIN(),
        }),
      },
    });

    await prisma.domainHandoff.update({
      where: { id: handoff.id },
      data: { warmSequenceId: warmSequence.id },
    });
  }

  // Step 7: Create insight for visibility
  await prisma.aIInsight.create({
    data: {
      type: "lifecycle_transition",
      title: `Domain handoff: ${contact.firstName} ${contact.lastName} moved to branded domain`,
      description: `Cold outreach stopped. ${intent} detected on ${channel}. Next touchpoint queued from ${BRANDED_DOMAIN() || "branded domain"}.`,
      reasoning: `Reply analysis classified intent as "${intent}". Contact was on cold tier (Instantly pre-warmed domains). Automatically stopped Instantly sequence and queued warm touchpoint from branded agency domain. ${reasoning || ""}`,
      priority: intent === "meeting_request" ? "critical" : "high",
      resourceType: "contact",
      resourceId: contactId,
      actionItems: JSON.stringify([
        { action: "Warm touchpoint queued", scheduled: warmTouchpoint.scheduledAt },
        warmSequence ? { action: `Enrolled in warm sequence: ${warmSequence.name}` } : null,
      ].filter(Boolean)),
      actionsTaken: JSON.stringify([
        "Instantly campaign paused",
        "Cold sequence enrollments completed",
        "Contact domain tier updated to warm",
        "Warm touchpoint generated and queued",
      ]),
      status: "auto_actioned",
    },
  });

  return handoff.id;
}

// Find Instantly campaign that has this contact's email
async function findInstantlyCampaign(email: string | null): Promise<{
  id: string;
  instantlyId: string | null;
  name: string;
} | null> {
  if (!email) return null;

  const campaigns = await prisma.instantlyCampaign.findMany({
    where: { status: "active" },
  });

  for (const campaign of campaigns) {
    const leads = safeParseJSON(campaign.leads, []);
    if (Array.isArray(leads) && leads.some((l: { email?: string }) => l.email === email)) {
      return { id: campaign.id, instantlyId: campaign.instantlyId, name: campaign.name };
    }
  }

  return null;
}

// Generate the first warm touchpoint from branded domain
async function generateWarmTouchpoint(params: {
  contact: { firstName: string; lastName: string; email: string | null; jobTitle: string | null; company: { name: string; industry: string | null } | null };
  intent: string;
  channel: string;
}): Promise<{ type: string; subject: string; body: string; scheduledAt: string }> {
  const result = await runAIJob("email_composer", "warm_handoff_email", {
    contact: {
      name: `${params.contact.firstName} ${params.contact.lastName}`,
      email: params.contact.email,
      jobTitle: params.contact.jobTitle,
      company: params.contact.company?.name,
      industry: params.contact.company?.industry,
    },
    intent: params.intent,
    channel: params.channel,
    brandedDomain: BRANDED_DOMAIN(),
    fromName: BRANDED_FROM_NAME(),
    fromEmail: BRANDED_FROM_EMAIL(),
    instructions: `Write the FIRST email that will come from our branded agency domain (${BRANDED_DOMAIN() || "agency domain"}).

This contact just showed ${params.intent} intent on ${params.channel}. They were previously receiving cold outreach from pre-warmed Instantly domains.

This email must:
1. Come across as a natural continuation, NOT a new cold email
2. Reference their interest/reply naturally
3. Be from the real agency identity (use ${BRANDED_FROM_NAME() || "the founder"})
4. Feel personal and direct — one person to another
5. Include a clear next step (calendar link, specific time suggestion, or direct question)

DO NOT mention domain changes, Instantly, or that they were in a cold sequence. This should feel like the founder personally reaching out because they noticed the interest.

Return JSON: { subject, body }`,
  });

  const email = result.output as { subject: string; body: string };

  return {
    type: "email",
    subject: email.subject,
    body: email.body,
    scheduledAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // 2 hours
  };
}

// Process queued handoffs — send the warm touchpoints
export async function processHandoffQueue(): Promise<number> {
  const pending = await prisma.domainHandoff.findMany({
    where: { handoffStatus: "queued" },
    take: 10,
  });

  let processed = 0;

  for (const handoff of pending) {
    try {
      const touchpoint = safeParseJSON<{ scheduledAt: string; subject: string; body: string } | null>(handoff.nextTouchpoint, null);
      if (!touchpoint) continue;

      const scheduledAt = new Date(touchpoint.scheduledAt);
      if (scheduledAt > new Date()) continue; // not yet time

      // Look up the contact's email for sending
      const handoffContact = await prisma.contact.findUnique({
        where: { id: handoff.contactId },
        select: { email: true, firstName: true, lastName: true },
      });

      if (!handoffContact?.email) {
        await prisma.domainHandoff.update({
          where: { id: handoff.id },
          data: { handoffStatus: "failed" },
        });
        continue;
      }

      // Send via Gmail API (branded domain) — if this fails, the handoff FAILS
      const { sendEmail } = await import("@/lib/integrations/gmail");
      const gmailResult = await sendEmail({
        to: handoffContact.email,
        subject: touchpoint.subject,
        body: touchpoint.body,
        fromName: BRANDED_FROM_NAME() || undefined,
      });

      // Only log activity and mark as sent AFTER confirmed Gmail delivery
      const adminUser = await prisma.user.findFirst({ where: { role: "admin" } });
      await prisma.activity.create({
        data: {
          type: "email",
          subject: touchpoint.subject,
          body: touchpoint.body,
          userId: adminUser?.id || "",
          contactId: handoff.contactId,
        },
      });

      await prisma.aIConversationLog.create({
        data: {
          contactId: handoff.contactId,
          channel: "email",
          direction: "outbound",
          rawContent: touchpoint.body,
          aiSummary: `Domain handoff: first warm touchpoint from branded domain. Intent: ${handoff.triggerIntent}`,
          metadata: JSON.stringify({
            gmailMessageId: gmailResult.messageId,
            gmailThreadId: gmailResult.threadId,
            sentVia: "gmail_api",
          }),
        },
      });

      await prisma.domainHandoff.update({
        where: { id: handoff.id },
        data: { handoffStatus: "sent", completedAt: new Date() },
      });

      processed++;
    } catch (err) {
      console.error(`Domain handoff failed for ${handoff.id}:`, err);
      await prisma.domainHandoff.update({
        where: { id: handoff.id },
        data: { handoffStatus: "failed" },
      });
    }
  }

  return processed;
}

// Get handoff stats for dashboard
export async function getHandoffStats(): Promise<{
  totalHandoffs: number;
  pendingHandoffs: number;
  completedHandoffs: number;
  avgTimeToHandoff: number | null;
}> {
  const [total, pending, completed] = await Promise.all([
    prisma.domainHandoff.count(),
    prisma.domainHandoff.count({ where: { handoffStatus: { in: ["pending", "queued"] } } }),
    prisma.domainHandoff.count({ where: { handoffStatus: "sent" } }),
  ]);

  return {
    totalHandoffs: total,
    pendingHandoffs: pending,
    completedHandoffs: completed,
    avgTimeToHandoff: null, // calculated from conversion feedback
  };
}
