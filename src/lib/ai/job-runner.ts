import { prisma } from "@/lib/prisma";
import { aiComplete, aiJSON, estimateCost } from "./claude";
import { AGENT_CONFIGS, type AgentType } from "./agents";

export interface JobResult {
  jobId: string;
  output: unknown;
  tokens: number;
  cost: number;
}

// Create and execute an AI job
export async function runAIJob(
  agentType: AgentType,
  jobType: string,
  input: Record<string, unknown>,
  options?: { contactId?: string; dealId?: string }
): Promise<JobResult> {
  const config = AGENT_CONFIGS[agentType];

  // Find or create the agent record
  let agent = await prisma.aIAgent.findFirst({ where: { name: config.name } });
  if (!agent) {
    agent = await prisma.aIAgent.create({
      data: {
        name: config.name,
        description: config.description,
        systemPrompt: config.systemPrompt,
        model: config.model,
        temperature: config.temperature,
      },
    });
  }

  // Create the job
  const job = await prisma.aIJob.create({
    data: {
      agentId: agent.id,
      type: jobType,
      input: JSON.stringify(input),
      contactId: options?.contactId,
      dealId: options?.dealId,
      status: "running",
      startedAt: new Date(),
    },
  });

  try {
    const result = await aiJSON({
      system: config.systemPrompt,
      messages: [{ role: "user", content: JSON.stringify(input) }],
      model: config.model,
      temperature: config.temperature,
    });

    const totalTokens = result.inputTokens + result.outputTokens;
    const cost = estimateCost(result.inputTokens, result.outputTokens, config.model);

    await prisma.aIJob.update({
      where: { id: job.id },
      data: {
        status: "completed",
        output: JSON.stringify(result.data),
        tokens: totalTokens,
        cost,
        completedAt: new Date(),
      },
    });

    return { jobId: job.id, output: result.data, tokens: totalTokens, cost };
  } catch (error) {
    await prisma.aIJob.update({
      where: { id: job.id },
      data: {
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
        completedAt: new Date(),
      },
    });
    throw error;
  }
}

// Run an AI completion without JSON parsing (for free-text responses)
export async function runAIText(
  agentType: AgentType,
  jobType: string,
  input: Record<string, unknown>,
  options?: { contactId?: string; dealId?: string }
): Promise<{ jobId: string; text: string; tokens: number; cost: number }> {
  const config = AGENT_CONFIGS[agentType];

  let agent = await prisma.aIAgent.findFirst({ where: { name: config.name } });
  if (!agent) {
    agent = await prisma.aIAgent.create({
      data: {
        name: config.name,
        description: config.description,
        systemPrompt: config.systemPrompt,
        model: config.model,
        temperature: config.temperature,
      },
    });
  }

  const job = await prisma.aIJob.create({
    data: {
      agentId: agent.id,
      type: jobType,
      input: JSON.stringify(input),
      contactId: options?.contactId,
      dealId: options?.dealId,
      status: "running",
      startedAt: new Date(),
    },
  });

  try {
    const result = await aiComplete({
      system: config.systemPrompt,
      messages: [{ role: "user", content: JSON.stringify(input) }],
      model: config.model,
      temperature: config.temperature,
    });

    const totalTokens = result.inputTokens + result.outputTokens;
    const cost = estimateCost(result.inputTokens, result.outputTokens, config.model);

    await prisma.aIJob.update({
      where: { id: job.id },
      data: {
        status: "completed",
        output: result.text,
        tokens: totalTokens,
        cost,
        completedAt: new Date(),
      },
    });

    return { jobId: job.id, text: result.text, tokens: totalTokens, cost };
  } catch (error) {
    await prisma.aIJob.update({
      where: { id: job.id },
      data: {
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
        completedAt: new Date(),
      },
    });
    throw error;
  }
}
