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
  stageHistory: { from: string; to: string; triggeredBy: string; reason: string; timestamp: string }[] | null;

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
    gapSummary: string | null;
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

  // Email engagement (last 30 days)
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

  // Active deal if any
  deal: {
    stage: string;
    amount: number | null;
    painPoints: string | null;
    scopeOfWork: string | null;
  } | null;

  // ICP context — what "good" looks like
  icp: {
    industries: string | null;
    companySizes: string | null;
    jobTitles: string | null;
    revenueRanges: string | null;
    avgDealSize: number | null;
    avgTimeToClose: number | null;
  } | null;
}

/**
 * Gather all available intelligence about a contact for AI copy generation.
 * Pulls: contact profile, company, BANT, conversations, email events, deal, ICP.
 */
export async function gatherContactIntelligence(
  contactId: string,
  sequenceId?: string
): Promise<ContactIntelligence> {
  // Parallel fetch: contact+relations, active deal, active ICP, email events (30d)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [contact, activeDeal, activeICP, recentEmailEvents] = await Promise.all([
    prisma.contact.findUnique({
      where: { id: contactId },
      include: {
        company: true,
        aiConversationLogs: {
          orderBy: { createdAt: "desc" },
          take: 5,
        },
      },
    }),
    prisma.deal.findFirst({
      where: { contactId, stage: { notIn: ["closed_won", "closed_lost"] } },
      select: { stage: true, amount: true, painPoints: true, scopeOfWork: true },
    }),
    prisma.iCPProfile.findFirst({
      where: { isActive: true },
      select: { industries: true, companySizes: true, jobTitles: true, revenueRanges: true, avgDealSize: true, avgTimeToClose: true },
    }),
    prisma.emailEvent.findMany({
      where: { contactId, createdAt: { gte: thirtyDaysAgo } },
      select: { type: true },
    }),
  ]);

  if (!contact) throw new Error(`Contact ${contactId} not found`);

  // Count email engagement events (last 30 days only)
  const engagement = { sent: 0, opened: 0, clicked: 0, replied: 0 };
  for (const event of recentEmailEvents) {
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
  const stageHistory = safeParseJSON(contact.stageHistory, null);

  return {
    firstName: contact.firstName,
    lastName: contact.lastName,
    email: contact.email,
    jobTitle: contact.jobTitle,
    lifecycleStage: contact.lifecycleStage,
    leadStatus: contact.leadStatus,
    stageHistory,

    fitScore: contact.fitScore,
    engagementScore: contact.engagementScore,
    leadScore: contact.leadScore,

    bant: {
      budget: contact.bantBudget,
      authority: contact.bantAuthority,
      need: contact.bantNeed,
      timeline: contact.bantTimeline,
      gapSummary: contact.bantGapSummary,
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

    deal: activeDeal,

    icp: activeICP
      ? {
          industries: activeICP.industries,
          companySizes: activeICP.companySizes,
          jobTitles: activeICP.jobTitles,
          revenueRanges: activeICP.revenueRanges,
          avgDealSize: activeICP.avgDealSize,
          avgTimeToClose: activeICP.avgTimeToClose,
        }
      : null,
  };
}

// ============================================
// COPY GENERATION AT SEND TIME — the core change
// ============================================

/**
 * Generate email/message copy from scratch using contact intelligence + step strategy.
 * This is called at send time, NOT at sequence creation time.
 * Every field from the contact record, company, deal, conversations, and ICP
 * is injected into the prompt so the output reads like it was written by
 * someone who knows this person — because the AI does.
 */
export async function generateStepCopy(params: {
  step: SequenceStep;
  intel: ContactIntelligence;
  sequenceName: string;
  sequenceStrategy: string;
  sequenceType?: string;
  enrollmentMetadata?: Record<string, unknown>;
}): Promise<{ subject: string; body: string }> {
  const { step, intel, sequenceName, sequenceStrategy, sequenceType, enrollmentMetadata } = params;

  // ---- Build context blocks ----

  const inboundConvos = intel.conversations.filter((c) => c.direction === "inbound");
  const allConvos = intel.conversations
    .map((c) => `[${c.date.split("T")[0]} ${c.direction} ${c.channel}] ${c.summary || c.content.substring(0, 300)}${c.sentiment ? ` (sentiment: ${c.sentiment})` : ""}${c.intent ? ` (intent: ${c.intent})` : ""}${c.objectionVerbatim ? ` — objection verbatim: "${c.objectionVerbatim}"` : ""}`)
    .join("\n");

  const bantLines = [
    intel.bant.budget ? `Budget: ${intel.bant.budget}` : "Budget: UNKNOWN",
    intel.bant.authority ? `Authority: ${intel.bant.authority}` : "Authority: UNKNOWN",
    intel.bant.need ? `Need: ${intel.bant.need}` : "Need: UNKNOWN",
    intel.bant.timeline ? `Timeline: ${intel.bant.timeline}` : "Timeline: UNKNOWN",
    intel.bant.gapSummary ? `Missing fields: ${intel.bant.gapSummary}` : null,
    intel.bant.notes ? `Verbatim quotes from contact: ${JSON.stringify(intel.bant.notes)}` : null,
  ].filter(Boolean).join("\n");

  const companyBlock = intel.company
    ? [
        `Company: ${intel.company.name}`,
        intel.company.industry ? `Industry: ${intel.company.industry}` : null,
        intel.company.size ? `Size: ${intel.company.size} employees` : null,
        intel.company.revenue ? `Revenue: $${(intel.company.revenue / 1_000_000).toFixed(1)}M` : null,
        intel.company.description ? `About: ${intel.company.description}` : null,
      ].filter(Boolean).join("\n")
    : "No company data.";

  const dealBlock = intel.deal
    ? [
        `Deal stage: ${intel.deal.stage}`,
        intel.deal.amount ? `Deal size: $${intel.deal.amount.toLocaleString()}` : null,
        intel.deal.painPoints ? `Pain points: ${intel.deal.painPoints}` : null,
        intel.deal.scopeOfWork ? `Scope of work: ${intel.deal.scopeOfWork}` : null,
      ].filter(Boolean).join("\n")
    : null;

  const stageHistoryBlock = intel.stageHistory
    ? intel.stageHistory.slice(-3).map((h) => `${h.from} → ${h.to} (${h.triggeredBy}: ${h.reason})`).join("\n")
    : null;

  const previousStepsBlock = intel.previousSteps.length > 0
    ? intel.previousSteps
        .map((s) => `Step ${s.stepNumber} (${s.channel}, ${s.sentAt.split("T")[0]}): ${s.content.substring(0, 300)}`)
        .join("\n")
    : null;

  const icpBlock = intel.icp
    ? [
        intel.icp.industries ? `Target industries: ${intel.icp.industries}` : null,
        intel.icp.companySizes ? `Target company sizes: ${intel.icp.companySizes}` : null,
        intel.icp.jobTitles ? `Target titles: ${intel.icp.jobTitles}` : null,
        intel.icp.avgDealSize ? `Avg deal size: $${intel.icp.avgDealSize.toLocaleString()}` : null,
        intel.icp.avgTimeToClose ? `Avg time to close: ${intel.icp.avgTimeToClose} days` : null,
      ].filter(Boolean).join("\n")
    : null;

  // ---- Sequence-type-specific mission blocks ----

  let missionBlock = "";

  if (sequenceType === "bant_qualification") {
    const gaps = (enrollmentMetadata?.bantGapSummary as string) || intel.bant.gapSummary || "";
    const firstGap = gaps.split(",")[0]?.trim();
    const gapStrategies: Record<string, string> = {
      budget: "Frame around ROI or investment range for similar projects in their industry. Example: 'Companies your size typically invest $X-Y for this kind of outcome — does that range feel realistic for what you're seeing?'",
      authority: "Ask who else would weigh in. Example: 'If this looked like a fit, who else on your side would want to evaluate it?'",
      need: "Probe deeper on the specific pain point using what you know. Example: 'When you mentioned [specific thing], how is that affecting [specific business outcome]?'",
      timeline: "Tie to a business event or deadline. Example: 'Is there a specific event or quarter driving this, or is it more exploratory right now?'",
    };

    missionBlock = `
BANT GAP RECOVERY MISSION (PRIMARY OBJECTIVE):
This contact is stuck at MQL because they are missing: ${gaps}.
Your email must ask EXACTLY ONE natural question targeting: ${firstGap}.
Strategy for ${firstGap}: ${gapStrategies[firstGap] || `Extract ${firstGap} information through a consultative question.`}
Do NOT ask multiple qualifying questions. One question, woven naturally into the email.
Do NOT sound like a qualification form. Sound like a consultant following up on a real conversation.`;
  }

  if (sequenceType === "re_engagement") {
    const lastConvo = intel.conversations[0];
    const lastIntent = lastConvo?.intent;
    const lastDate = lastConvo?.date?.split("T")[0];
    missionBlock = `
RE-ENGAGEMENT MISSION:
This contact went quiet. ${lastConvo ? `Last touchpoint was ${lastDate} on ${lastConvo.channel} — intent was "${lastIntent}", sentiment was "${lastConvo.sentiment}".` : "No recent touchpoints on record."}
${lastConvo?.summary ? `Last conversation summary: ${lastConvo.summary}` : ""}
Reference the specific last interaction if available. Do NOT write "just checking in" — provide a reason to re-engage (new insight, case study result, industry change).`;
  }

  // ---- Assemble the full prompt ----

  const prompt = `You are writing step ${step.stepNumber} of the "${sequenceName}" sequence.
Recipient: ${intel.firstName} ${intel.lastName}${intel.jobTitle ? `, ${intel.jobTitle}` : ""}
Lifecycle: ${intel.lifecycleStage} | Lead status: ${intel.leadStatus || "n/a"} | Fit: ${intel.fitScore}/55 | Engagement: ${intel.engagementScore}/45

=== COMPANY ===
${companyBlock}

=== BANT QUALIFICATION (${intel.bant.score}/4 filled) ===
${bantLines}

=== CONVERSATION HISTORY (most recent first) ===
${allConvos || "No conversation history — this is a cold contact."}

=== EMAIL ENGAGEMENT (last 30 days) ===
Sent: ${intel.engagement.sent} | Opened: ${intel.engagement.opened} | Clicked: ${intel.engagement.clicked} | Replied: ${intel.engagement.replied}
${intel.engagement.opened > 0 && intel.engagement.replied === 0 ? "⚠ They are opening but not replying — your subject lines work but the body isn't compelling enough to respond to." : ""}
${intel.engagement.sent > 3 && intel.engagement.opened === 0 ? "⚠ They are not opening — try a radically different subject line approach." : ""}

${dealBlock ? `=== ACTIVE DEAL ===\n${dealBlock}\n` : ""}${stageHistoryBlock ? `=== STAGE PROGRESSION ===\n${stageHistoryBlock}\n` : ""}${previousStepsBlock ? `=== PREVIOUS STEPS ALREADY SENT (do NOT repeat these angles) ===\n${previousStepsBlock}\n` : "=== FIRST TOUCH — no previous steps sent ===\n"}${icpBlock ? `=== ICP CONTEXT (what a good customer looks like) ===\n${icpBlock}\n` : ""}
=== THIS STEP'S STRATEGY ===
Sequence: ${sequenceName}
Overall strategy: ${sequenceStrategy}
Step ${step.stepNumber} angle: ${step.angle}
Step ${step.stepNumber} goal: ${step.goal}
${step.objectionToAddress ? `Objection to preempt: ${step.objectionToAddress}` : ""}
${step.tone ? `Tone: ${step.tone}` : ""}
${missionBlock}
=== ABSOLUTE RULES ===
1. UNDER 150 WORDS for the email body. Short paragraphs. No walls of text.
2. If a contact field is null, empty, or marked UNKNOWN above, do NOT reference it, invent a plausible value, or leave a placeholder. Write around it. A missing company means you do not mention their company — you focus on their role or pain point instead. A missing bantNeed means you ask an indirect question to surface it, not "I see your need is unknown." NEVER output {{anything}}, "[Company]", "your organization", or any other placeholder. If you don't have the data, don't reference the concept.
3. Subject line must be SPECIFIC to this person's situation. Banned: "Quick follow-up", "Checking in", "Just wanted to", "Hope you're well", "Following up", "Touching base". Use their company name, a specific pain point, or a specific result.
4. Write the actual name "${intel.firstName}" — NEVER use {{firstName}} or any merge tag syntax.
5. Reference SPECIFIC details you know: their company, their pain points, their quotes, their industry. If you have verbatim quotes from the contact, weave one in naturally. Only reference what is provided above — do not assume or fabricate context.
6. If previous steps were sent, do NOT repeat those angles or phrasings. Each step must feel like a new thought.
7. End with a SINGLE soft CTA that requires a one-sentence reply. Not "book a call" or "schedule a meeting" — something like "Does that match what you're seeing?" or "Worth exploring, or off base?"
8. Do NOT include any sign-off, signature, or closing name. No "Best,", no "Cheers,", no sender name. The email sending system appends the real sender's name and signature automatically. End the email on the CTA line.
9. Plain text only. No HTML, no bullet points, no bold. Write like a human typing a quick email.
10. Do NOT start with "Hi ${intel.firstName}," — vary the opener. Sometimes use just the name, sometimes jump straight into the point.

Return JSON: { "subject": "...", "body": "..." }`;

  const result = await runAIJob(
    "email_composer",
    "generate_step_copy",
    { instructions: prompt },
    { contactId: undefined }
  );

  const output = result.output as { subject: string; body: string };

  // Validate AI output — never send empty emails
  if (!output?.subject || typeof output.subject !== "string" || output.subject.trim() === "") {
    throw new Error(`generateStepCopy returned empty or missing subject for step ${step.stepNumber} of "${sequenceName}"`);
  }
  if (!output?.body || typeof output.body !== "string" || output.body.trim() === "") {
    throw new Error(`generateStepCopy returned empty or missing body for step ${step.stepNumber} of "${sequenceName}"`);
  }

  return output;
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
