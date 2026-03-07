// Resolves API keys from the Integration table, falling back to env vars.
// Keys entered on the /integrations page are stored encrypted in the DB config column.
// This module provides a single getKey() that the rest of the codebase calls.

import { prisma } from "@/lib/prisma";
import { safeParseJSON } from "@/lib/safe-json";

// Map from logical key name → { integration DB name, config field, env var fallback }
const KEY_MAP: Record<string, { integration: string; field: string; env: string }> = {
  // AI
  ANTHROPIC_API_KEY: { integration: "anthropic", field: "api_key", env: "ANTHROPIC_API_KEY" },

  // Prospecting & Enrichment
  APOLLO_API_KEY: { integration: "apollo", field: "api_key", env: "APOLLO_API_KEY" },

  // Cold Email
  INSTANTLY_API_KEY: { integration: "instantly", field: "api_key", env: "INSTANTLY_API_KEY" },

  // LinkedIn Automation
  MEET_ALFRED_API_KEY: { integration: "meet_alfred", field: "api_key", env: "MEET_ALFRED_API_KEY" },
  MEET_ALFRED_BASE_URL: { integration: "meet_alfred", field: "base_url", env: "MEET_ALFRED_BASE_URL" },

  // Billing
  STRIPE_SECRET_KEY: { integration: "stripe", field: "secret_key", env: "STRIPE_SECRET_KEY" },
  STRIPE_WEBHOOK_SECRET: { integration: "stripe", field: "webhook_secret", env: "STRIPE_WEBHOOK_SECRET" },

  // Proposals
  PANDADOCS_API_KEY: { integration: "pandadocs", field: "api_key", env: "PANDADOCS_API_KEY" },

  // Meeting Transcripts
  TLDV_API_KEY: { integration: "tldv", field: "api_key", env: "TLDV_API_KEY" },

  // AI Voice
  VAPI_API_KEY: { integration: "vapi", field: "api_key", env: "VAPI_API_KEY" },

  // Gmail / Google
  GOOGLE_CLIENT_ID: { integration: "google", field: "client_id", env: "GOOGLE_CLIENT_ID" },
  GOOGLE_CLIENT_SECRET: { integration: "google", field: "client_secret", env: "GOOGLE_CLIENT_SECRET" },

  // Zapier Webhooks (LinkedIn, Twitter, generic automation)
  ZAPIER_WEBHOOK_LINKEDIN_POST: { integration: "zapier_linkedin", field: "webhook_url", env: "ZAPIER_WEBHOOK_LINKEDIN_POST" },
  ZAPIER_WEBHOOK_TWITTER_POST: { integration: "zapier_twitter", field: "webhook_url", env: "ZAPIER_WEBHOOK_TWITTER_POST" },
  ZAPIER_WEBHOOK_GENERIC: { integration: "zapier_generic", field: "webhook_url", env: "ZAPIER_WEBHOOK_GENERIC" },
};

// In-memory cache to avoid DB lookups on every call (cleared on save)
let cache: Record<string, string> = {};
let cacheLoadedAt = 0;
const CACHE_TTL_MS = 60_000; // 1 minute

async function loadCache(): Promise<void> {
  if (Date.now() - cacheLoadedAt < CACHE_TTL_MS && Object.keys(cache).length > 0) return;

  try {
    const integrations = await prisma.integration.findMany({
      where: { isActive: true },
      select: { name: true, config: true },
    });

    const newCache: Record<string, string> = {};
    for (const integ of integrations) {
      const config = safeParseJSON<Record<string, string>>(integ.config, {});
      for (const [logicalKey, mapping] of Object.entries(KEY_MAP)) {
        if (mapping.integration === integ.name && config[mapping.field]) {
          newCache[logicalKey] = config[mapping.field];
        }
      }
    }

    // Also inject into process.env so lazy-init modules (Stripe, Anthropic)
    // pick up DB-stored keys without code changes
    for (const [key, value] of Object.entries(newCache)) {
      const mapping = KEY_MAP[key];
      if (mapping && !process.env[mapping.env]) {
        process.env[mapping.env] = value;
      }
    }

    cache = newCache;
    cacheLoadedAt = Date.now();
  } catch {
    // DB not available (e.g., during build) — fall through to env vars
  }
}

/**
 * Get an API key. Checks DB-stored integration config first, then env var.
 * Returns undefined if neither is set.
 */
export async function getKey(name: string): Promise<string | undefined> {
  await loadCache();

  // DB value takes priority
  if (cache[name]) return cache[name];

  // Fall back to env var
  const mapping = KEY_MAP[name];
  if (mapping) return process.env[mapping.env] || undefined;

  // Unknown key — try env directly
  return process.env[name] || undefined;
}

/**
 * Synchronous env-only fallback for use in module initialization.
 * Prefer getKey() in async contexts.
 */
export function getKeySync(name: string): string | undefined {
  // Check cache first (may be stale or empty)
  if (cache[name]) return cache[name];

  const mapping = KEY_MAP[name];
  return mapping ? process.env[mapping.env] || undefined : process.env[name] || undefined;
}

/** Clear the cache (call after saving integration config) */
export function clearKeyCache(): void {
  cache = {};
  cacheLoadedAt = 0;
}
