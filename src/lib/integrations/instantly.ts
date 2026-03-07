// Instantly.ai API client for email campaign management
// API v2 — https://developer.instantly.ai/api/v2
// Auth: Bearer token via INSTANTLY_API_KEY

const INSTANTLY_BASE = process.env.INSTANTLY_BASE_URL || "https://api.instantly.ai/api/v2";
const INSTANTLY_KEY = () => process.env.INSTANTLY_API_KEY || "";

// ---------------------------------------------------------------------------
// Rate limiter — Instantly doesn't publish hard limits, but community reports
// suggest ~10 req/s burst is safe. We use a simple token-bucket at 10 req/s.
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
    // Wait until a token is available
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

const instantlyLimiter = new RateLimiter(10, 10); // 10 tokens max, refill 10/sec

// ---------------------------------------------------------------------------
// Generic fetch wrapper
// ---------------------------------------------------------------------------

interface InstantlyRequestOptions {
  method?: string;
  body?: unknown;
  params?: Record<string, string>;
}

async function instantlyFetch<T>(
  endpoint: string,
  options: InstantlyRequestOptions = {}
): Promise<T> {
  await instantlyLimiter.waitForToken();

  const url = new URL(`${INSTANTLY_BASE}${endpoint}`);
  if (options.params) {
    for (const [k, v] of Object.entries(options.params)) {
      url.searchParams.set(k, v);
    }
  }

  const res = await fetch(url.toString(), {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${INSTANTLY_KEY()}`,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Instantly API error (${res.status}): ${error}`);
  }

  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Campaign management
// ---------------------------------------------------------------------------

export const instantly = {
  campaigns: {
    /** List campaigns — GET /campaigns */
    list: () =>
      instantlyFetch<{ items: unknown[]; next_starting_after?: string }>("/campaigns", {
        params: { limit: "100" },
      }),

    /** Get a single campaign — GET /campaigns/{id} */
    get: (id: string) => instantlyFetch<unknown>(`/campaigns/${id}`),

    /** Create a campaign — POST /campaigns */
    create: (data: {
      name: string;
      campaign_schedule?: unknown;
    }) => instantlyFetch<{ id: string }>("/campaigns", { method: "POST", body: data }),

    /**
     * Activate (launch) a campaign — POST /campaigns/{id}/activate
     * NOTE: v2 uses "activate" not "launch".
     */
    activate: (id: string) =>
      instantlyFetch(`/campaigns/${id}/activate`, { method: "POST" }),

    /** Pause a campaign — POST /campaigns/{id}/pause */
    pause: (id: string) =>
      instantlyFetch(`/campaigns/${id}/pause`, { method: "POST" }),

    /**
     * Get campaign analytics — GET /campaigns/analytics?id={id}
     * In v2, analytics is a top-level resource under /campaigns/analytics,
     * NOT nested under /campaigns/{id}/analytics.
     * Omit `id` to get analytics for all campaigns.
     */
    analytics: (id?: string) =>
      instantlyFetch<Record<string, unknown>>("/campaigns/analytics", {
        params: id ? { id } : {},
      }),
  },

  leads: {
    /**
     * Add leads — POST /leads
     * In v2, leads are a top-level resource. Campaign association is
     * done via `campaign_id` in the body, not in the URL path.
     */
    add: (
      campaignId: string,
      leads: {
        email: string;
        first_name?: string;
        last_name?: string;
        company_name?: string;
        custom_variables?: Record<string, string | number | boolean | null>;
      }[]
    ) =>
      instantlyFetch<unknown[]>("/leads", {
        method: "POST",
        body: leads.map((lead) => ({
          ...lead,
          campaign_id: campaignId,
        })),
      }),

    /**
     * List leads — GET /leads?campaign_id={id}
     * In v2, leads are queried via query params, not nested paths.
     */
    list: (campaignId: string) =>
      instantlyFetch<{ items: unknown[]; next_starting_after?: string }>("/leads", {
        params: { campaign_id: campaignId, limit: "100" },
      }),

    /**
     * Get a single lead by email within a campaign — GET /leads?campaign_id={id}&email={email}
     */
    getStatus: (campaignId: string, email: string) =>
      instantlyFetch<{ items: unknown[] }>("/leads", {
        params: { campaign_id: campaignId, email },
      }),

    /**
     * Delete (remove) a lead from a campaign — DELETE /leads
     * This removes the specific lead without affecting other leads in the campaign.
     */
    delete: (campaignId: string, email: string) =>
      instantlyFetch<unknown>("/leads", {
        method: "DELETE",
        body: { campaign_id: campaignId, email },
      }),
  },

  accounts: {
    /** List email sending accounts — GET /accounts */
    list: () =>
      instantlyFetch<{ items: { id: string; email: string }[]; next_starting_after?: string }>(
        "/accounts",
        { params: { limit: "100" } }
      ),
  },

  // ---------------------------------------------------------------------------
  // Webhook payload parser
  // ---------------------------------------------------------------------------
  parseWebhook: (payload: Record<string, unknown>) => ({
    eventType: payload.event_type as string,
    campaignId: payload.campaign_id as string,
    leadEmail: payload.lead_email as string,
    replyText: payload.reply_text as string | undefined,
    timestamp: payload.timestamp as string,
  }),
};
