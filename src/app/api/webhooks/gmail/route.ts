// Gmail Push Notification Webhook
// Google Cloud Pub/Sub pushes here when new emails arrive.
// This triggers real-time inbox sync instead of waiting for the daily autopilot.

import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const body = await request.json();

  // Log raw event BEFORE processing
  const { prisma } = await import("@/lib/prisma");
  const rawLog = await prisma.rawEventLog.create({
    data: {
      source: "gmail",
      eventType: "push_notification",
      rawPayload: JSON.stringify(body),
    },
  });

  // Verify this is from Google (subscription match + JWT signature verification)
  if (!body.message?.data || !body.subscription) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { verifyGmailWebhook } = await import("@/lib/webhook-verify");
  if (!(await verifyGmailWebhook(body.subscription, request))) {
    return NextResponse.json({ error: "Invalid subscription or JWT" }, { status: 401 });
  }

  // Decode the notification
  const decoded = Buffer.from(body.message.data, "base64").toString("utf-8");
  let notification: { emailAddress?: string; historyId?: string };
  try {
    notification = JSON.parse(decoded);
  } catch {
    return NextResponse.json({ error: "Invalid notification data" }, { status: 400 });
  }

  if (!notification.emailAddress) {
    return NextResponse.json({ ok: true }); // Ack but ignore
  }

  // Trigger inbox sync asynchronously (don't block the webhook response)
  import("@/lib/integrations/gmail").then(({ syncInbox }) => {
    syncInbox()
      .then(() => {
        prisma.rawEventLog.update({
          where: { id: rawLog.id },
          data: { processed: true, processedAt: new Date() },
        }).catch(() => {});
      })
      .catch((err) => {
        console.error("Gmail webhook sync failed:", err);
        prisma.rawEventLog.update({
          where: { id: rawLog.id },
          data: { processed: false, processingError: err?.message || "sync failed" },
        }).catch(() => {});
      });
  });

  // Must return 200 quickly or Pub/Sub will retry
  return NextResponse.json({ ok: true });
}
