// Webhook signature verification utilities
// Each service uses a different verification mechanism:
// - PandaDocs: shared key in x-pandadocs-signature header
// - Vapi: server secret in x-vapi-secret header
// - Instantly: webhook signing secret in x-instantly-signature header
// - tl;dv: shared secret in x-tldv-signature header
// - Gmail/Pub/Sub: Bearer JWT in Authorization header
// - Alfred: shared secret in x-alfred-signature header
//
// For services where we don't yet have the verification docs nailed down,
// we use a simple shared-secret approach: compare a header value against
// a stored secret from our Integration table.

import { getKey } from "./integration-keys";

/**
 * Verify a webhook by comparing a header value to a stored secret.
 * Returns true if verified, false if secret is configured but doesn't match.
 * Returns false if no secret is configured (secure default).
 */
export async function verifyWebhookSecret(
  headerValue: string | null,
  integrationName: string,
  secretKeyName: string
): Promise<boolean> {
  const secret = await getKey(secretKeyName);
  if (!secret) {
    // No secret configured — reject (secure default)
    return false;
  }
  return headerValue === secret;
}

/**
 * Verify Vapi webhook via x-vapi-secret header
 */
export async function verifyVapiWebhook(request: Request): Promise<boolean> {
  const secret = request.headers.get("x-vapi-secret");
  return verifyWebhookSecret(secret, "vapi", "VAPI_WEBHOOK_SECRET");
}

/**
 * Verify PandaDocs webhook via shared key
 */
export async function verifyPandaDocsWebhook(request: Request): Promise<boolean> {
  const signature = request.headers.get("x-pandadocs-signature");
  return verifyWebhookSecret(signature, "pandadocs", "PANDADOCS_WEBHOOK_KEY");
}

/**
 * Verify Instantly webhook
 */
export async function verifyInstantlyWebhook(request: Request): Promise<boolean> {
  const signature = request.headers.get("x-instantly-signature");
  return verifyWebhookSecret(signature, "instantly", "INSTANTLY_WEBHOOK_SECRET");
}

/**
 * Verify tl;dv webhook
 */
export async function verifyTldvWebhook(request: Request): Promise<boolean> {
  const signature = request.headers.get("x-tldv-signature");
  return verifyWebhookSecret(signature, "tldv", "TLDV_WEBHOOK_SECRET");
}

/**
 * Verify Meet Alfred webhook
 */
export async function verifyAlfredWebhook(request: Request): Promise<boolean> {
  const signature = request.headers.get("x-alfred-signature");
  return verifyWebhookSecret(signature, "meet_alfred", "ALFRED_WEBHOOK_SECRET");
}

/**
 * Verify Gmail/Pub/Sub webhook via subscription match AND Bearer JWT validation.
 * Google Cloud Pub/Sub sends a signed JWT in the Authorization header.
 * We verify: 1) subscription matches, 2) JWT signature is valid from Google.
 */
export async function verifyGmailWebhook(subscription: string, request?: Request): Promise<boolean> {
  // Step 1: Subscription match
  const expected = await getKey("GMAIL_PUBSUB_SUBSCRIPTION");
  if (!expected) return false; // No subscription configured — reject (secure default)
  if (subscription !== expected) return false;

  // Step 2: JWT verification (if request provided)
  if (request) {
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) return false;
    const token = authHeader.slice(7);

    try {
      // Decode JWT header to get key ID
      const [headerB64] = token.split(".");
      const header = JSON.parse(Buffer.from(headerB64, "base64url").toString());
      const kid = header.kid;

      // Fetch Google's public keys
      const certsRes = await fetch("https://www.googleapis.com/oauth2/v3/certs");
      if (!certsRes.ok) return false;
      const certs = await certsRes.json() as { keys: Array<{ kid: string; n: string; e: string; kty: string }> };
      const key = certs.keys.find((k: { kid: string }) => k.kid === kid);
      if (!key) return false;

      // Verify JWT using Web Crypto API
      const cryptoKey = await crypto.subtle.importKey(
        "jwk",
        { kty: key.kty, n: key.n, e: key.e, alg: "RS256", ext: true },
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["verify"]
      );

      const [, payloadB64, signatureB64] = token.split(".");
      const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
      const signature = Buffer.from(signatureB64, "base64url");

      const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", cryptoKey, signature, data);
      if (!valid) return false;

      // Check claims
      const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString());
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp && payload.exp < now) return false;
      if (payload.iss !== "accounts.google.com" && payload.iss !== "https://accounts.google.com") return false;

      return true;
    } catch (err) {
      console.error("[webhook-verify] Gmail JWT verification failed:", err);
      return false;
    }
  }

  return true; // Subscription matched, no request for JWT check
}
