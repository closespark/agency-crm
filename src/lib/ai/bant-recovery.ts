// BANT Gap Recovery — autonomous system that ensures no contact gets stuck at MQL.
// When the mql→sql gate rejects, this module:
// 1. Finds or creates a bant_qualification sequence
// 2. Enrolls the contact with gap context
// 3. Handles sequence completion decisions (re-enroll, Vapi escalate, or disqualify)

import { prisma } from "@/lib/prisma";
import { enrollContactInSequence } from "./sequence-enrollment";
import type { SequenceStep } from "./sequence-generator";

// ============================================
// ENROLL IN BANT QUALIFICATION SEQUENCE
// ============================================

/**
 * Check if contact is already in an active sequence. If not, enroll them
 * in a bant_qualification sequence with gap context.
 */
export async function enrollInBantQualification(
  contactId: string,
  missingFields: string
): Promise<void> {
  // Find or create the bant_qualification sequence
  const sequence = await getOrCreateBantSequence(missingFields);

  // Enroll via single entry point (enforces channel lock + duplicate check)
  const enrollmentId = await enrollContactInSequence({
    sequenceId: sequence.id,
    contactId,
    channel: "email",
    metadata: { bantGapSummary: missingFields, enrollmentReason: "bant_gate_rejection" },
  });
  if (!enrollmentId) return; // already enrolled or opted out

  // Log the recovery action
  await prisma.aIInsight.create({
    data: {
      type: "lifecycle_action",
      title: `BANT gap recovery: enrolled in qualifying sequence`,
      description: `Contact missing BANT fields: ${missingFields}. Auto-enrolled in bant_qualification sequence to extract missing data.`,
      reasoning: `mql→sql gate rejected. System initiated autonomous recovery via targeted qualifying sequence.`,
      priority: "medium",
      resourceType: "contact",
      resourceId: contactId,
      status: "auto_actioned",
    },
  });
}

// ============================================
// FIND OR CREATE BANT QUALIFICATION SEQUENCE
// ============================================

async function getOrCreateBantSequence(missingFields: string): Promise<{ id: string }> {
  // Look for an existing active bant_qualification sequence
  const existing = await prisma.sequence.findFirst({
    where: { type: "bant_qualification", isActive: true },
    select: { id: true },
  });
  if (existing) return existing;

  // Generate a new bant_qualification sequence strategy
  const steps: SequenceStep[] = [
    {
      stepNumber: 1,
      channel: "email",
      delayDays: 0,
      angle: "Reference the discovery conversation and ask a natural follow-up that extracts the missing BANT fields. Position it as wanting to understand their situation better to give a relevant recommendation.",
      goal: "Get the contact to reveal missing BANT data (budget, authority, need, or timeline) through a consultative question",
      tone: "warm, consultative — like a peer who was in the room, not a sales rep filling a checklist",
    },
    {
      stepNumber: 2,
      channel: "email",
      delayDays: 3,
      angle: "Share a relevant case study or insight that naturally invites the contact to share their timeline or budget range. Use what is already known about their pain points to make it specific.",
      goal: "Extract remaining BANT gaps by providing value first — a case study forces a comparison to their own situation",
      tone: "helpful, specific — show you understand their world",
    },
    {
      stepNumber: 3,
      channel: "email",
      delayDays: 4,
      angle: "Direct but respectful check-in. Acknowledge they are busy. Ask one specific question about the most critical missing BANT field. Give them an easy way to respond (binary choice or short answer).",
      goal: "Final email attempt to extract BANT data before escalating to a call",
      tone: "direct, respectful — one clear question, easy to answer",
    },
  ];

  const sequence = await prisma.sequence.create({
    data: {
      name: "BANT Qualification — Gap Recovery",
      description: "Autonomous recovery sequence for MQL contacts blocked at the sql gate due to missing BANT fields. Each step targets specific missing fields using consultative questions, not qualification checklists.",
      type: "bant_qualification",
      steps: JSON.stringify(steps),
      aiGenerated: true,
      isActive: true,
    },
  });

  return { id: sequence.id };
}

// ============================================
// HANDLE BANT RE-CHECK AFTER REPLY
// ============================================

/**
 * Called by reply-analyzer after BANT extraction on a reply from a contact
 * in a bant_qualification sequence. Re-attempts the mql→sql gate.
 */
export async function recheckBantAfterReply(contactId: string): Promise<void> {
  // Lazy import to avoid circular dependency
  const { advanceContactStage } = await import("./lifecycle-engine");

  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    select: {
      lifecycleStage: true,
      bantBudget: true,
      bantAuthority: true,
      bantNeed: true,
      bantTimeline: true,
    },
  });
  if (!contact || contact.lifecycleStage !== "mql") return;

  // Re-attempt advancement (extractBANT already updated the contact's BANT fields)
  const result = await advanceContactStage(contactId, "sql", "ai_auto", "BANT gap filled via qualifying sequence reply");

  if (result.success) {
    // Gate passed — pause the bant_qualification enrollment
    await prisma.sequenceEnrollment.updateMany({
      where: {
        contactId,
        status: "active",
        sequence: { type: "bant_qualification" },
      },
      data: { status: "completed", completedAt: new Date() },
    });

    // Clear the gap summary
    await prisma.contact.update({
      where: { id: contactId },
      data: { bantGapSummary: null },
    });

    console.log(`[bant-recovery] Contact ${contactId} passed mql→sql gate after qualifying reply`);
  } else {
    // Still blocked — update bantGapSummary with remaining gaps
    const remainingGaps = [
      !contact.bantBudget && "budget",
      !contact.bantAuthority && "authority",
      !contact.bantNeed && "need",
      !contact.bantTimeline && "timeline",
    ].filter(Boolean).join(", ");

    await prisma.contact.update({
      where: { id: contactId },
      data: { bantGapSummary: remainingGaps },
    });

    console.log(`[bant-recovery] Contact ${contactId} still blocked at mql→sql. Remaining gaps: ${remainingGaps}`);
  }
}

// ============================================
// SEQUENCE COMPLETION DECISION ENGINE
// ============================================

/**
 * When a bant_qualification sequence completes with no reply, the system must decide:
 * 1. Re-enroll (if fit score is high and engagement shows signals)
 * 2. Escalate to Vapi call (if fit score is high but email isn't working)
 * 3. Disqualify (if fit + engagement are both low)
 *
 * Also handles general sequence completions with no reply for any sequence type.
 */
export async function handleSequenceCompletion(enrollmentId: string): Promise<void> {
  const enrollment = await prisma.sequenceEnrollment.findUnique({
    where: { id: enrollmentId },
    include: {
      sequence: true,
      contact: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          fitScore: true,
          engagementScore: true,
          lifecycleStage: true,
          bantGapSummary: true,
          email: true,
          phone: true,
        },
      },
    },
  });
  if (!enrollment || !enrollment.contact) return;

  const { contact, sequence } = enrollment;

  // Check if contact replied during this sequence (replied status is set by reply-analyzer)
  // If we got here with status "completed" (not "replied"), it means no reply was received
  if (enrollment.status !== "completed") return;

  // Count previous bant_qualification enrollments for this contact
  const previousBantEnrollments = await prisma.sequenceEnrollment.count({
    where: {
      contactId: contact.id,
      sequence: { type: "bant_qualification" },
      status: { in: ["completed", "replied"] },
    },
  });

  const decision = decideNextAction(
    contact.fitScore,
    contact.engagementScore,
    previousBantEnrollments,
    sequence.type,
    !!contact.phone
  );

  switch (decision.action) {
    case "re_enroll": {
      // Re-enroll in a fresh bant_qualification sequence with remaining gaps
      if (contact.bantGapSummary) {
        await enrollInBantQualification(contact.id, contact.bantGapSummary);
      }
      break;
    }
    case "vapi_escalate": {
      // Escalate to Vapi AI voice call
      await escalateToVapi(contact.id);
      break;
    }
    case "disqualify": {
      // Mark as disqualified — lifecycle stays at MQL, lead status becomes unqualified
      await prisma.contact.update({
        where: { id: contact.id },
        data: { leadStatus: "unqualified" },
      });
      // Mark any open leads as disqualified
      await prisma.lead.updateMany({
        where: { contactId: contact.id, stage: { notIn: ["qualified", "disqualified"] } },
        data: { stage: "disqualified", disqualifiedAt: new Date(), disqualifyReason: "unresponsive" },
      });
      break;
    }
  }

  // Log the decision
  await prisma.aIInsight.create({
    data: {
      type: "lifecycle_action",
      title: `Sequence completed: ${decision.action.replace("_", " ")}`,
      description: `${contact.firstName} ${contact.lastName} completed "${sequence.name}" with no reply. Decision: ${decision.reason}`,
      reasoning: `fitScore=${contact.fitScore}, engagementScore=${contact.engagementScore}, previousAttempts=${previousBantEnrollments}, sequenceType=${sequence.type}`,
      priority: decision.action === "disqualify" ? "low" : "medium",
      resourceType: "contact",
      resourceId: contact.id,
      status: "auto_actioned",
    },
  });

  console.log(`[bant-recovery] Sequence completion for ${contact.id}: ${decision.action} — ${decision.reason}`);
}

// ============================================
// DECISION LOGIC
// ============================================

function decideNextAction(
  fitScore: number,
  engagementScore: number,
  previousAttempts: number,
  sequenceType: string,
  hasPhone: boolean
): { action: "re_enroll" | "vapi_escalate" | "disqualify"; reason: string } {
  // Hard disqualify: low fit score regardless of engagement
  if (fitScore < 30) {
    return { action: "disqualify", reason: `Fit score too low (${fitScore}) — not worth further outreach` };
  }

  // After 2 email sequence attempts with no reply, try voice if phone available
  if (previousAttempts >= 2 && hasPhone && fitScore >= 50) {
    return { action: "vapi_escalate", reason: `${previousAttempts} email sequences with no reply, high fit (${fitScore}) — escalating to voice` };
  }

  // After 3 total attempts (email + voice), disqualify
  if (previousAttempts >= 3) {
    return { action: "disqualify", reason: `${previousAttempts} recovery attempts exhausted — marking unqualified` };
  }

  // High fit + some engagement = worth another try
  if (fitScore >= 50 && engagementScore >= 20) {
    return { action: "re_enroll", reason: `Fit (${fitScore}) + engagement (${engagementScore}) justify another attempt` };
  }

  // Medium fit, low engagement — disqualify
  if (engagementScore < 10) {
    return { action: "disqualify", reason: `Low engagement (${engagementScore}) despite fit (${fitScore}) — disqualifying` };
  }

  // Default: one more try
  return { action: "re_enroll", reason: `Moderate signals (fit=${fitScore}, engagement=${engagementScore}) — one more attempt` };
}

// ============================================
// VAPI ESCALATION
// ============================================

async function escalateToVapi(contactId: string): Promise<void> {
  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    select: { id: true, firstName: true, lastName: true, phone: true, bantGapSummary: true, company: { select: { name: true } } },
  });
  if (!contact?.phone) {
    console.warn(`[bant-recovery] Cannot escalate ${contactId} to Vapi — no phone number`);
    // Fall back to disqualify since we can't reach them by email or phone
    await prisma.contact.update({
      where: { id: contactId },
      data: { leadStatus: "unqualified" },
    });
    return;
  }

  const { vapi } = await import("@/lib/integrations/vapi");

  // Find first available assistant
  const assistants = await vapi.assistants.list();
  const assistant = assistants[0];
  if (!assistant) {
    console.error(`[bant-recovery] No Vapi assistant configured — cannot escalate ${contactId}`);
    return;
  }

  // Build a BANT-specific system prompt so the AI voice agent knows what to extract
  const missingFields = contact.bantGapSummary || "budget, authority, need, timeline";
  const fieldPrompts: Record<string, string> = {
    budget: "Find out their budget range or investment expectations. Frame it as 'what kind of investment were you envisioning for this?' — not 'what is your budget?'",
    authority: "Find out who else is involved in the decision. Ask 'who else would need to weigh in on something like this?' naturally.",
    need: "Confirm their specific pain point. Reference what you know and ask them to elaborate on impact.",
    timeline: "Find out their timeline. Ask 'is there a specific deadline or event driving this, or is it more exploratory?'",
  };
  const gapInstructions = missingFields.split(", ").map((f) => fieldPrompts[f.trim()] || `Extract ${f.trim()} information naturally.`).join("\n");

  const call = await vapi.calls.create({
    assistantId: assistant.id,
    customer: {
      number: contact.phone,
      name: `${contact.firstName} ${contact.lastName}`,
    },
    assistantOverrides: {
      firstMessage: `Hi ${contact.firstName}, this is the team at ${process.env.AGENCY_NAME || "our agency"}. I wanted to follow up on our earlier conversations — do you have a few minutes?`,
      model: {
        systemPrompt: `You are a consultative business development representative calling ${contact.firstName} ${contact.lastName}${contact.company?.name ? ` from ${contact.company.name}` : ""}.

PURPOSE: This is a qualification follow-up call. You need to extract specific missing information to move this deal forward.

MISSING INFORMATION TO EXTRACT:
${gapInstructions}

RULES:
1. Be warm and conversational — this is a follow-up, not a cold call. Reference previous conversations.
2. Do NOT sound like you're reading a checklist. Weave questions naturally into the conversation.
3. Listen actively. If they answer one question, acknowledge it before moving to the next.
4. If they seem busy, offer to call back at a better time — but still try to get at least one piece of information.
5. Keep the call under 5 minutes unless they want to talk more.
6. End by confirming next steps.`,
      },
    },
  });

  // Log the call as an activity
  const systemUser = await prisma.user.findFirst();
  if (systemUser) {
    await prisma.activity.create({
      data: {
        type: "call",
        subject: `Vapi BANT qualification call — missing: ${missingFields}`,
        body: `Autonomous outbound call to extract missing BANT data. Call ID: ${call.id}`,
        userId: systemUser.id,
        contactId,
        outcome: "initiated",
      },
    });
  }

  console.log(`[bant-recovery] Vapi call initiated for ${contactId}: ${call.id}`);
}
