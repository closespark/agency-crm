import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { vapi } from "@/lib/integrations/vapi";
import { analyzeReply } from "@/lib/ai/reply-analyzer";

export async function POST(request: NextRequest) {
  try {
    // Verify webhook secret
    const { verifyVapiWebhook } = await import("@/lib/webhook-verify");
    if (!(await verifyVapiWebhook(request))) {
      return NextResponse.json({ error: "Invalid secret" }, { status: 401 });
    }

    const payload = await request.json();

    // Log raw event before processing
    const rawLog = await prisma.rawEventLog.create({
      data: {
        source: "vapi",
        eventType: (payload.message?.type as string) || "unknown",
        rawPayload: JSON.stringify(payload),
      },
    });

    const event = vapi.parseWebhook(payload);

    const markProcessed = (contactId?: string) =>
      prisma.rawEventLog.update({
        where: { id: rawLog.id },
        data: { processed: true, processedAt: new Date(), contactId: contactId || null },
      });

    switch (event.eventType) {
      case "end-of-call-report": {
        if (!event.call || !event.transcript) {
          await markProcessed();
          return NextResponse.json({ status: "ok", warning: "No call or transcript data" });
        }

        // Try to match call to a contact by phone number
        const customerNumber = event.call.customer?.number;
        const contact = customerNumber
          ? await prisma.contact.findFirst({
              where: { phone: customerNumber },
            })
          : null;

        // Store the transcript as a MeetingTranscript if we can match to a meeting
        // Otherwise, create an AI conversation log for analysis
        if (contact) {
          // Analyze the call transcript like we do email replies
          const analysis = await analyzeReply(
            event.transcript,
            contact.id,
            "phone"
          );

          // Create AI conversation log
          await prisma.aIConversationLog.create({
            data: {
              contactId: contact.id,
              channel: "phone",
              direction: event.call.type === "outboundPhoneCall" ? "outbound" : "inbound",
              rawContent: event.transcript,
              aiSummary: event.summary,
              sentiment: analysis.sentiment,
              intent: analysis.intent,
              metadata: JSON.stringify({
                vapiCallId: event.callId,
                recordingUrl: event.recordingUrl,
                duration: event.call.startedAt && event.call.endedAt
                  ? Math.round(
                      (new Date(event.call.endedAt).getTime() - new Date(event.call.startedAt).getTime()) / 1000
                    )
                  : null,
                analysis: event.analysis,
              }),
            },
          });

          // Bump engagement score for phone interaction (high-value), capped at 100
          const { incrementContactScore } = await import("@/lib/score-utils");
          await incrementContactScore(contact.id, 10);

          // Create activity record
          const duration = event.call.startedAt && event.call.endedAt
            ? Math.round(
                (new Date(event.call.endedAt).getTime() - new Date(event.call.startedAt).getTime()) / 1000
              )
            : null;

          // Find the first user (solo founder CRM) for activity attribution
          const user = await prisma.user.findFirst();
          if (user) {
            await prisma.activity.create({
              data: {
                type: "call",
                subject: `Vapi AI Call - ${event.call.type === "outboundPhoneCall" ? "Outbound" : "Inbound"}`,
                body: event.summary || event.transcript.substring(0, 500),
                userId: user.id,
                contactId: contact.id,
                duration,
                outcome: event.analysis?.successEvaluation || "connected",
              },
            });
          }

          await markProcessed(contact.id);
          return NextResponse.json({ status: "ok", contactId: contact.id, intent: analysis.intent });
        }

        // No contact matched — still log the event
        await markProcessed();
        return NextResponse.json({
          status: "ok",
          warning: "No contact matched for phone: " + customerNumber,
        });
      }

      case "function-call": {
        // Handle function calls from the Vapi assistant (e.g., book_meeting, capture_lead)
        if (!event.functionCall) {
          return NextResponse.json({ status: "ok" });
        }

        const { name, parameters } = event.functionCall;

        switch (name) {
          case "book_meeting": {
            // Return available times — the assistant will present them
            return NextResponse.json({
              result: {
                message: "I can help schedule that. Let me check availability.",
                bookingUrl: process.env.EMAIL_SIGNATURE_BOOKING_URL || "",
              },
            });
          }

          case "capture_lead": {
            const email = parameters.email as string;
            const firstName = parameters.first_name as string;
            const lastName = parameters.last_name as string;

            if (email) {
              const existing = await prisma.contact.findUnique({ where: { email } });
              if (!existing) {
                await prisma.contact.create({
                  data: {
                    firstName: firstName || "Unknown",
                    lastName: lastName || "",
                    email,
                    phone: event.call?.customer?.number || undefined,
                    source: "vapi",
                    lifecycleStage: "lead",
                    scoreDirty: true,
                  },
                });
              }
            }

            return NextResponse.json({
              result: { message: "Contact information captured. Thank you." },
            });
          }

          default:
            return NextResponse.json({
              result: { message: "Function not recognized." },
            });
        }
      }

      case "status-update": {
        // Log status changes but don't process them deeply
        await markProcessed();
        return NextResponse.json({ status: "ok" });
      }

      case "assistant-request": {
        // Vapi is asking which assistant to use — return the configured one
        // This happens when a phone number doesn't have a default assistant
        return NextResponse.json({ status: "ok" });
      }

      default: {
        await markProcessed();
        return NextResponse.json({ status: "ok" });
      }
    }
  } catch (error) {
    console.error("Vapi webhook error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
