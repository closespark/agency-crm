// Pre-Meeting Brief Generator
// Automatically compiles everything you need before walking into a meeting

import { prisma } from "@/lib/prisma";
import { runAIJob } from "./job-runner";

interface MeetingBriefData {
  contactSummary: string;
  touchpointHistory: {
    date: string;
    channel: string;
    type: string;
    content: string;
    theirResponse?: string;
  }[];
  engagementHighlights: string;
  painPoints: string;
  likelyObjections: { objection: string; handling: string }[];
  recommendedAngle: string;
  competitorMentions: string[];
  companyContext: string;
}

export async function generateMeetingBrief(meetingId: string): Promise<string> {
  const meeting = await prisma.meeting.findUnique({ where: { id: meetingId } });
  if (!meeting) throw new Error("Meeting not found");

  const contactId = meeting.contactId;
  if (!contactId) throw new Error("Meeting has no contact");

  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    include: {
      company: true,
      activities: { orderBy: { createdAt: "asc" } },
      deals: { orderBy: { createdAt: "desc" }, take: 1 },
      emailEvents: { orderBy: { createdAt: "asc" } },
      sequenceEnrollments: { include: { sequence: true } },
    },
  });

  if (!contact) throw new Error("Contact not found");

  // Get all conversation logs for this contact
  const conversationLogs = await prisma.aIConversationLog.findMany({
    where: { contactId },
    orderBy: { createdAt: "asc" },
  });

  // Build the full touchpoint history
  const touchpoints = [
    ...contact.activities.map((a) => ({
      date: a.createdAt.toISOString(),
      channel: a.type === "email" ? "email" : a.type === "meeting" ? "meeting" : "other",
      type: a.type,
      content: `${a.subject || ""}: ${a.body?.slice(0, 200) || ""}`,
      direction: "outbound",
    })),
    ...contact.emailEvents.map((e) => ({
      date: e.createdAt.toISOString(),
      channel: "email",
      type: e.type,
      content: `Email ${e.type}`,
      direction: "inbound",
    })),
    ...conversationLogs.map((l) => ({
      date: l.createdAt.toISOString(),
      channel: l.channel,
      type: l.direction,
      content: l.rawContent.slice(0, 300),
      sentiment: l.sentiment,
      intent: l.intent,
      objection: l.objectionVerbatim,
      direction: l.direction,
    })),
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Extract objections from conversation logs
  const objections = conversationLogs
    .filter((l) => l.objectionType && l.objectionVerbatim)
    .map((l) => ({ type: l.objectionType!, verbatim: l.objectionVerbatim! }));

  const input = {
    contact: {
      name: `${contact.firstName} ${contact.lastName}`,
      email: contact.email,
      jobTitle: contact.jobTitle,
      lifecycleStage: contact.lifecycleStage,
      leadScore: contact.leadScore,
      source: contact.source,
    },
    company: contact.company ? {
      name: contact.company.name,
      industry: contact.company.industry,
      size: contact.company.size,
      revenue: contact.company.revenue,
      description: contact.company.description,
    } : null,
    deal: contact.deals[0] ? {
      name: contact.deals[0].name,
      amount: contact.deals[0].amount,
      stage: contact.deals[0].stage,
    } : null,
    touchpoints,
    objections,
    meeting: {
      title: meeting.title,
      description: meeting.description,
      startTime: meeting.startTime,
    },
    instructions: `Generate a concise pre-meeting brief. Include:
1. contactSummary: Who they are, their role, how they entered the pipeline, and what triggered this meeting
2. touchpointHistory: Summarize every interaction chronologically — what was sent, what they opened, what they replied to
3. engagementHighlights: What specific content/messages they responded to most positively
4. painPoints: The specific pain point or signal they responded to
5. likelyObjections: Based on their replies, predict 2-3 objections with suggested handling
6. recommendedAngle: The best approach for this call based on their engagement history
7. competitorMentions: Any competitor mentions from their replies
8. companyContext: Recent company context (based on industry, size, hiring signals)

Write in direct, actionable language. No fluff. This brief should let me walk into the meeting knowing everything.`,
  };

  const result = await runAIJob("deal_advisor", "meeting_brief", input, { contactId, dealId: contact.deals[0]?.id });
  const brief = result.output as MeetingBriefData;

  // Save the brief
  await prisma.meetingBrief.upsert({
    where: { meetingId },
    create: {
      meetingId,
      contactId,
      dealId: contact.deals[0]?.id,
      contactSummary: brief.contactSummary,
      touchpointHistory: JSON.stringify(brief.touchpointHistory),
      engagementHighlights: brief.engagementHighlights,
      painPoints: brief.painPoints,
      likelyObjections: JSON.stringify(brief.likelyObjections),
      recommendedAngle: brief.recommendedAngle,
      competitorMentions: JSON.stringify(brief.competitorMentions),
      companyContext: brief.companyContext,
    },
    update: {
      contactSummary: brief.contactSummary,
      touchpointHistory: JSON.stringify(brief.touchpointHistory),
      engagementHighlights: brief.engagementHighlights,
      painPoints: brief.painPoints,
      likelyObjections: JSON.stringify(brief.likelyObjections),
      recommendedAngle: brief.recommendedAngle,
      competitorMentions: JSON.stringify(brief.competitorMentions),
      companyContext: brief.companyContext,
    },
  });

  return meeting.id;
}

// Auto-generate briefs for all upcoming meetings
export async function generateUpcomingBriefs(): Promise<number> {
  const upcoming = await prisma.meeting.findMany({
    where: {
      startTime: {
        gte: new Date(),
        lte: new Date(Date.now() + 24 * 60 * 60 * 1000), // next 24 hours
      },
      status: "scheduled",
      contactId: { not: null },
    },
  });

  let generated = 0;
  for (const meeting of upcoming) {
    const existing = await prisma.meetingBrief.findUnique({ where: { meetingId: meeting.id } });
    if (!existing) {
      try {
        await generateMeetingBrief(meeting.id);
        generated++;
      } catch { /* skip */ }
    }
  }
  return generated;
}
