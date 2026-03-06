// BANT Extractor — auto-extracts Budget, Authority, Need, Timeline from conversations
// After every call transcript, email reply, or chat message, this extracts BANT fields
// and populates the contact record. No manual data entry.

import { prisma } from "@/lib/prisma";
import { runAIJob } from "./job-runner";
import { safeParseJSON } from "@/lib/safe-json";

interface BANTExtraction {
  budget: {
    status: "confirmed" | "unconfirmed" | "no_budget" | "not_mentioned";
    verbatim: string | null; // exact words about budget
    range?: string; // "$5K-$10K" etc.
    confidence: number; // 0-1
  };
  authority: {
    status: "decision_maker" | "influencer" | "no_authority" | "not_mentioned";
    verbatim: string | null;
    otherStakeholders?: string[];
    confidence: number;
  };
  need: {
    status: "confirmed" | "exploring" | "no_need" | "not_mentioned";
    verbatim: string | null;
    painPoints?: string[];
    confidence: number;
  };
  timeline: {
    status: "immediate" | "1_3_months" | "3_6_months" | "6_plus_months" | "no_timeline" | "not_mentioned";
    verbatim: string | null;
    deadline?: string;
    confidence: number;
  };
  bantScore: number; // 0-4 count of confirmed criteria
  overallConfidence: number;
}

export async function extractBANT(
  content: string,
  contactId: string,
  channel: string = "email"
): Promise<BANTExtraction> {
  // Get existing BANT data to provide context
  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    select: {
      firstName: true,
      lastName: true,
      jobTitle: true,
      bantBudget: true,
      bantAuthority: true,
      bantNeed: true,
      bantTimeline: true,
      bantNotes: true,
    },
  });

  const existingNotes = safeParseJSON<Record<string, unknown>>(contact?.bantNotes, {});

  const result = await runAIJob("reply_analyzer", "bant_extraction", {
    message: content,
    channel,
    contact: contact
      ? { name: `${contact.firstName} ${contact.lastName}`, jobTitle: contact.jobTitle }
      : null,
    existingBANT: {
      budget: contact?.bantBudget,
      authority: contact?.bantAuthority,
      need: contact?.bantNeed,
      timeline: contact?.bantTimeline,
    },
    instructions: `Extract BANT qualification data from this message. For each criterion:

1. BUDGET: Did they mention budget, pricing, cost, investment? Quote their exact words. Classify: confirmed (they have budget), unconfirmed (discussed but not committed), no_budget (explicitly said no budget), not_mentioned.

2. AUTHORITY: Are they the decision-maker? Did they mention others who need to approve? Quote exact words. Classify: decision_maker, influencer (needs approval from others), no_authority, not_mentioned.

3. NEED: Did they articulate a specific pain point or need your service solves? Quote exact words. List pain points. Classify: confirmed (clear need), exploring (interested but vague), no_need, not_mentioned.

4. TIMELINE: Did they mention when they want this done? Quote exact words. Classify: immediate (this month), 1_3_months, 3_6_months, 6_plus_months, no_timeline, not_mentioned.

For each, give a confidence score 0-1. Only mark as "confirmed" if you're 80%+ confident.
Calculate bantScore: count of criteria where status is confirmed/decision_maker/immediate/1_3_months.
Return: { budget, authority, need, timeline, bantScore, overallConfidence }`,
  }, { contactId });

  const extraction = result.output as BANTExtraction;

  // Update contact BANT fields (only upgrade, never downgrade)
  const updates: Record<string, unknown> = {};
  const notes = { ...existingNotes };

  // Budget
  if (extraction.budget.status !== "not_mentioned") {
    if (!contact?.bantBudget || contact.bantBudget === "unconfirmed" || extraction.budget.status === "confirmed") {
      updates.bantBudget = extraction.budget.status;
    }
    if (extraction.budget.verbatim) {
      notes.budget = extraction.budget.verbatim;
      if (extraction.budget.range) notes.budgetRange = extraction.budget.range;
    }
  }

  // Authority
  if (extraction.authority.status !== "not_mentioned") {
    if (!contact?.bantAuthority || extraction.authority.status === "decision_maker") {
      updates.bantAuthority = extraction.authority.status;
    }
    if (extraction.authority.verbatim) {
      notes.authority = extraction.authority.verbatim;
      if (extraction.authority.otherStakeholders) notes.stakeholders = extraction.authority.otherStakeholders;
    }
  }

  // Need
  if (extraction.need.status !== "not_mentioned") {
    if (!contact?.bantNeed || contact.bantNeed === "exploring" || extraction.need.status === "confirmed") {
      updates.bantNeed = extraction.need.status;
    }
    if (extraction.need.verbatim) {
      notes.need = extraction.need.verbatim;
      if (extraction.need.painPoints) notes.painPoints = extraction.need.painPoints;
    }
  }

  // Timeline
  if (extraction.timeline.status !== "not_mentioned") {
    const timelineRank: Record<string, number> = {
      no_timeline: 0, "6_plus_months": 1, "3_6_months": 2, "1_3_months": 3, immediate: 4,
    };
    const currentRank = timelineRank[contact?.bantTimeline || "no_timeline"] || 0;
    const newRank = timelineRank[extraction.timeline.status] || 0;
    if (newRank > currentRank) {
      updates.bantTimeline = extraction.timeline.status;
    }
    if (extraction.timeline.verbatim) {
      notes.timeline = extraction.timeline.verbatim;
      if (extraction.timeline.deadline) notes.deadline = extraction.timeline.deadline;
    }
  }

  // Calculate BANT score
  const currentContact = await prisma.contact.findUnique({
    where: { id: contactId },
    select: { bantBudget: true, bantAuthority: true, bantNeed: true, bantTimeline: true },
  });

  // Merge with updates to get final state
  const finalBudget = (updates.bantBudget as string) || currentContact?.bantBudget;
  const finalAuthority = (updates.bantAuthority as string) || currentContact?.bantAuthority;
  const finalNeed = (updates.bantNeed as string) || currentContact?.bantNeed;
  const finalTimeline = (updates.bantTimeline as string) || currentContact?.bantTimeline;

  const bantScore = [
    finalBudget === "confirmed",
    finalAuthority === "decision_maker",
    finalNeed === "confirmed",
    ["immediate", "1_3_months"].includes(finalTimeline || ""),
  ].filter(Boolean).length;

  updates.bantScore = bantScore;
  updates.bantNotes = JSON.stringify(notes);
  updates.bantLastUpdated = new Date();
  updates.scoreDirty = true; // trigger re-score on next batch

  if (Object.keys(updates).length > 0) {
    await prisma.contact.update({
      where: { id: contactId },
      data: updates,
    });
  }

  // Store BANT extraction in conversation log
  await prisma.aIConversationLog.updateMany({
    where: {
      contactId,
      rawContent: content,
      createdAt: { gte: new Date(Date.now() - 60000) }, // within last minute
    },
    data: {
      bantExtracted: JSON.stringify(extraction),
    },
  });

  return extraction;
}

// Batch extract BANT from all unprocessed conversations for a contact
export async function backfillBANT(contactId: string): Promise<number> {
  const logs = await prisma.aIConversationLog.findMany({
    where: {
      contactId,
      direction: "inbound",
      bantExtracted: null,
    },
    orderBy: { createdAt: "asc" },
  });

  let processed = 0;
  for (const log of logs) {
    await extractBANT(log.rawContent, contactId, log.channel);
    processed++;
  }

  return processed;
}
