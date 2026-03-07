// Zapier Webhook Integration — bridges the gap for platforms without full APIs.
// Used for: LinkedIn publishing, Twitter/X posting, and any future automation triggers.
// Each webhook URL corresponds to a specific Zap (configured in Zapier dashboard).
//
// Environment variables:
//   ZAPIER_WEBHOOK_LINKEDIN_POST — Zap that posts to LinkedIn
//   ZAPIER_WEBHOOK_TWITTER_POST  — Zap that posts to Twitter/X
//   ZAPIER_WEBHOOK_GENERIC       — Generic catch-all webhook

import { getKey } from "@/lib/integration-keys";

interface ZapierWebhookResult {
  success: boolean;
  status: string;
  attemptId?: string;
}

async function getWebhookUrl(key: string): Promise<string | null> {
  return (await getKey(key)) || process.env[key] || null;
}

/**
 * Fire a Zapier webhook with arbitrary payload.
 */
async function fireWebhook(
  webhookUrl: string,
  payload: Record<string, unknown>
): Promise<ZapierWebhookResult> {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`Zapier webhook failed: ${res.status} ${res.statusText}`);
  }

  const data = await res.json().catch(() => ({}));
  return {
    success: true,
    status: data.status || "accepted",
    attemptId: data.attempt || data.id,
  };
}

/**
 * Publish a LinkedIn post via Zapier webhook.
 * The Zap should be configured to:
 * 1. Trigger: Webhooks by Zapier (Catch Hook)
 * 2. Action: LinkedIn → Create Share Update (or Create Image Post)
 */
export async function publishLinkedInPost(content: {
  body: string;
  hook?: string;
  imageUrl?: string;
}): Promise<ZapierWebhookResult> {
  const webhookUrl = await getWebhookUrl("ZAPIER_WEBHOOK_LINKEDIN_POST");
  if (!webhookUrl) {
    throw new Error("ZAPIER_WEBHOOK_LINKEDIN_POST not configured. Set this in Integrations → Zapier.");
  }

  return fireWebhook(webhookUrl, {
    text: content.body,
    hook: content.hook,
    imageUrl: content.imageUrl,
    source: "agency-crm",
    channel: "linkedin",
    timestamp: new Date().toISOString(),
  });
}

/**
 * Publish a Twitter/X thread via Zapier webhook.
 * The Zap should be configured to:
 * 1. Trigger: Webhooks by Zapier (Catch Hook)
 * 2. Action: Twitter → Create Tweet (loop for thread)
 */
export async function publishTwitterThread(content: {
  tweets: string[];
  hook?: string;
}): Promise<ZapierWebhookResult> {
  const webhookUrl = await getWebhookUrl("ZAPIER_WEBHOOK_TWITTER_POST");
  if (!webhookUrl) {
    throw new Error("ZAPIER_WEBHOOK_TWITTER_POST not configured. Set this in Integrations → Zapier.");
  }

  return fireWebhook(webhookUrl, {
    tweets: content.tweets,
    hook: content.hook,
    source: "agency-crm",
    channel: "twitter",
    timestamp: new Date().toISOString(),
  });
}

/**
 * Fire a generic Zapier webhook for custom automations.
 */
export async function fireGenericWebhook(
  payload: Record<string, unknown>
): Promise<ZapierWebhookResult> {
  const webhookUrl = await getWebhookUrl("ZAPIER_WEBHOOK_GENERIC");
  if (!webhookUrl) {
    throw new Error("ZAPIER_WEBHOOK_GENERIC not configured.");
  }
  return fireWebhook(webhookUrl, payload);
}
