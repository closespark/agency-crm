import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { instantly } from "@/lib/integrations/instantly";
import { analyzeReply } from "@/lib/ai/reply-analyzer";

export async function POST(request: NextRequest) {
  try {
    // Verify webhook signature
    const { verifyInstantlyWebhook } = await import("@/lib/webhook-verify");
    if (!(await verifyInstantlyWebhook(request))) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const payload = await request.json();
    const payloadStr = JSON.stringify(payload);

    // Idempotency: check if this exact event was already processed (within 5 min window)
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    const duplicate = await prisma.rawEventLog.findFirst({
      where: {
        source: "instantly",
        eventType: (payload.event_type as string) || "unknown",
        rawPayload: payloadStr,
        createdAt: { gte: fiveMinAgo },
        processed: true,
      },
    });
    if (duplicate) {
      return NextResponse.json({ status: "ok", deduplicated: true });
    }

    // Log raw event BEFORE processing — replayable event stream
    const rawLog = await prisma.rawEventLog.create({
      data: {
        source: "instantly",
        eventType: (payload.event_type as string) || "unknown",
        rawPayload: payloadStr,
      },
    });

    const event = instantly.parseWebhook(payload);

    if (!event.eventType || !event.leadEmail) {
      return NextResponse.json(
        { error: "Invalid webhook payload: missing event_type or lead_email" },
        { status: 400 }
      );
    }

    // Helper to mark raw event processed
    const markProcessed = (cId?: string) =>
      prisma.rawEventLog.update({
        where: { id: rawLog.id },
        data: { processed: true, processedAt: new Date(), contactId: cId || null },
      });

    // Find contact by email
    const contact = await prisma.contact.findUnique({
      where: { email: event.leadEmail },
    });

    // Find active enrollment for this contact
    const enrollment = contact
      ? await prisma.sequenceEnrollment.findFirst({
          where: {
            contactId: contact.id,
            status: "active",
            channel: "email",
          },
          orderBy: { createdAt: "desc" },
        })
      : null;

    switch (event.eventType) {
      case "reply": {
        if (!contact) {
          // Still log the event even if we can't find the contact
          return NextResponse.json({
            status: "ok",
            warning: "Contact not found for email: " + event.leadEmail,
          });
        }

        // Analyze reply with AI
        const analysis = await analyzeReply(
          event.replyText || "",
          contact.id,
          "email"
        );

        // Update enrollment status to replied
        if (enrollment) {
          await prisma.sequenceEnrollment.update({
            where: { id: enrollment.id },
            data: {
              status: "replied",
              metadata: JSON.stringify({
                ...(enrollment.metadata
                  ? JSON.parse(enrollment.metadata)
                  : {}),
                repliedAt: new Date().toISOString(),
                replyIntent: analysis.intent,
              }),
            },
          });
        }

        // Create EmailEvent
        await prisma.emailEvent.create({
          data: {
            contactId: contact.id,
            type: "replied",
            metadata: JSON.stringify({
              campaignId: event.campaignId,
              sentiment: analysis.sentiment,
              intent: analysis.intent,
              timestamp: event.timestamp,
            }),
          },
        });

        // Note: analyzeReply already creates AIConversationLog and AIInsight for meeting_request

        await markProcessed(contact.id);
        return NextResponse.json({ status: "ok", intent: analysis.intent });
      }

      case "open": {
        if (!contact) {
          return NextResponse.json({
            status: "ok",
            warning: "Contact not found",
          });
        }

        await prisma.emailEvent.create({
          data: {
            contactId: contact.id,
            type: "opened",
            metadata: JSON.stringify({
              campaignId: event.campaignId,
              timestamp: event.timestamp,
            }),
          },
        });

        // Bump engagement score for opens, capped at 100
        const openContact = await prisma.contact.findUnique({ where: { id: contact.id }, select: { engagementScore: true, leadScore: true } });
        if (openContact) {
          await prisma.contact.update({
            where: { id: contact.id },
            data: {
              engagementScore: Math.min(100, openContact.engagementScore + 1),
              leadScore: Math.min(100, openContact.leadScore + 1),
              scoreDirty: true,
            },
          });
        }

        await markProcessed(contact?.id);
        return NextResponse.json({ status: "ok" });
      }

      case "click": {
        if (!contact) {
          return NextResponse.json({
            status: "ok",
            warning: "Contact not found",
          });
        }

        await prisma.emailEvent.create({
          data: {
            contactId: contact.id,
            type: "clicked",
            metadata: JSON.stringify({
              campaignId: event.campaignId,
              timestamp: event.timestamp,
            }),
          },
        });

        // Clicks are higher intent than opens, capped at 100
        const clickContact = await prisma.contact.findUnique({ where: { id: contact.id }, select: { engagementScore: true, leadScore: true } });
        if (clickContact) {
          await prisma.contact.update({
            where: { id: contact.id },
            data: {
              engagementScore: Math.min(100, clickContact.engagementScore + 3),
              leadScore: Math.min(100, clickContact.leadScore + 3),
              scoreDirty: true,
            },
          });
        }

        await markProcessed(contact?.id);
        return NextResponse.json({ status: "ok" });
      }

      case "bounce": {
        if (contact) {
          await prisma.emailEvent.create({
            data: {
              contactId: contact.id,
              type: "bounced",
              metadata: JSON.stringify({
                campaignId: event.campaignId,
                timestamp: event.timestamp,
              }),
            },
          });
        }

        // Mark enrollment as bounced
        if (enrollment) {
          await prisma.sequenceEnrollment.update({
            where: { id: enrollment.id },
            data: { status: "bounced" },
          });
        }

        await markProcessed(contact?.id);
        return NextResponse.json({ status: "ok" });
      }

      case "unsubscribe": {
        if (contact) {
          await prisma.emailEvent.create({
            data: {
              contactId: contact.id,
              type: "unsubscribed",
              metadata: JSON.stringify({
                campaignId: event.campaignId,
                timestamp: event.timestamp,
              }),
            },
          });

          // Set global opt-out (CAN-SPAM/GDPR compliance across ALL channels)
          await prisma.contact.update({
            where: { id: contact.id },
            data: { globalOptOut: true, optOutAt: new Date() },
          });

          // Cancel ALL active enrollments for this contact (not just current one)
          await prisma.sequenceEnrollment.updateMany({
            where: { contactId: contact.id, status: "active" },
            data: { status: "unsubscribed" },
          });
        } else if (enrollment) {
          // Fallback: mark just this enrollment
          await prisma.sequenceEnrollment.update({
            where: { id: enrollment.id },
            data: { status: "unsubscribed" },
          });
        }

        await markProcessed(contact?.id);
        return NextResponse.json({ status: "ok" });
      }

      default:
        return NextResponse.json(
          { error: `Unknown event type: ${event.eventType}` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("Instantly webhook error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
