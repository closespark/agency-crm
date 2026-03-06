// Meet Alfred API client for LinkedIn campaign management
//
// IMPORTANT: Meet Alfred does NOT provide a full REST API. They expose a limited
// set of endpoints through their Zapier/webhook integration layer. The available
// operations are:
//   - Authenticate (verify API key)
//   - Get campaigns (list active campaigns)
//   - Get leads (list leads)
//   - Add new lead (to a campaign)
//   - Get connections
//   - Get replies
//   - Get team members
//   - Get last actions
//
// There is NO API for:
//   - Creating campaigns (must be done in the Alfred UI)
//   - Starting/pausing campaigns (must be done in the Alfred UI)
//   - Campaign analytics (use Get Last Actions + manual aggregation)
//
// Auth: API key passed as query parameter `api_key`.
// Base URL: https://app.meetalfred.com/api/integrations/zapier
// Docs: https://help.meetalfred.com/en/articles/8346318-meet-alfred-webhooks-integration

const ALFRED_BASE =
  process.env.MEET_ALFRED_BASE_URL ||
  "https://app.meetalfred.com/api/integrations/zapier";
const ALFRED_KEY = () => process.env.MEET_ALFRED_API_KEY || "";

// ---------------------------------------------------------------------------
// Rate limiter — Alfred doesn't document rate limits; be conservative (2 req/s)
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

const alfredLimiter = new RateLimiter(5, 2); // 5 token burst, 2/sec refill

// ---------------------------------------------------------------------------
// Generic fetch wrapper
// ---------------------------------------------------------------------------

interface AlfredRequestOptions {
  method?: string;
  body?: unknown;
  /** Extra query params beyond api_key */
  params?: Record<string, string>;
}

async function alfredFetch<T>(
  endpoint: string,
  options: AlfredRequestOptions = {}
): Promise<T> {
  await alfredLimiter.waitForToken();

  const url = new URL(`${ALFRED_BASE}${endpoint}`);

  // Alfred authenticates via api_key query parameter
  url.searchParams.set("api_key", ALFRED_KEY());

  if (options.params) {
    for (const [k, v] of Object.entries(options.params)) {
      url.searchParams.set(k, v);
    }
  }

  const res = await fetch(url.toString(), {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Meet Alfred API error (${res.status}): ${error}`);
  }

  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const meetAlfred = {
  /** Verify that the API key is valid */
  authenticate: () =>
    alfredFetch<{ authenticated: boolean }>("/authenticate"),

  campaigns: {
    /** List active campaigns (read-only — cannot create/start/pause via API) */
    list: () => alfredFetch<unknown[]>("/campaigns"),

    /**
     * Get campaign details by ID.
     * NOTE: Alfred's API does not have a dedicated get-by-id endpoint.
     * We fetch all campaigns and filter client-side.
     */
    get: async (id: string) => {
      const campaigns = await alfredFetch<{ id: string; [k: string]: unknown }[]>("/campaigns");
      return campaigns.find((c) => c.id === id) || null;
    },

    // -----------------------------------------------------------------------
    // The following operations are NOT available via Alfred's API.
    // They must be done in the Alfred web UI.
    // Keeping stubs so callers get a clear error instead of a runtime crash.
    // -----------------------------------------------------------------------

    /** @throws Always — campaign creation is not supported via API */
    create: (_data: {
      name: string;
      type: string;
      steps: { message: string; delay_days: number }[];
    }): Promise<never> => {
      throw new Error(
        "Meet Alfred does not support campaign creation via API. " +
          "Create campaigns in the Alfred web UI at https://app.meetalfred.com"
      );
    },

    /** @throws Always — campaign start is not supported via API */
    start: (_id: string): Promise<never> => {
      throw new Error(
        "Meet Alfred does not support starting campaigns via API. " +
          "Start campaigns in the Alfred web UI."
      );
    },

    /** @throws Always — campaign pause is not supported via API */
    pause: (_id: string): Promise<never> => {
      throw new Error(
        "Meet Alfred does not support pausing campaigns via API. " +
          "Pause campaigns in the Alfred web UI."
      );
    },

    /** @throws Always — structured analytics not available via API */
    analytics: (_id: string): Promise<never> => {
      throw new Error(
        "Meet Alfred does not expose campaign analytics via API. " +
          "Use meetAlfred.actions.getRecent() for recent activity data, " +
          "or view analytics in the Alfred web UI."
      );
    },
  },

  leads: {
    /**
     * Add a lead to a campaign.
     * This is one of the few write operations Alfred supports via API.
     */
    add: (
      campaignId: string,
      leads: {
        linkedin_url: string;
        first_name?: string;
        last_name?: string;
        company?: string;
        title?: string;
      }[]
    ) => {
      // Alfred's add-lead endpoint accepts one lead at a time
      // We serialize calls to respect rate limits
      return Promise.all(
        leads.map((lead) =>
          alfredFetch("/add-new-lead", {
            method: "POST",
            body: {
              campaign_id: campaignId,
              ...lead,
            },
          })
        )
      );
    },

    /** List leads */
    list: (campaignId?: string) =>
      alfredFetch<unknown[]>("/leads", {
        params: campaignId ? { campaign_id: campaignId } : {},
      }),
  },

  /** Get recent actions (the closest thing to analytics via API) */
  actions: {
    getRecent: () => alfredFetch<unknown[]>("/last-actions"),
  },

  /** Get replies */
  replies: {
    list: () => alfredFetch<unknown[]>("/replies"),
  },

  /** Get connections */
  connections: {
    list: () => alfredFetch<unknown[]>("/connections"),
  },

  /** Get team members */
  team: {
    list: () => alfredFetch<unknown[]>("/team-members"),
  },

  // ---------------------------------------------------------------------------
  // Webhook payload parser
  // Alfred sends webhook events for connection_accepted, message_sent,
  // message_replied, etc. These are configured in Alfred's UI and POSTed
  // to our webhook endpoint.
  // ---------------------------------------------------------------------------
  parseWebhook: (payload: Record<string, unknown>) => ({
    eventType: payload.event as string,
    campaignId: payload.campaign_id as string,
    linkedinUrl: payload.linkedin_url as string,
    message: payload.message as string | undefined,
    timestamp: payload.timestamp as string,
  }),
};
