// PhantomBuster API client for LinkedIn automation
// API v2 — https://hub.phantombuster.com/docs/api
// Auth: X-Phantombuster-Key-1 header
//
// Two Phantoms used:
// 1. LinkedIn Outreach — connect + follow-up messages (new prospects)
// 2. LinkedIn Message Sender — DM existing connections
//
// The CRM generates AI-personalized messages, then launches PhantomBuster
// to deliver them via LinkedIn. PhantomBuster handles browser automation,
// rate limiting, and LinkedIn session management.

const PB_BASE = "https://api.phantombuster.com/api/v2";
const PB_KEY = () => process.env.PHANTOMBUSTER_API_KEY || "";

// ---------------------------------------------------------------------------
// Rate limiter — conservative 2 req/s to stay well within any undocumented limits
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

const pbLimiter = new RateLimiter(5, 2);

// ---------------------------------------------------------------------------
// Generic fetch wrapper
// ---------------------------------------------------------------------------

interface PBRequestOptions {
  method?: string;
  body?: unknown;
  params?: Record<string, string>;
}

async function pbFetch<T>(
  endpoint: string,
  options: PBRequestOptions = {}
): Promise<T> {
  await pbLimiter.waitForToken();

  const url = new URL(`${PB_BASE}${endpoint}`);
  if (options.params) {
    for (const [k, v] of Object.entries(options.params)) {
      url.searchParams.set(k, v);
    }
  }

  const res = await fetch(url.toString(), {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      "X-Phantombuster-Key-1": PB_KEY(),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`PhantomBuster API error (${res.status}): ${error}`);
  }

  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

interface PBAgent {
  id: string;
  name: string;
  scriptId: string;
  lastEndStatus: string;
  lastEndMessage: string;
  s3Folder: string;
  orgS3Folder: string;
  containerId: string;
  launchType: string;
}

interface PBLaunchResponse {
  status: string;
  data: {
    containerId: string;
  };
}

interface PBFetchResponse {
  status: string;
  data: PBAgent;
}

interface PBFetchAllResponse {
  status: string;
  data: PBAgent[];
}

interface PBFetchOutputResponse {
  status: string;
  data: {
    output: string;
    containerId: string;
    status: string;
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const phantombuster = {
  agents: {
    /**
     * Launch a Phantom — POST /agents/launch
     *
     * @param id - Phantom/Agent ID (from the PhantomBuster dashboard URL)
     * @param bonusArgument - One-time argument override (merged with saved config)
     *   Pass as an object — it will be JSON-stringified for the API.
     */
    launch: (id: string, bonusArgument?: Record<string, unknown>) =>
      pbFetch<PBLaunchResponse>("/agents/launch", {
        method: "POST",
        body: {
          id,
          ...(bonusArgument ? { bonusArgument: JSON.stringify(bonusArgument) } : {}),
        },
      }),

    /** Fetch a Phantom's info — GET /agents/fetch?id={id} */
    fetch: (id: string) =>
      pbFetch<PBFetchResponse>("/agents/fetch", { params: { id } }),

    /** Fetch all Phantoms — GET /agents/fetch-all */
    fetchAll: () => pbFetch<PBFetchAllResponse>("/agents/fetch-all"),

    /** Fetch console output of the most recent run — GET /agents/fetch-output?id={id} */
    fetchOutput: (id: string) =>
      pbFetch<PBFetchOutputResponse>("/agents/fetch-output", { params: { id } }),

    /** Stop a running Phantom — POST /agents/stop */
    stop: (id: string) =>
      pbFetch<{ status: string }>("/agents/stop", { method: "POST", body: { id } }),
  },

  /**
   * Fetch result file (CSV/JSON) from a completed Phantom run.
   * Constructs the S3 URL from the agent's folder paths.
   */
  fetchResults: async (agent: PBAgent, format: "csv" | "json" = "json"): Promise<unknown> => {
    const url = `https://phantombuster.s3.amazonaws.com/${agent.orgS3Folder}/${agent.s3Folder}/result.${format}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to fetch PhantomBuster results (${res.status}): ${url}`);
    }
    if (format === "json") {
      return res.json();
    }
    return res.text();
  },

  // ---------------------------------------------------------------------------
  // LinkedIn-specific helpers
  // ---------------------------------------------------------------------------

  linkedin: {
    /**
     * Launch the LinkedIn Outreach phantom to send a connection request
     * with a personalized message. For prospects NOT yet connected.
     *
     * The phantom must be pre-configured in PB's dashboard. This function
     * passes the LinkedIn URL and message as a one-time override.
     *
     * @param phantomId - The Outreach phantom's agent ID
     * @param profileUrl - LinkedIn profile URL of the prospect
     * @param message - Personalized connection request message (max 300 chars for LinkedIn)
     */
    sendConnectionRequest: async (
      phantomId: string,
      profileUrl: string,
      message: string
    ) => {
      // LinkedIn truncates connection messages at 300 chars
      const truncatedMessage = message.length > 300 ? message.substring(0, 297) + "..." : message;

      return phantombuster.agents.launch(phantomId, {
        profileUrl,
        message: truncatedMessage,
      });
    },

    /**
     * Launch the LinkedIn Message Sender phantom to DM an existing connection.
     *
     * @param phantomId - The Message Sender phantom's agent ID
     * @param profileUrl - LinkedIn profile URL of the connection
     * @param message - Personalized message to send
     */
    sendMessage: async (
      phantomId: string,
      profileUrl: string,
      message: string
    ) => {
      return phantombuster.agents.launch(phantomId, {
        profileUrl,
        message,
      });
    },
  },
};
