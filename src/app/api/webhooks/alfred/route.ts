import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { meetAlfred } from "@/lib/integrations/meet-alfred";
import { analyzeReply } from "@/lib/ai/reply-analyzer";
import { safeParseJSON } from "@/lib/safe-json";

export async function POST(request: NextRequest) {
  let rawLogId: string | null = null;

  const markProcessed = (contactId?: string | null, error?: string) => {
    if (!rawLogId) return Promise.resolve();
    return prisma.rawEventLog.update({
      where: { id: rawLogId },
      data: {
        processed: !error,
        processedAt: new Date(),
        contactId: contactId || null,
        processingError: error || null,
      },
    });
  };

  try {
    // Verify webhook signature
    const { verifyAlfredWebhook } = await import("@/lib/webhook-verify");
    if (!(await verifyAlfredWebhook(request))) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const payload = await request.json();

    // Log raw event BEFORE processing — replayable event stream
    const rawLog = await prisma.rawEventLog.create({
      data: {
        source: "alfred",
        eventType: (payload.event_type as string) || "unknown",
        rawPayload: JSON.stringify(payload),
      },
    });
    rawLogId = rawLog.id;

    const event = meetAlfred.parseWebhook(payload);

    if (!event.eventType || !event.linkedinUrl) {
      await markProcessed(null, "Invalid payload: missing event or linkedin_url").catch(() => {});
      return NextResponse.json(
        { error: "Invalid webhook payload: missing event or linkedin_url" },
        { status: 400 }
      );
    }

    // Find contact by LinkedIn URL stored in customFields
    // We search prospects first since LinkedIn contacts are typically prospects
    const prospect = await prisma.prospect.findFirst({
      where: { linkedinUrl: event.linkedinUrl },
    });

    // Also try to find a contact via customFields containing the LinkedIn URL
    const contacts = await prisma.contact.findMany({
      where: {
        customFields: { contains: event.linkedinUrl },
      },
      take: 1,
    });
    const contact = contacts[0] || null;

    switch (event.eventType) {
      case "message_replied": {
        if (!contact && !prospect) {
          return NextResponse.json({
            status: "ok",
            warning:
              "No contact or prospect found for LinkedIn URL: " +
              event.linkedinUrl,
          });
        }

        const contactId = contact?.id;

        // Analyze reply with AI
        const analysis = await analyzeReply(
          event.message || "",
          contactId,
          "linkedin"
        );

        // If we have a contact, update enrollment and create events
        if (contact) {
          // Update sequence enrollment if active on LinkedIn
          const enrollment = await prisma.sequenceEnrollment.findFirst({
            where: {
              contactId: contact.id,
              status: "active",
              channel: { in: ["linkedin", "multi"] },
            },
            orderBy: { createdAt: "desc" },
          });

          if (enrollment) {
            await prisma.sequenceEnrollment.update({
              where: { id: enrollment.id },
              data: {
                status: "replied",
                metadata: JSON.stringify({
                  ...safeParseJSON<Record<string, unknown>>(enrollment.metadata, {}),
                  repliedAt: new Date().toISOString(),
                  replyIntent: analysis.intent,
                  channel: "linkedin",
                }),
              },
            });
          }
        }

        // If only a prospect (not yet a contact), log to conversation
        if (!contact && prospect) {
          await prisma.aIConversationLog.create({
            data: {
              channel: "linkedin",
              direction: "inbound",
              rawContent: event.message || "",
              aiSummary: analysis.keyPoints?.join(". ") || null,
              sentiment: analysis.sentiment,
              intent: analysis.intent,
              suggestedAction: JSON.stringify(analysis.autoActions),
            },
          });
        }

        // Update prospect status if exists
        if (prospect) {
          await prisma.prospect.update({
            where: { id: prospect.id },
            data: { status: "contacted" },
          });
        }

        await markProcessed(contact?.id);
        return NextResponse.json({ status: "ok", intent: analysis.intent });
      }

      case "connection_accepted": {
        // Update prospect status
        if (prospect) {
          await prisma.prospect.update({
            where: { id: prospect.id },
            data: { status: "verified" },
          });
        }

        // Update contact lead status
        if (contact) {
          const { incrementContactScore } = await import("@/lib/score-utils");
          await incrementContactScore(contact.id, 5);
          await prisma.contact.update({
            where: { id: contact.id },
            data: { leadStatus: "contacted" },
          });

          // Log the connection acceptance as an activity
          // Find a system/owner user for the activity
          const ownerId = contact.ownerId;
          if (ownerId) {
            await prisma.activity.create({
              data: {
                type: "note",
                subject: "LinkedIn connection accepted",
                body: `Connection request accepted by ${contact.firstName} ${contact.lastName} via Meet Alfred campaign ${event.campaignId || "unknown"}.`,
                userId: ownerId,
                contactId: contact.id,
              },
            });
          }
        }

        // Log to AI conversation
        await prisma.aIConversationLog.create({
          data: {
            contactId: contact?.id || null,
            channel: "linkedin",
            direction: "inbound",
            rawContent: "LinkedIn connection request accepted",
            aiSummary: "Prospect accepted LinkedIn connection request",
            sentiment: "positive",
            intent: "interested",
            suggestedAction: JSON.stringify([
              {
                action: "Send follow-up message",
                reason:
                  "Connection was accepted - good time to start conversation",
              },
            ]),
          },
        });

        await markProcessed(contact?.id);
        return NextResponse.json({ status: "ok" });
      }

      case "message_sent": {
        // Log outbound message
        await prisma.aIConversationLog.create({
          data: {
            contactId: contact?.id || null,
            channel: "linkedin",
            direction: "outbound",
            rawContent: event.message || "LinkedIn message sent via Alfred",
            aiSummary: "Outbound LinkedIn message sent via Meet Alfred",
            sentiment: "neutral",
            intent: null,
          },
        });

        await markProcessed(contact?.id);
        return NextResponse.json({ status: "ok" });
      }

      default:
        await markProcessed(null, `Unknown event type: ${event.eventType}`).catch(() => {});
        return NextResponse.json(
          { error: `Unknown event type: ${event.eventType}` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("Alfred webhook error:", error);
    await markProcessed(null, error instanceof Error ? error.message : "Unknown error").catch(() => {});
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
