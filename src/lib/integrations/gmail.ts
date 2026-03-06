// Gmail API integration — branded domain email sending + inbox sync
// Used for warm outreach (post-handoff), sequence steps on branded domain,
// and reading/syncing inbound replies into the CRM.
//
// Auth: OAuth2 via NextAuth Google provider (reuses existing tokens)
// or service account for autonomous sending.

import { google } from "googleapis";
import { prisma } from "@/lib/prisma";

// ============================================
// AUTH — get authenticated Gmail client
// ============================================

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.NEXTAUTH_URL
  );
}

async function getGmailClient(userId?: string) {
  // Find the Google account tokens — either for a specific user or the admin
  const account = await prisma.account.findFirst({
    where: {
      provider: "google",
      ...(userId ? { userId } : { user: { role: "admin" } }),
    },
  });

  if (!account?.access_token) {
    throw new Error("No Google account linked. Connect Google in Settings → Integrations.");
  }

  const oauth2 = getOAuth2Client();
  oauth2.setCredentials({
    access_token: account.access_token,
    refresh_token: account.refresh_token,
    expiry_date: account.expires_at ? account.expires_at * 1000 : undefined,
  });

  // Handle token refresh
  oauth2.on("tokens", async (tokens) => {
    const updateData: Record<string, unknown> = {};
    if (tokens.access_token) updateData.access_token = tokens.access_token;
    if (tokens.expiry_date) updateData.expires_at = Math.floor(tokens.expiry_date / 1000);
    if (tokens.refresh_token) updateData.refresh_token = tokens.refresh_token;

    await prisma.account.update({
      where: { id: account.id },
      data: updateData,
    });
  });

  return google.gmail({ version: "v1", auth: oauth2 });
}

// ============================================
// EMAIL SIGNATURE — auto-appended to every outbound email
// ============================================

export interface EmailSignatureConfig {
  name: string;
  title: string;
  company: string;
  phone?: string;
  email?: string;
  website?: string;
  bookingUrl?: string;
  linkedIn?: string;
  twitter?: string;
  logoUrl?: string;
}

// Cache signature for 5 minutes to avoid DB hits on every email
let signatureCache: { html: string; plain: string; fetchedAt: number } | null = null;
const SIGNATURE_CACHE_TTL = 5 * 60 * 1000;

async function getSignatureConfig(): Promise<EmailSignatureConfig | null> {
  // Try DB first (Integration with name "email_signature")
  try {
    const integration = await prisma.integration.findFirst({
      where: { name: "email_signature", isActive: true },
    });
    if (integration?.config) {
      return JSON.parse(integration.config) as EmailSignatureConfig;
    }
  } catch {
    // DB not available or not configured — fall through to env vars
  }

  // Fallback to env vars
  const name = process.env.EMAIL_SIGNATURE_NAME || process.env.BRANDED_FROM_NAME;
  if (!name) return null;

  return {
    name,
    title: process.env.EMAIL_SIGNATURE_TITLE || "Founder",
    company: process.env.EMAIL_SIGNATURE_COMPANY || "Nexus Ops",
    phone: process.env.EMAIL_SIGNATURE_PHONE || undefined,
    email: process.env.EMAIL_SIGNATURE_EMAIL || process.env.BRANDED_FROM_EMAIL || undefined,
    website: process.env.EMAIL_SIGNATURE_WEBSITE || undefined,
    bookingUrl: process.env.EMAIL_SIGNATURE_BOOKING_URL || undefined,
    linkedIn: process.env.EMAIL_SIGNATURE_LINKEDIN || undefined,
    twitter: process.env.EMAIL_SIGNATURE_TWITTER || undefined,
    logoUrl: process.env.EMAIL_SIGNATURE_LOGO_URL || undefined,
  };
}

function buildSignatureHtml(config: EmailSignatureConfig): string {
  const lines: string[] = [];

  // Separator
  lines.push(`<br><br>`);
  lines.push(`<table cellpadding="0" cellspacing="0" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; color: #333333;">`);
  lines.push(`<tr><td style="padding-bottom: 8px; border-top: 1px solid #e0e0e0; padding-top: 16px;">`);

  // Logo if provided
  if (config.logoUrl) {
    lines.push(`<img src="${config.logoUrl}" alt="${config.company}" height="32" style="margin-bottom: 8px; display: block;" />`);
  }

  // Name and title
  lines.push(`<strong style="font-size: 14px; color: #111111;">${config.name}</strong><br>`);
  lines.push(`<span style="font-size: 13px; color: #666666;">${config.title} at ${config.company}</span>`);
  lines.push(`</td></tr>`);

  // Contact details row
  const contactParts: string[] = [];
  if (config.phone) contactParts.push(config.phone);
  if (config.email) contactParts.push(`<a href="mailto:${config.email}" style="color: #2563eb; text-decoration: none;">${config.email}</a>`);
  if (config.website) {
    const displayUrl = config.website.replace(/^https?:\/\//, "");
    contactParts.push(`<a href="${config.website}" style="color: #2563eb; text-decoration: none;">${displayUrl}</a>`);
  }

  if (contactParts.length > 0) {
    lines.push(`<tr><td style="padding-top: 4px; font-size: 13px; color: #666666;">`);
    lines.push(contactParts.join(`<span style="color: #d0d0d0;"> &nbsp;|&nbsp; </span>`));
    lines.push(`</td></tr>`);
  }

  // Social links row
  const socialParts: string[] = [];
  if (config.linkedIn) socialParts.push(`<a href="${config.linkedIn}" style="color: #2563eb; text-decoration: none;">LinkedIn</a>`);
  if (config.twitter) socialParts.push(`<a href="${config.twitter}" style="color: #2563eb; text-decoration: none;">Twitter</a>`);

  if (socialParts.length > 0) {
    lines.push(`<tr><td style="padding-top: 4px; font-size: 12px;">`);
    lines.push(socialParts.join(`<span style="color: #d0d0d0;"> &nbsp;|&nbsp; </span>`));
    lines.push(`</td></tr>`);
  }

  // Booking CTA
  if (config.bookingUrl) {
    lines.push(`<tr><td style="padding-top: 10px;">`);
    lines.push(`<a href="${config.bookingUrl}" style="display: inline-block; padding: 6px 16px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 4px; font-size: 12px; font-weight: 600;">Book a Meeting</a>`);
    lines.push(`</td></tr>`);
  }

  lines.push(`</table>`);
  return lines.join("\n");
}

function buildSignaturePlain(config: EmailSignatureConfig): string {
  const lines: string[] = ["", "---"];
  lines.push(`${config.name} | ${config.title} at ${config.company}`);
  if (config.phone) lines.push(config.phone);
  if (config.email) lines.push(config.email);
  if (config.website) lines.push(config.website);
  if (config.linkedIn) lines.push(config.linkedIn);
  if (config.bookingUrl) lines.push(`Book a meeting: ${config.bookingUrl}`);
  return lines.join("\n");
}

/** Call this after updating signature config to force a refresh on next send. */
export function invalidateSignatureCache() {
  signatureCache = null;
}

async function getSignature(): Promise<{ html: string; plain: string } | null> {
  // Return cached if fresh
  if (signatureCache && Date.now() - signatureCache.fetchedAt < SIGNATURE_CACHE_TTL) {
    return { html: signatureCache.html, plain: signatureCache.plain };
  }

  const config = await getSignatureConfig();
  if (!config) return null;

  const html = buildSignatureHtml(config);
  const plain = buildSignaturePlain(config);

  signatureCache = { html, plain, fetchedAt: Date.now() };
  return { html, plain };
}

// ============================================
// SEND — compose and send via Gmail API
// ============================================

interface SendEmailParams {
  to: string;
  subject: string;
  body: string;
  fromName?: string;
  replyToMessageId?: string; // for threading replies
  threadId?: string;
  skipSignature?: boolean; // rare — for system-only emails like password resets
  isNewsletter?: boolean; // adds List-Unsubscribe header for CAN-SPAM compliance
}

async function buildRawEmail(params: SendEmailParams, fromEmail: string): Promise<string> {
  const from = params.fromName ? `${params.fromName} <${fromEmail}>` : fromEmail;
  const boundary = `boundary_${Date.now()}`;

  const headers = [
    `From: ${from}`,
    `To: ${params.to}`,
    `Subject: ${params.subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];

  // Thread with In-Reply-To header if replying
  if (params.replyToMessageId) {
    headers.push(`In-Reply-To: ${params.replyToMessageId}`);
    headers.push(`References: ${params.replyToMessageId}`);
  }

  // CAN-SPAM compliance: List-Unsubscribe for newsletters
  if (params.isNewsletter) {
    const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "";
    const unsubUrl = `${baseUrl}/api/newsletter/unsubscribe?email=${encodeURIComponent(params.to)}`;
    headers.push(`List-Unsubscribe: <${unsubUrl}>`);
    headers.push(`List-Unsubscribe-Post: List-Unsubscribe=One-Click`);
  }

  // Get signature
  const signature = params.skipSignature ? null : await getSignature();

  // Build multipart body (plain text + HTML) with signature
  const plainBody = params.body.replace(/<[^>]*>/g, "");
  const plainText = signature ? `${plainBody}${signature.plain}` : plainBody;

  let htmlBody = params.body.includes("<") ? params.body : `<div>${params.body.replace(/\n/g, "<br>")}</div>`;
  if (signature) {
    // Insert signature before closing </div> if body is wrapped, otherwise append
    if (htmlBody.trimEnd().endsWith("</div>")) {
      htmlBody = htmlBody.replace(/(<\/div>\s*)$/, `${signature.html}$1`);
    } else {
      htmlBody = `${htmlBody}${signature.html}`;
    }
  }

  const message = [
    headers.join("\r\n"),
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "",
    plainText,
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "",
    htmlBody,
    `--${boundary}--`,
  ].join("\r\n");

  // Gmail API requires URL-safe base64
  return Buffer.from(message)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function sendEmail(
  params: SendEmailParams,
  userId?: string
): Promise<{ messageId: string; threadId: string }> {
  const gmail = await getGmailClient(userId);

  // Get the sender's email address
  const profile = await gmail.users.getProfile({ userId: "me" });
  const fromEmail = profile.data.emailAddress || "";

  const raw = await buildRawEmail(params, fromEmail);

  const result = await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw,
      threadId: params.threadId || undefined,
    },
  });

  return {
    messageId: result.data.id || "",
    threadId: result.data.threadId || "",
  };
}

// ============================================
// READ — fetch messages for inbox sync
// ============================================

interface GmailMessage {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  date: Date;
  messageIdHeader: string;
  labels: string[];
}

function getHeader(headers: { name?: string | null; value?: string | null }[], name: string): string {
  return headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || "";
}

function extractBody(payload: {
  mimeType?: string | null;
  body?: { data?: string | null } | null;
  parts?: Array<{
    mimeType?: string | null;
    body?: { data?: string | null } | null;
    parts?: Array<{
      mimeType?: string | null;
      body?: { data?: string | null } | null;
    }>;
  }>;
}): string {
  // Direct body
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, "base64url").toString("utf-8");
  }

  // Multipart — prefer text/plain, fall back to text/html
  if (payload.parts) {
    const textPart = payload.parts.find((p) => p.mimeType === "text/plain");
    if (textPart?.body?.data) {
      return Buffer.from(textPart.body.data, "base64url").toString("utf-8");
    }
    const htmlPart = payload.parts.find((p) => p.mimeType === "text/html");
    if (htmlPart?.body?.data) {
      const html = Buffer.from(htmlPart.body.data, "base64url").toString("utf-8");
      return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    }
    // Nested multipart
    for (const part of payload.parts) {
      if (part.parts) {
        const nested = extractBody(part as typeof payload);
        if (nested) return nested;
      }
    }
  }

  return "";
}

export async function fetchNewMessages(
  userId?: string,
  afterTimestamp?: number
): Promise<GmailMessage[]> {
  const gmail = await getGmailClient(userId);

  // Build query: messages after timestamp, in inbox, unread
  const query = [
    "in:inbox",
    afterTimestamp ? `after:${Math.floor(afterTimestamp / 1000)}` : "newer_than:1d",
  ].join(" ");

  const listResult = await gmail.users.messages.list({
    userId: "me",
    q: query,
    maxResults: 50,
  });

  const messageIds = listResult.data.messages || [];
  const messages: GmailMessage[] = [];

  for (const msg of messageIds) {
    if (!msg.id) continue;

    const full = await gmail.users.messages.get({
      userId: "me",
      id: msg.id,
      format: "full",
    });

    const headers = full.data.payload?.headers || [];
    const body = full.data.payload ? extractBody(full.data.payload) : "";

    messages.push({
      id: full.data.id || "",
      threadId: full.data.threadId || "",
      from: getHeader(headers, "From"),
      to: getHeader(headers, "To"),
      subject: getHeader(headers, "Subject"),
      body,
      date: new Date(parseInt(full.data.internalDate || "0")),
      messageIdHeader: getHeader(headers, "Message-ID"),
      labels: full.data.labelIds || [],
    });
  }

  return messages;
}

// ============================================
// INBOX SYNC — pull new messages into CRM
// ============================================

export async function syncInbox(userId?: string): Promise<number> {
  // Get last sync timestamp
  const integration = await prisma.integration.findFirst({
    where: { type: "gmail" },
  });
  const lastSync = integration?.lastSyncAt?.getTime() || Date.now() - 24 * 60 * 60 * 1000;

  const messages = await fetchNewMessages(userId, lastSync);
  let synced = 0;

  for (const msg of messages) {
    // Extract email address from "Name <email>" format
    const fromEmail = msg.from.match(/<([^>]+)>/)?.[1] || msg.from;

    // Find matching contact
    const contact = await prisma.contact.findFirst({
      where: { email: fromEmail },
    });

    if (!contact) continue; // Only sync messages from known contacts

    // Check if already synced (by gmail message ID)
    const existing = await prisma.aIConversationLog.findFirst({
      where: {
        contactId: contact.id,
        channel: "email",
        metadata: { contains: msg.id },
      },
    });
    if (existing) continue;

    // Store as inbound conversation
    await prisma.aIConversationLog.create({
      data: {
        contactId: contact.id,
        channel: "email",
        direction: "inbound",
        rawContent: msg.body,
        aiSummary: `Email from ${msg.from}: ${msg.subject}`,
        metadata: JSON.stringify({
          gmailMessageId: msg.id,
          gmailThreadId: msg.threadId,
          subject: msg.subject,
          messageIdHeader: msg.messageIdHeader,
        }),
      },
    });

    // Log as activity
    await prisma.activity.create({
      data: {
        type: "email",
        subject: msg.subject,
        body: msg.body.substring(0, 2000),
        userId: (await prisma.user.findFirst({ where: { role: "admin" } }))?.id || "",
        contactId: contact.id,
      },
    });

    // Trigger reply analysis (event-driven, not scheduled)
    try {
      const { analyzeReply } = await import("@/lib/ai/reply-analyzer");
      await analyzeReply(msg.body, contact.id, "email");
    } catch (err) {
      console.error(`Reply analysis failed for Gmail message from ${contact.email}:`, err);
    }

    synced++;
  }

  // Update last sync timestamp
  if (integration) {
    await prisma.integration.update({
      where: { id: integration.id },
      data: { lastSyncAt: new Date() },
    });
  }

  return synced;
}

// ============================================
// SETUP — configure Gmail push notifications (webhook)
// ============================================

export async function setupGmailWatch(userId?: string): Promise<{ historyId: string; expiration: string }> {
  const gmail = await getGmailClient(userId);

  // Gmail push notifications require a Cloud Pub/Sub topic
  // This watches for new messages and triggers the webhook
  const result = await gmail.users.watch({
    userId: "me",
    requestBody: {
      topicName: process.env.GMAIL_PUBSUB_TOPIC || process.env.GOOGLE_PUBSUB_TOPIC || "",
      labelIds: ["INBOX"],
    },
  });

  return {
    historyId: result.data.historyId || "",
    expiration: result.data.expiration || "",
  };
}
