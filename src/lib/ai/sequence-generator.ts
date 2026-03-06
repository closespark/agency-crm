import { prisma } from "@/lib/prisma";
import { runAIJob } from "./job-runner";

interface SequenceStep {
  stepNumber: number;
  channel: "email" | "linkedin" | "call";
  delayDays: number;
  subject?: string;
  body: string;
  notes?: string;
}

interface GeneratedSequence {
  name: string;
  description: string;
  steps: SequenceStep[];
  estimatedDuration: string;
  strategy: string;
}

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
    task: "Generate a complete outreach sequence",
    target: params.targetDescription,
    industry: params.industry,
    painPoints: params.painPoints || [],
    agencyServices: params.agencyServices,
    channels: params.channels,
    numberOfSteps: params.stepCount || 7,
    tone: params.tone || "professional yet conversational",
    instructions: `Create a ${params.stepCount || 7}-step outreach sequence. For each step provide:
- stepNumber (1-based)
- channel (email or linkedin)
- delayDays (days to wait after previous step, 0 for first step)
- subject (for emails only)
- body (the actual message text with {{firstName}}, {{companyName}}, {{jobTitle}} placeholders)
- notes (internal notes about the strategy for this step)

Also provide: name, description, estimatedDuration, strategy (overall approach summary).`,
  };

  const result = await runAIJob("sequence_writer", "write_sequence", input);
  return result.output as GeneratedSequence;
}

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
  const input = {
    task: "Personalize this outreach message for a specific contact",
    template: params.sequenceStep,
    contact: params.contact,
    previousInteractions: params.previousInteractions || [],
    instructions: "Replace all placeholders with real data. Add specific personalization based on the contact's role, company, and any previous interactions. Keep the same tone and structure but make it feel hand-written for this person.",
  };

  const result = await runAIJob("email_composer", "personalize_step", input, {});
  const output = result.output as { subject?: string; body: string };
  return output;
}

// Create a Sequence record from AI-generated content
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
