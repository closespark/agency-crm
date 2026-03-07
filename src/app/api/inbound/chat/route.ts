// POST /api/inbound/chat — receives chat transcripts from website chatbot / Vapi
// Processes chat transcripts: creates/links contacts, runs BANT extraction,
// logs conversation, runs reply analysis for intent detection + auto-actions,
// and links visitor identity.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateSiteApiKey, checkRateLimit } from "@/lib/inbound-auth";
import { extractBANT } from "@/lib/ai/bant-extractor";
import { analyzeReply } from "@/lib/ai/reply-analyzer";

interface InboundChatPayload {
  transcript: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  company?: string;
  jobTitle?: string;
  visitorId?: string;
  duration?: number;
  vapiCallId?: string;
}

export async function POST(request: NextRequest) {
  // Rate limit check
  if (!(await checkRateLimit(request))) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  // Authenticate
  const isValid = await validateSiteApiKey(request);
  if (!isValid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: InboundChatPayload;
  try {
    body = await request.json();
  } catch (err) {
    console.error("Invalid JSON in inbound chat request:", err);
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Validate required fields
  if (!body.transcript) {
    return NextResponse.json(
      { error: "transcript is required" },
      { status: 400 }
    );
  }

  try {
    // 6. Log RawEventLog with source "vapi"
    await prisma.rawEventLog.create({
      data: {
        source: "vapi",
        eventType: "chat_transcript",
        rawPayload: JSON.stringify(body),
        processed: false,
      },
    });

    let contactId: string | undefined;
    let intent: string | undefined;

    // 1. If email provided, find or create Contact
    if (body.email) {
      const contact = await prisma.contact.upsert({
        where: { email: body.email },
        create: {
          firstName: body.firstName || "Unknown",
          lastName: body.lastName || "Contact",
          email: body.email,
          phone: body.phone || null,
          jobTitle: body.jobTitle || null,
          lifecycleStage: "lead",
          stageEnteredAt: new Date(),
          leadStatus: "new",
          source: "chat",
          engagementScore: 25,
          leadScore: 25,
          scoreDirty: true,
        },
        update: {
          firstName: body.firstName || undefined,
          lastName: body.lastName || undefined,
          phone: body.phone || undefined,
          jobTitle: body.jobTitle || undefined,
          engagementScore: { increment: 25 },
          scoreDirty: true,
        },
      });
      contactId = contact.id;

      // If company provided, find or create Company and link
      if (body.company) {
        let company = await prisma.company.findFirst({
          where: { name: body.company },
        });
        if (!company) {
          company = await prisma.company.create({
            data: { name: body.company },
          });
        }

        if (!contact.companyId) {
          await prisma.contact.update({
            where: { id: contact.id },
            data: { companyId: company.id },
          });
        }
      }
    }

    // 2. Run BANT extraction on transcript
    if (contactId) {
      try {
        await extractBANT(body.transcript, contactId, "chat");
      } catch (err) {
        console.error(`BANT extraction failed for chat contact ${contactId}:`, err);
      }
    }

    // 3. Create AIConversationLog with channel "chat", direction "inbound"
    await prisma.aIConversationLog.create({
      data: {
        contactId: contactId || null,
        channel: "chat",
        direction: "inbound",
        rawContent: body.transcript,
        metadata: JSON.stringify({
          vapiCallId: body.vapiCallId || null,
          duration: body.duration || null,
          visitorId: body.visitorId || null,
        }),
      },
    });

    // 4. Run reply analysis on transcript (handles intent detection, auto-actions, etc.)
    try {
      const analysis = await analyzeReply(body.transcript, contactId, "chat");
      intent = analysis.intent;
    } catch (err) {
      console.error(`Reply analysis failed for chat transcript:`, err);
    }

    // 5. If visitorId, link VisitorIdentity + backfill PageViews
    if (body.visitorId && contactId) {
      await prisma.visitorIdentity.upsert({
        where: { visitorId: body.visitorId },
        create: {
          visitorId: body.visitorId,
          contactId,
          identifiedBy: "chat",
        },
        update: {
          contactId,
        },
      });

      await prisma.pageView.updateMany({
        where: { visitorId: body.visitorId, contactId: null },
        data: { contactId },
      });
    }

    // Update RawEventLog as processed
    await prisma.rawEventLog.updateMany({
      where: {
        source: "vapi",
        eventType: "chat_transcript",
        rawPayload: JSON.stringify(body),
        processed: false,
      },
      data: {
        processed: true,
        processedAt: new Date(),
        contactId: contactId || null,
      },
    });

    return NextResponse.json(
      { ok: true, contactId: contactId || undefined, intent: intent || undefined },
      { status: 200 }
    );
  } catch (err) {
    console.error("Inbound chat processing error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
