// Inbound API authentication — validates site API keys and rate limits requests.
// Used by all /api/inbound/* endpoints for website integration.

import { NextRequest } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";

// ============================================
// API KEY VALIDATION
// ============================================

/**
 * Validates the x-api-key header against the SiteApiKey table.
 * Hashes the provided key with SHA-256 and looks up the keyHash.
 * Updates lastUsedAt on successful validation.
 * Returns true if the key is valid and active, false otherwise.
 */
export async function validateSiteApiKey(request: NextRequest): Promise<boolean> {
  const apiKey = request.headers.get("x-api-key");
  if (!apiKey) return false;

  const keyHash = crypto.createHash("sha256").update(apiKey).digest("hex");

  try {
    const siteKey = await prisma.siteApiKey.findUnique({
      where: { keyHash },
    });

    if (!siteKey || !siteKey.isActive) return false;

    // Update lastUsedAt (fire-and-forget, don't block the response)
    prisma.siteApiKey
      .update({
        where: { id: siteKey.id },
        data: { lastUsedAt: new Date() },
      })
      .catch((err) => {
        console.error("Failed to update SiteApiKey lastUsedAt:", err);
      });

    return true;
  } catch (err) {
    console.error("SiteApiKey validation error:", err);
    return false;
  }
}

// ============================================
// RATE LIMITER — in-memory token bucket
// ============================================

interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

const RATE_LIMIT_MAX_TOKENS = 100; // max requests per window
const RATE_LIMIT_REFILL_INTERVAL_MS = 60_000; // 1 minute
const buckets = new Map<string, TokenBucket>();

// Periodic cleanup to prevent memory leaks from stale keys
const CLEANUP_INTERVAL_MS = 5 * 60_000; // every 5 minutes
let lastCleanup = Date.now();

function cleanupStaleBuckets(): void {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;

  const staleThreshold = now - 10 * 60_000; // 10 minutes of inactivity
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.lastRefill < staleThreshold) {
      buckets.delete(key);
    }
  }
}

/**
 * Extracts the API key prefix for use as the rate limit identifier.
 * Returns the first 8 characters of the key, or the full key if shorter.
 */
function getKeyPrefix(request: NextRequest): string {
  const apiKey = request.headers.get("x-api-key") || "unknown";
  return apiKey.substring(0, 8);
}

/**
 * Checks whether the request is within rate limits.
 * Uses Redis-backed sliding window when available, falls back to in-memory token bucket.
 * 100 requests per minute per API key prefix.
 */
export function checkRateLimit(request: NextRequest): boolean | Promise<boolean> {
  // Try Redis-backed rate limiter first
  if (process.env.REDIS_URL) {
    return checkRateLimitAsync(request);
  }

  // Fallback: in-memory token bucket
  return checkRateLimitInMemory(request);
}

async function checkRateLimitAsync(request: NextRequest): Promise<boolean> {
  try {
    const { checkRateLimitRedis } = await import("./redis");
    const key = getKeyPrefix(request);
    return checkRateLimitRedis(key, RATE_LIMIT_MAX_TOKENS, RATE_LIMIT_REFILL_INTERVAL_MS);
  } catch {
    // Redis unavailable — fall back to in-memory
    return checkRateLimitInMemory(request);
  }
}

function checkRateLimitInMemory(request: NextRequest): boolean {
  cleanupStaleBuckets();

  const key = getKeyPrefix(request);
  const now = Date.now();

  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { tokens: RATE_LIMIT_MAX_TOKENS, lastRefill: now };
    buckets.set(key, bucket);
  }

  // Refill tokens based on elapsed time
  const elapsed = now - bucket.lastRefill;
  if (elapsed > 0) {
    const tokensToAdd = Math.floor(
      (elapsed / RATE_LIMIT_REFILL_INTERVAL_MS) * RATE_LIMIT_MAX_TOKENS
    );
    if (tokensToAdd > 0) {
      bucket.tokens = Math.min(RATE_LIMIT_MAX_TOKENS, bucket.tokens + tokensToAdd);
      bucket.lastRefill = now;
    }
  }

  // Consume a token
  if (bucket.tokens > 0) {
    bucket.tokens--;
    return true;
  }

  return false;
}
