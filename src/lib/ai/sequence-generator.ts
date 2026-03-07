import { prisma } from "@/lib/prisma";
import { runAIJob } from "./job-runner";
import { safeParseJSON } from "@/lib/safe-json";

// ============================================
// STEP SCHEMA — strategy directives, NOT pre-written copy
// ============================================

export interface SequenceStep {
  stepNumber: number;
  channel: "email" | "linkedin" | "call";
  delayDays: number;
  angle: string; // e.g. "Reference discovery call pain points, position our workflow automation as the fix"
  goal: string; // e.g. "Book a follow-up demo" or "Get confirmation they'll review the proposal"
  objectionToAddress?: string; // e.g. "competing priorities" or "budget concerns"
  tone?: string; // e.g. "direct and specific" or "empathetic, peer-to-peer"
  // Legacy fields — kept for backward compat with pre-existing sequences
  subject?: string;
  body?: string;
  notes?: string;
}

export interface GeneratedSequence {
  name: string;
  description: string;
  steps: SequenceStep[];
  estimatedDuration: string;
  strategy: string;
}

// ============================================
// SEQUENCE CREATION — defines structure + strategy only
// ============================================

export async function generateSequence(params: {
  targetDescription: string;
  industry?: string;
  painPoints?: string[];
  agencyServices: string;
  channels: ("email" | "linkedin" | "multi")[];
  stepCount?: number;
  tone?: string;
}): Promise<GeneratedSequence> {
  const input = {
    task: "Design an outreach sequence STRATEGY — do NOT write actual email copy",
    target: params.targetDescription,
    industry: params.industry,
    painPoints: params.painPoints || [],
    agencyServices: params.agencyServices,
    channels: params.channels,
    numberOfSteps: params.stepCount || 5,
    tone: params.tone || "professional yet conversational",
    instructions: `Design a ${params.stepCount || 5}-step outreach sequence STRATEGY.

IMPORTANT: Do NOT write email body copy or subject lines. The actual copy will be generated
at enrollment time using real contact intelligence (discovery call transcripts, BANT data,
engagement history, company data). You are only defining the playbook.

For each step provide:
- stepNumber (1-based)
- channel ("email" or "linkedin")
- delayDays (days to wait after previous step, 0 for first step)
- angle (the strategic approach for this step — what insight or value to lead with)
- goal (the specific outcome you want from this touch — e.g. "book demo", "get reply", "confirm interest")
- objectionToAddress (optional — if this step should preemptively handle a common objection)
- tone (optional — emotional register for this step, e.g. "urgent but not pushy", "peer-to-peer casual")

Also provide: name, description, estimatedDuration, strategy (overall approach summary).

Return JSON: { name, description, strategy, estimatedDuration, steps: [{ stepNumber, channel, delayDays, angle, goal, objectionToAddress?, tone? }] }`,
  };

  const result = await runAIJob("sequence_writer", "write_sequence", input);
  return result.output as GeneratedSequence;
}

// ============================================
// CONTACT INTELLIGENCE GATHERING
// ============================================

export interface ContactIntelligence {
  // Identity
  firstName: string;
  lastName: string;
  email: string | null;
  jobTitle: string | null;
  lifecycleStage: string;
  leadStatus: string | null;

  // Scoring
  fitScore: number;
  engagementScore: number;
  leadScore: number;

  // BANT qualification
  bant: {
    budget: string | null;
    authority: string | null;
    need: string | null;
    timeline: string | null;
    notes: Record<string, string> | null; // verbatim quotes
    score: number;
  };

  // Company data
  company: {
    name: string;
    industry: string | null;
    size: string | null;
    revenue: number | null;
    description: string | null;
  } | null;

  // Conversation history (discovery calls, replies, etc.)
  conversations: {
    channel: string;
    direction: string;
    summary: string | null;
    sentiment: string | null;
    intent: string | null;
    objectionType: string | null;
    objectionVerbatim: string | null;
    content: string;
    date: string;
  }[];

  // Email engagement
  engagement: {
    sent: number;
    opened: number;
    clicked: number;
    replied: number;
  };

  // Previous sequence steps sent to this contact
  previousSteps: {
    stepNumber: number;
    channel: string;
    content: string;
    sentAt: string;
  }[];
}

/**
 * Gather all available intelligence about a contact for AI copy generation.
 */
export async function gatherContactIntelligence(
  contactId: string,
  sequenceId?: string
): Promise<ContactIntelligence> {
  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    include: {
      company: true,
      aiConversationLogs: {
        orderBy: { createdAt: "desc" },
        take: 20,
      },
      emailEvents: {
        orderBy: { createdAt: "desc" },
        take: 50,
      },
    },
  });

  if (!contact) throw new Error(`Contact ${contactId} not found`);

  // Count email engagement events
  const engagement = { sent: 0, opened: 0, clicked: 0, replied: 0 };
  for (const event of contact.emailEvents) {
    if (event.type === "sent") engagement.sent++;
    else if (event.type === "opened") engagement.opened++;
    else if (event.type === "clicked") engagement.clicked++;
    else if (event.type === "replied") engagement.replied++;
  }

  // Get previous steps sent in this sequence (if enrolled)
  const previousSteps: ContactIntelligence["previousSteps"] = [];
  if (sequenceId) {
    const pastActivities = await prisma.activity.findMany({
      where: {
        contactId,
        type: { in: ["email", "note"] },
      },
      orderBy: { createdAt: "asc" },
      take: 20,
      select: { subject: true, body: true, type: true, createdAt: true },
    });

    pastActivities.forEach((a, i) => {
      previousSteps.push({
        stepNumber: i + 1,
        channel: a.type === "email" ? "email" : "linkedin",
        content: a.body || a.subject || "",
        sentAt: a.createdAt.toISOString(),
      });
    });
  }

  const bantNotes = safeParseJSON(contact.bantNotes, null);

  return {
    firstName: contact.firstName,
    lastName: contact.lastName,
    email: contact.email,
    jobTitle: contact.jobTitle,
    lifecycleStage: contact.lifecycleStage,
    leadStatus: contact.leadStatus,

    fitScore: contact.fitScore,
    engagementScore: contact.engagementScore,
    leadScore: contact.leadScore,

    bant: {
      budget: contact.bantBudget,
      authority: contact.bantAuthority,
      need: contact.bantNeed,
      timeline: contact.bantTimeline,
      notes: bantNotes,
      score: contact.bantScore,
    },

    company: contact.company
      ? {
          name: contact.company.name,
          industry: contact.company.industry,
          size: contact.company.size,
          revenue: contact.company.revenue,
          description: contact.company.description,
        }
      : null,

    conversations: contact.aiConversationLogs.map((log) => ({
      channel: log.channel,
      direction: log.direction,
      summary: log.aiSummary,
      sentiment: log.sentiment,
      intent: log.intent,
      objectionType: log.objectionType,
      objectionVerbatim: log.objectionVerbatim,
      content: log.rawContent.substring(0, 1000),
      date: log.createdAt.toISOString(),
    })),

    engagement,
    previousSteps,
  };
}

// ============================================
// COPY GENERATION AT SEND TIME — the core change
// ============================================

/**
 * Generate email/message copy from scratch using contact intelligence + step strategy.
 * This is called at send time, NOT at sequence creation time.
 */
export async function generateStepCopy(params: {
  step: SequenceStep;
  intel: ContactIntelligence;
  sequenceName: string;
  sequenceStrategy: string;
}): Promise<{ subject: string; body: string }> {
  const { step, intel, sequenceName, sequenceStrategy } = params;

  // Build a rich context prompt
  const hasConversations = intel.conversations.length > 0;
  const hasBANT = intel.bant.score > 0;
  const inboundConvos = intel.conversations.filter((c) => c.direction === "inbound");
  const discoveryNotes = inboundConvos
    .map((c) => `[${c.channel}] ${c.summary || c.content}`)
    .join("\n");

  const bantContext = hasBANT
    ? [
        intel.bant.budget ? `Budget: ${intel.bant.budget}` : null,
        intel.bant.authority ? `Authority: ${intel.bant.authority}` : null,
        intel.bant.need ? `Need: ${intel.bant.need}` : null,
        intel.bant.timeline ? `Timeline: ${intel.bant.timeline}` : null,
        intel.bant.notes
          ? `Verbatim quotes: ${JSON.stringify(intel.bant.notes)}`
          : null,
      ]
        .filter(Boolean)
        .join("\n")
    : "No BANT data yet — this is a cold contact.";

  const companyContext = intel.company
    ? `Company: ${intel.company.name}${intel.company.industry ? `, ${intel.company.industry}` : ""}${intel.company.size ? `, ${intel.company.size} employees` : ""}${intel.company.revenue ? `, $${(intel.company.revenue / 1000000).toFixed(1)}M revenue` : ""}${intel.company.description ? `\nAbout: ${intel.company.description}` : ""}`
    : "No company data available.";

  const engagementContext = `Emails sent: ${intel.engagement.sent}, Opened: ${intel.engagement.opened}, Clicked: ${intel.engagement.clicked}, Replied: ${intel.engagement.replied}`;

  const previousStepsSent = intel.previousSteps.length > 0
    ? intel.previousSteps
        .map((s) => `Step ${s.stepNumber} (${s.channel}, ${s.sentAt.split("T")[0]}): ${s.content.substring(0, 200)}...`)
        .join("\n")
    : "No previous steps sent yet — this is the first touch.";

  const input = {
    task: "Write a hyper-personalized outreach message",
    step: {
      number: step.stepNumber,
      channel: step.channel,
      angle: step.angle,
      goal: step.goal,
      objectionToAddress: step.objectionToAddress,
      tone: step.tone,
    },
    sequence: { name: sequenceName, strategy: sequenceStrategy },
    contact: {
      name: `${intel.firstName} ${intel.lastName}`,
      jobTitle: intel.jobTitle,
      lifecycleStage: intel.lifecycleStage,
      leadStatus: intel.leadStatus,
      fitScore: intel.fitScore,
      engagementScore: intel.engagementScore,
    },
    instructions: `You are writing step ${step.stepNumber} of the "${sequenceName}" sequence for ${intel.firstName} ${intel.lastName}.

CONTACT INTELLIGENCE:
${companyContext}

BANT QUALIFICATION:
${bantContext}

DISCOVERY CALL / CONVERSATION HISTORY:
${discoveryNotes || "No conversation history — cold outreach."}

EMAIL ENGAGEMENT:
${engagementContext}

PREVIOUS SEQUENCE STEPS ALREADY SENT:
${previousStepsSent}

STEP STRATEGY:
- Angle: ${step.angle}
- Goal: ${step.goal}
${step.objectionToAddress ? `- Objection to address: ${step.objectionToAddress}` : ""}
${step.tone ? `- Tone: ${step.tone}` : ""}

RULES:
1. Write like someone who was in the room. Reference SPECIFIC details from their conversations, BANT data, and company context. Use their exact words when possible.
2. NEVER use generic phrases like "I know competing priorities can push initiatives to the back burner" — ALWAYS tie to their specific situation.
3. If you have discovery call data, reference specific pain points, numbers, and quotes they shared.
4. If this is cold outreach (no conversation history), use company data and ICP signals to demonstrate research.
5. Do NOT repeat angles or content from previous steps already sent.
6. Keep emails concise — 3-5 short paragraphs max. No walls of text.
7. End with a specific, low-friction CTA aligned with the step's goal.
8. Subject line should be specific and curiosity-driven, NOT generic.
9. Sign off as the sender — do not include {{placeholders}} anywhere.

Return JSON: { "subject": "...", "body": "..." }
The body should be plain text (no HTML). Use line breaks for paragraphs.`,
  };

  const result = await runAIJob(
    "email_composer",
    "generate_step_copy",
    input,
    { contactId: undefined } // no contactId needed in job metadata
  );

  return result.output as { subject: string; body: string };
}

// ============================================
// LEGACY: generatePersonalizedStep (backward compat for old sequences with body text)
// ============================================

export async function generatePersonalizedStep(params: {
  sequenceStep: SequenceStep;
  contact: {
    firstName: string;
    lastName: string;
    email?: string;
    jobTitle?: string;
    companyName?: string;
    industry?: string;
    linkedinUrl?: string;
  };
  previousInteractions?: string[];
}): Promise<{ subject?: string; body: string }> {
  // If the step has an angle field, it's a new-style strategy step — use full intelligence
  // This fallback handles old sequences that still have pre-written body text
  const input = {
    task: "Personalize this outreach message for a specific contact",
    template: params.sequenceStep,
    contact: params.contact,
    previousInteractions: params.previousInteractions || [],
    instructions:
      "Replace all placeholders with real data. Add specific personalization based on the contact's role, company, and any previous interactions. Keep the same tone and structure but make it feel hand-written for this person.",
  };

  const result = await runAIJob("email_composer", "personalize_step", input, {});
  return result.output as { subject?: string; body: string };
}

// ============================================
// SAVE SEQUENCE
// ============================================

export async function saveGeneratedSequence(
  generated: GeneratedSequence
): Promise<string> {
  const sequence = await prisma.sequence.create({
    data: {
      name: generated.name,
      description: generated.description,
      steps: JSON.stringify(generated.steps),
      aiGenerated: true,
      isActive: true,
    },
  });
  return sequence.id;
}
