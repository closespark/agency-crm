// POST /api/inbound/lead — website form fill creates a lead in the CRM
// Accepts lead data from the website, upserts Contact, creates Lead record,
// links visitor identity, backfills page views, and fires lead scoring.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateSiteApiKey, checkRateLimit } from "@/lib/inbound-auth";
import { scoreContact } from "@/lib/ai/lead-scorer";

interface InboundLeadPayload {
  firstName: string;
  lastName: string;
  email: string;
  company?: string;
  phone?: string;
  jobTitle?: string;
  source?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
  visitorId?: string;
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

  let body: InboundLeadPayload;
  try {
    body = await request.json();
  } catch (err) {
    console.error("Invalid JSON in inbound lead request:", err);
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Validate required fields
  if (!body.firstName || !body.lastName || !body.email) {
    return NextResponse.json(
      { error: "firstName, lastName, and email are required" },
      { status: 400 }
    );
  }

  try {
    // Log raw payload to RawEventLog
    await prisma.rawEventLog.create({
      data: {
        source: "website",
        eventType: "lead_form_fill",
        rawPayload: JSON.stringify(body),
        processed: false,
      },
    });

    // 1. Find or create Contact by email (upsert)
    const contact = await prisma.contact.upsert({
      where: { email: body.email },
      create: {
        firstName: body.firstName,
        lastName: body.lastName,
        email: body.email,
        phone: body.phone || null,
        jobTitle: body.jobTitle || null,
        lifecycleStage: "lead",
        stageEnteredAt: new Date(),
        leadStatus: "new",
        source: body.source || "inbound",
        engagementScore: 20,
        leadScore: 20,
        scoreDirty: true,
      },
      update: {
        firstName: body.firstName,
        lastName: body.lastName,
        phone: body.phone || undefined,
        jobTitle: body.jobTitle || undefined,
        source: body.source || "inbound",
        engagementScore: { increment: 20 },
        leadScore: { increment: 20 },
        scoreDirty: true,
      },
    });

    // 3. If company provided, find or create Company by name
    let companyId: string | null = null;
    if (body.company) {
      let company = await prisma.company.findFirst({
        where: { name: body.company },
      });
      if (!company) {
        company = await prisma.company.create({
          data: { name: body.company },
        });
      }
      companyId = company.id;

      // Link contact to company if not already linked
      if (!contact.companyId) {
        await prisma.contact.update({
          where: { id: contact.id },
          data: { companyId },
        });
      }
    }

    // 4. Create a Lead record
    await prisma.lead.create({
      data: {
        contactId: contact.id,
        companyId: companyId || contact.companyId,
        source: "form_fill",
        channel: "website",
      },
    });

    // 5. If visitorId provided, link VisitorIdentity + backfill PageViews
    if (body.visitorId) {
      await prisma.visitorIdentity.upsert({
        where: { visitorId: body.visitorId },
        create: {
          visitorId: body.visitorId,
          contactId: contact.id,
          identifiedBy: "form_fill",
        },
        update: {
          contactId: contact.id,
        },
      });

      // Backfill all PageView records with this visitorId to set contactId
      await prisma.pageView.updateMany({
        where: { visitorId: body.visitorId, contactId: null },
        data: { contactId: contact.id },
      });
    }

    // Update RawEventLog as processed
    await prisma.rawEventLog.updateMany({
      where: {
        source: "website",
        eventType: "lead_form_fill",
        rawPayload: JSON.stringify(body),
        processed: false,
      },
      data: {
        processed: true,
        processedAt: new Date(),
        contactId: contact.id,
      },
    });

    // 6. Fire lead scorer (async, don't block response)
    scoreContact(contact.id).catch((err) => {
      console.error(`Lead scoring failed for contact ${contact.id}:`, err);
    });

    return NextResponse.json({ ok: true, contactId: contact.id }, { status: 200 });
  } catch (err) {
    console.error("Inbound lead processing error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
