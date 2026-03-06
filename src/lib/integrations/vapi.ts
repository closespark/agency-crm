// Vapi.ai integration — AI voice agents for inbound/outbound calls.
// Vapi handles the voice layer; we handle CRM intelligence and actions.
// API docs: https://docs.vapi.ai
// Auth: Bearer token via VAPI_API_KEY
// Webhooks: Vapi sends events to our webhook endpoint for call lifecycle events.

const VAPI_BASE = "https://api.vapi.ai";

function getApiKey(): string {
  const key = process.env.VAPI_API_KEY;
  if (!key) throw new Error("VAPI_API_KEY not configured");
  return key;
}

// ---------------------------------------------------------------------------
// Rate limiter — Vapi doesn't publish strict limits; be conservative
// ---------------------------------------------------------------------------

class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  constructor(private maxTokens: number, private refillRate: number) {
    this.tokens = maxTokens;
    this.lastRefill = Date.now();
  }

  async waitForToken(): Promise<void> {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }
    const waitMs = ((1 - this.tokens) / this.refillRate) * 1000;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    this.refill();
    this.tokens -= 1;
  }

  private refill() {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;
  }
}

const vapiLimiter = new RateLimiter(5, 2);

// ---------------------------------------------------------------------------
// Generic fetch wrapper
// ---------------------------------------------------------------------------

async function vapiFetch<T>(
  endpoint: string,
  options: { method?: string; body?: unknown } = {}
): Promise<T> {
  await vapiLimiter.waitForToken();

  const res = await fetch(`${VAPI_BASE}${endpoint}`, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getApiKey()}`,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Vapi API error (${res.status}): ${error}`);
  }

  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VapiAssistant {
  id: string;
  name: string;
  model: { provider: string; model: string };
  voice: { provider: string; voiceId: string };
  firstMessage?: string;
  transcriber?: { provider: string; model: string };
}

export interface VapiCall {
  id: string;
  assistantId: string;
  type: "inboundPhoneCall" | "outboundPhoneCall" | "webCall";
  status: "queued" | "ringing" | "in-progress" | "forwarding" | "ended";
  startedAt?: string;
  endedAt?: string;
  transcript?: string;
  summary?: string;
  recordingUrl?: string;
  cost?: number;
  customer?: { number?: string; name?: string };
  analysis?: {
    successEvaluation?: string;
    summary?: string;
    structuredData?: Record<string, unknown>;
  };
}

export interface VapiPhoneNumber {
  id: string;
  number: string;
  provider: string;
  assistantId?: string;
}

// ---------------------------------------------------------------------------
// Webhook Types
// ---------------------------------------------------------------------------

export type VapiWebhookEvent =
  | { message: { type: "assistant-request"; call: VapiCall } }
  | { message: { type: "status-update"; call: VapiCall; status: string } }
  | { message: { type: "end-of-call-report"; call: VapiCall; transcript: string; summary: string; recordingUrl?: string; analysis?: VapiCall["analysis"] } }
  | { message: { type: "function-call"; call: VapiCall; functionCall: { name: string; parameters: Record<string, unknown> } } }
  | { message: { type: "hang"; call: VapiCall } }
  | { message: { type: "transcript"; call: VapiCall; transcript: { role: string; text: string }[] } };

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const vapi = {
  // Assistants
  assistants: {
    list: () => vapiFetch<VapiAssistant[]>("/assistant"),

    get: (id: string) => vapiFetch<VapiAssistant>(`/assistant/${id}`),

    create: (config: {
      name: string;
      model: { provider: string; model: string; systemPrompt: string };
      voice: { provider: string; voiceId: string };
      firstMessage?: string;
      serverUrl?: string;
    }) =>
      vapiFetch<VapiAssistant>("/assistant", {
        method: "POST",
        body: config,
      }),

    update: (id: string, updates: Partial<VapiAssistant>) =>
      vapiFetch<VapiAssistant>(`/assistant/${id}`, {
        method: "PATCH",
        body: updates,
      }),
  },

  // Calls
  calls: {
    list: (params?: { assistantId?: string; limit?: number }) =>
      vapiFetch<VapiCall[]>(
        `/call${params ? "?" + new URLSearchParams(params as Record<string, string>).toString() : ""}`
      ),

    get: (id: string) => vapiFetch<VapiCall>(`/call/${id}`),

    /**
     * Create an outbound call.
     * Used for AI-initiated follow-ups (e.g., meeting confirmation, re-engagement).
     */
    create: (config: {
      assistantId: string;
      customer: { number: string; name?: string };
      assistantOverrides?: {
        firstMessage?: string;
        model?: { systemPrompt?: string };
      };
    }) =>
      vapiFetch<VapiCall>("/call", {
        method: "POST",
        body: { ...config, type: "outboundPhoneCall" },
      }),
  },

  // Phone Numbers
  phoneNumbers: {
    list: () => vapiFetch<VapiPhoneNumber[]>("/phone-number"),

    get: (id: string) => vapiFetch<VapiPhoneNumber>(`/phone-number/${id}`),
  },

  // ---------------------------------------------------------------------------
  // Webhook parsing
  // ---------------------------------------------------------------------------

  parseWebhook: (payload: Record<string, unknown>): {
    eventType: string;
    callId: string | null;
    call: VapiCall | null;
    transcript: string | null;
    summary: string | null;
    recordingUrl: string | null;
    analysis: VapiCall["analysis"] | null;
    functionCall: { name: string; parameters: Record<string, unknown> } | null;
  } => {
    const message = payload.message as Record<string, unknown> | undefined;
    if (!message) {
      return {
        eventType: "unknown",
        callId: null,
        call: null,
        transcript: null,
        summary: null,
        recordingUrl: null,
        analysis: null,
        functionCall: null,
      };
    }

    const call = message.call as VapiCall | undefined;

    return {
      eventType: (message.type as string) || "unknown",
      callId: call?.id || null,
      call: call || null,
      transcript: (message.transcript as string) || null,
      summary: (message.summary as string) || null,
      recordingUrl: (message.recordingUrl as string) || null,
      analysis: (message.analysis as VapiCall["analysis"]) || null,
      functionCall: (message.functionCall as { name: string; parameters: Record<string, unknown> }) || null,
    };
  },
};
