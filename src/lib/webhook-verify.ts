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
 * Returns true if no secret is configured (opt-in verification).
 */
export async function verifyWebhookSecret(
  headerValue: string | null,
  integrationName: string,
  secretKeyName: string
): Promise<boolean> {
  const secret = await getKey(secretKeyName);
  if (!secret) {
    // No secret configured — allow (opt-in verification)
    return true;
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
 * Verify Gmail/Pub/Sub webhook via subscription match
 */
export async function verifyGmailWebhook(subscription: string): Promise<boolean> {
  const expected = await getKey("GMAIL_PUBSUB_SUBSCRIPTION");
  if (!expected) return true; // No subscription configured — allow
  return subscription === expected;
}
