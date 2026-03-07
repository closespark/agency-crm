import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { advanceDealStage } from "@/lib/ai/lifecycle-engine";

// PandaDocs webhook handler
// Handles document_state_change events for tracking proposal/contract lifecycle.
// See: https://developers.pandadoc.com/reference/on-document-status-change

export async function POST(request: NextRequest) {
  try {
    // Verify webhook signature
    const { verifyPandaDocsWebhook } = await import("@/lib/webhook-verify");
    if (!(await verifyPandaDocsWebhook(request))) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const payload = await request.json();

    // Log raw event BEFORE processing — replayable event stream
    const rawLog = await prisma.rawEventLog.create({
      data: {
        source: "pandadocs",
        eventType: (payload[0]?.event as string) || "unknown",
        rawPayload: JSON.stringify(payload),
      },
    });

    // PandaDocs sends webhooks as an array of events
    const events = Array.isArray(payload) ? payload : [payload];

    const results: { event: string; status: string; error?: string }[] = [];

    for (const event of events) {
      const eventName = event.event as string;
      const eventData = event.data as Record<string, unknown> | undefined;

      if (!eventName || !eventData) {
        results.push({ event: "unknown", status: "skipped", error: "Missing event or data" });
        continue;
      }

      // We only handle document_state_change events
      if (eventName !== "document_state_change") {
        results.push({ event: eventName, status: "skipped", error: "Unhandled event type" });
        continue;
      }

      const pandaDocId = eventData.id as string;
      const newStatus = eventData.status as string;

      if (!pandaDocId || !newStatus) {
        results.push({ event: eventName, status: "skipped", error: "Missing document id or status" });
        continue;
      }

      // Find local document record
      const localDoc = await prisma.pandaDocument.findUnique({
        where: { pandaDocId },
      });

      if (!localDoc) {
        results.push({
          event: eventName,
          status: "skipped",
          error: `PandaDocument not found for pandaDocId: ${pandaDocId}`,
        });
        continue;
      }

      switch (newStatus) {
        // ---------------------------------------------------------------
        // Document viewed
        // ---------------------------------------------------------------
        case "document.viewed": {
          await prisma.pandaDocument.update({
            where: { pandaDocId },
            data: {
              status: "document.viewed",
              viewedAt: new Date(),
            },
          });

          // Bump contact engagement score (viewing a proposal/contract = high intent), capped at 100
          if (localDoc.contactId) {
            const { incrementContactScore } = await import("@/lib/score-utils");
            await incrementContactScore(localDoc.contactId, 5);
          }

          results.push({ event: eventName, status: "processed" });
          break;
        }

        // ---------------------------------------------------------------
        // Document completed (signed)
        // ---------------------------------------------------------------
        case "document.completed": {
          const now = new Date();

          await prisma.pandaDocument.update({
            where: { pandaDocId },
            data: {
              status: "document.completed",
              completedAt: now,
            },
          });

          // Advance deal to closed_won if this document belongs to a deal
          if (localDoc.dealId) {
            const deal = await prisma.deal.findUnique({
              where: { id: localDoc.dealId },
            });

            if (deal && deal.stage !== "closed_won" && deal.stage !== "closed_lost") {
              // Set contractSignedAt on the deal
              await prisma.deal.update({
                where: { id: localDoc.dealId },
                data: { contractSignedAt: now },
              });

              // Advance to closed_won via lifecycle engine
              // The lifecycle engine enforces forward-only + required fields.
              // If any required fields are missing (actualAmount, paymentTerms, startDate),
              // the engine will return an error — we log it but don't fail the webhook.
              const result = await advanceDealStage(
                localDoc.dealId,
                "closed_won",
                "pandadocs_webhook",
                `Document signed: ${pandaDocId}`
              );

              if (!result.success) {
                console.warn(
                  `PandaDocs webhook: Could not advance deal ${localDoc.dealId} to closed_won: ${result.error}`
                );
              }
            }
          }

          // Bump engagement score for completion (highest signal), capped at 100
          if (localDoc.contactId) {
            const { incrementContactScore } = await import("@/lib/score-utils");
            await incrementContactScore(localDoc.contactId, 10);
          }

          results.push({ event: eventName, status: "processed" });
          break;
        }

        // ---------------------------------------------------------------
        // Document voided
        // ---------------------------------------------------------------
        case "document.voided":
        case "document.declined": {
          await prisma.pandaDocument.update({
            where: { pandaDocId },
            data: { status: "document.voided" },
          });

          results.push({ event: eventName, status: "processed" });
          break;
        }

        // ---------------------------------------------------------------
        // Document sent (status sync from PandaDocs side)
        // ---------------------------------------------------------------
        case "document.sent": {
          await prisma.pandaDocument.update({
            where: { pandaDocId },
            data: {
              status: "document.sent",
              sentAt: localDoc.sentAt || new Date(),
            },
          });

          results.push({ event: eventName, status: "processed" });
          break;
        }

        default: {
          // Update status for any other document state we don't explicitly handle
          await prisma.pandaDocument.update({
            where: { pandaDocId },
            data: { status: newStatus },
          });
          results.push({ event: eventName, status: "stored" });
          break;
        }
      }
    }

    // Mark raw event as processed
    // Resolve contactId from the first document event if possible
    let resolvedContactId: string | null = null;
    const firstDocId = events[0]?.data?.id as string | undefined;
    if (firstDocId) {
      const firstDoc = await prisma.pandaDocument.findUnique({
        where: { pandaDocId: firstDocId },
        select: { contactId: true },
      });
      resolvedContactId = firstDoc?.contactId || null;
    }

    await prisma.rawEventLog.update({
      where: { id: rawLog.id },
      data: {
        processed: true,
        processedAt: new Date(),
        contactId: resolvedContactId,
      },
    });

    return NextResponse.json({ status: "ok", results });
  } catch (error) {
    console.error("PandaDocs webhook error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
