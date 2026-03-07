// Apollo.io API client for prospect discovery and enrichment
// Docs: https://docs.apollo.io/
// Auth: X-Api-Key header (master API key required for enrichment)
// Rate limits: ~100 req/min per endpoint (fixed-window), 10/sec burst

const APOLLO_BASE = "https://api.apollo.io/api/v1";
const APOLLO_KEY = () => process.env.APOLLO_API_KEY || "";

// ---------------------------------------------------------------------------
// Rate limiter — Apollo uses fixed-window: ~100 req/min, 10/sec burst.
// We model as token bucket: 10 burst, 1.6/sec refill (~100/min).
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

// Separate limiters for different endpoint groups
const searchLimiter = new RateLimiter(10, 1.6); // ~100/min
const enrichmentLimiter = new RateLimiter(10, 1.6); // ~100/min
const bulkLimiter = new RateLimiter(2, 0.16); // ~10/min

// ---------------------------------------------------------------------------
// Generic fetch wrappers
// ---------------------------------------------------------------------------

interface ApolloRequestOptions {
  method?: string;
  body?: unknown;
  params?: Record<string, string>;
}

async function apolloFetchPost<T>(
  endpoint: string,
  options: ApolloRequestOptions = {},
  limiter: RateLimiter = searchLimiter
): Promise<T> {
  await limiter.waitForToken();

  const url = new URL(`${APOLLO_BASE}${endpoint}`);
  if (options.params) {
    for (const [k, v] of Object.entries(options.params)) {
      url.searchParams.set(k, v);
    }
  }

  const res = await fetch(url.toString(), {
    method: options.method || "POST",
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
      "X-Api-Key": APOLLO_KEY(),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Apollo API error (${res.status}): ${error}`);
  }

  return res.json() as Promise<T>;
}

async function apolloFetchGet<T>(
  endpoint: string,
  params: Record<string, string> = {},
  limiter: RateLimiter = enrichmentLimiter
): Promise<T> {
  await limiter.waitForToken();

  const url = new URL(`${APOLLO_BASE}${endpoint}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
      "X-Api-Key": APOLLO_KEY(),
    },
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Apollo API error (${res.status}): ${error}`);
  }

  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ApolloPersonResult {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  title: string;
  linkedin_url: string;
  phone_numbers?: { raw_number: string; type: string }[];
  city: string;
  state: string;
  country: string;
  organization: {
    name: string;
    website_url: string;
    industry: string;
    estimated_num_employees: number;
    annual_revenue: number;
  };
}

export interface ApolloSearchParams {
  person_titles?: string[];
  person_locations?: string[];
  organization_industry_tag_ids?: string[];
  organization_num_employees_ranges?: string[];
  organization_locations?: string[];
  currently_using_any_of_technology_uids?: string[];
  q_keywords?: string;
  page?: number;
  per_page?: number;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const apollo = {
  /**
   * Search for people matching criteria.
   *
   * CORRECTED: The v1 API search endpoint is /mixed_people/api_search (not /mixed_people/search).
   * The /api_search variant is optimized for programmatic use.
   * Method: POST
   */
  peopleSearch: (params: ApolloSearchParams) =>
    apolloFetchPost<{
      people: ApolloPersonResult[];
      pagination: { total_entries: number; total_pages: number; page: number };
    }>(
      "/mixed_people/api_search",
      {
        method: "POST",
        body: {
          ...params,
          page: params.page || 1,
          per_page: params.per_page || 25,
        },
      },
      searchLimiter
    ),

  /**
   * Enrich a person by email.
   * Endpoint: POST /people/match
   */
  enrichPerson: (email: string) =>
    apolloFetchPost<{ person: ApolloPersonResult }>(
      "/people/match",
      {
        method: "POST",
        body: { email },
      },
      enrichmentLimiter
    ),

  /**
   * Enrich a company by domain.
   *
   * CORRECTED: This is a GET request, not POST.
   * Endpoint: GET /organizations/enrich?domain={domain}
   */
  enrichCompany: (domain: string) =>
    apolloFetchGet<{
      organization: {
        name: string;
        website_url: string;
        industry: string;
        estimated_num_employees: number;
        annual_revenue: number;
        description: string;
        linkedin_url: string;
        phone: string;
        city: string;
        state: string;
        country: string;
      };
    }>("/organizations/enrich", { domain }, enrichmentLimiter),

  /**
   * Bulk enrich contacts (up to 10 per call).
   * Endpoint: POST /people/bulk_match
   */
  bulkEnrich: (emails: string[]) =>
    apolloFetchPost<{ matches: ApolloPersonResult[] }>(
      "/people/bulk_match",
      {
        method: "POST",
        body: { details: emails.map((email) => ({ email })) },
      },
      bulkLimiter
    ),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert Apollo person to our Prospect format */
export function apolloToProspect(person: ApolloPersonResult) {
  // Extract primary phone number from Apollo's phone_numbers array
  const primaryPhone = person.phone_numbers?.find(
    (p) => p.type === "mobile" || p.type === "direct"
  )?.raw_number || person.phone_numbers?.[0]?.raw_number;

  return {
    firstName: person.first_name,
    lastName: person.last_name,
    email: person.email,
    phone: primaryPhone,
    jobTitle: person.title,
    linkedinUrl: person.linkedin_url,
    companyName: person.organization?.name,
    companyDomain: person.organization?.website_url
      ?.replace(/^https?:\/\//, "")
      .replace(/\/$/, ""),
    companySize: person.organization?.estimated_num_employees
      ? categorizeSize(person.organization.estimated_num_employees)
      : undefined,
    industry: person.organization?.industry,
    location: [person.city, person.state, person.country].filter(Boolean).join(", "),
    enrichedData: JSON.stringify(person),
  };
}

function categorizeSize(employees: number): string {
  if (employees <= 10) return "1-10";
  if (employees <= 50) return "11-50";
  if (employees <= 200) return "51-200";
  if (employees <= 500) return "201-500";
  if (employees <= 1000) return "501-1000";
  return "1001+";
}
