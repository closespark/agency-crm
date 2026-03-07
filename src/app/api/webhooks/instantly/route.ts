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

    // Log raw event BEFORE processing — replayable event stream
    const rawLog = await prisma.rawEventLog.create({
      data: {
        source: "instantly",
        eventType: (payload.event_type as string) || "unknown",
        rawPayload: JSON.stringify(payload),
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

        // Bump engagement score for opens (not leadScore — leadScore = fitScore + engagementScore)
        await prisma.contact.update({
          where: { id: contact.id },
          data: {
            engagementScore: { increment: 1 },
            leadScore: { increment: 1 },
            scoreDirty: true,
          },
        });

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

        // Clicks are higher intent than opens — write to engagementScore
        await prisma.contact.update({
          where: { id: contact.id },
          data: {
            engagementScore: { increment: 3 },
            leadScore: { increment: 3 },
            scoreDirty: true,
          },
        });

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
        }

        // Mark enrollment as unsubscribed
        if (enrollment) {
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
      {
        error:
          error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
