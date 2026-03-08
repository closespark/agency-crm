import Anthropic from "@anthropic-ai/sdk";
import { safeParseJSON } from "@/lib/safe-json";

const globalForAnthropic = globalThis as unknown as {
  anthropic: Anthropic | undefined;
  keysLoaded: boolean | undefined;
};

function createAnthropic(): Anthropic {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set");
  return new Anthropic({ apiKey: key });
}

// Ensure DB-stored integration keys are loaded into process.env before first use
async function ensureKeysLoaded(): Promise<void> {
  if (globalForAnthropic.keysLoaded) return;
  try {
    const { getKey } = await import("@/lib/integration-keys");
    await getKey("ANTHROPIC_API_KEY"); // triggers loadCache → injects into process.env
  } catch {
    // DB not available — fall through to env var
  }
  globalForAnthropic.keysLoaded = true;
}

export const anthropic: Anthropic = new Proxy({} as Anthropic, {
  get(_, prop) {
    if (prop === "then") return undefined;
    if (!globalForAnthropic.anthropic) {
      globalForAnthropic.anthropic = createAnthropic();
    }
    const instance = globalForAnthropic.anthropic;
    const value = (instance as unknown as Record<string | symbol, unknown>)[prop];
    return typeof value === "function" ? value.bind(instance) : value;
  },
});

export interface AIMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AICompletionOptions {
  system?: string;
  messages: AIMessage[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
}

const MAX_RETRIES = 3;
const TIMEOUT_MS = 60_000; // 60 second timeout per AI call

async function withRetry<T>(fn: () => Promise<T>, retries = MAX_RETRIES): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const isRetryable =
        err instanceof Error &&
        (err.message.includes("overloaded") ||
          err.message.includes("rate_limit") ||
          err.message.includes("529") ||
          err.message.includes("500") ||
          err.name === "AbortError");
      if (!isRetryable || attempt === retries) throw err;
      const delay = Math.min(1000 * Math.pow(2, attempt), 8000);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error("Unreachable");
}

export async function aiComplete({
  system,
  messages,
  model = "claude-sonnet-4-20250514",
  maxTokens = 4096,
  temperature = 0.7,
}: AICompletionOptions): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  await ensureKeysLoaded();
  return withRetry(async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await anthropic.messages.create(
        {
          model,
          max_tokens: maxTokens,
          temperature,
          system: system || undefined,
          messages,
        },
        { signal: controller.signal }
      );

      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("");

      return {
        text,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      };
    } finally {
      clearTimeout(timeout);
    }
  });
}

export async function aiJSON<T = unknown>(
  options: AICompletionOptions
): Promise<{ data: T; inputTokens: number; outputTokens: number }> {
  const systemPrompt = `${options.system || ""}\n\nIMPORTANT: You must respond with ONLY valid JSON. No markdown, no code fences, no explanation. Just the JSON object.`.trim();

  const result = await aiComplete({
    ...options,
    system: systemPrompt,
  });

  const cleaned = result.text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const data = safeParseJSON<T>(cleaned, null as T);
  if (data === null) {
    throw new Error(`AI returned invalid JSON: ${cleaned.slice(0, 200)}`);
  }
  return { data, inputTokens: result.inputTokens, outputTokens: result.outputTokens };
}

// Estimate cost based on Claude pricing (updated March 2026)
// See: https://platform.claude.com/docs/en/about-claude/models/overview
export function estimateCost(
  inputTokens: number,
  outputTokens: number,
  model = "claude-sonnet-4-20250514"
): number {
  const pricing: Record<string, { input: number; output: number }> = {
    // Sonnet 4 (May 2025)
    "claude-sonnet-4-20250514": { input: 3 / 1_000_000, output: 15 / 1_000_000 },
    // Sonnet 4.5 (late 2025)
    "claude-sonnet-4-5-20250514": { input: 3 / 1_000_000, output: 15 / 1_000_000 },
    // Sonnet 4.6 (Feb 2026) — latest Sonnet
    "claude-sonnet-4-6": { input: 3 / 1_000_000, output: 15 / 1_000_000 },
    // Haiku 4.5 (Oct 2025)
    "claude-haiku-4-5-20251001": { input: 0.8 / 1_000_000, output: 4 / 1_000_000 },
    // Opus 4.5 (late 2025)
    "claude-opus-4-5-20250610": { input: 15 / 1_000_000, output: 75 / 1_000_000 },
    // Opus 4.6 (Feb 2026) — latest Opus / frontier
    "claude-opus-4-6": { input: 15 / 1_000_000, output: 75 / 1_000_000 },
  };
  const p = pricing[model] || pricing["claude-sonnet-4-20250514"];
  return inputTokens * p.input + outputTokens * p.output;
}
