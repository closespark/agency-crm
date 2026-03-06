// POST /api/inbound/pageview — tracks page views from the website
// High-volume endpoint: creates PageView records, resolves visitor identity,
// bumps engagement for high-intent pages, and detects pricing-page hot leads.
// Does NOT log to RawEventLog (too high volume).

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateSiteApiKey, checkRateLimit } from "@/lib/inbound-auth";

const HIGH_INTENT_PATHS = ["/pricing", "/contact", "/book", "/services"];

interface InboundPageViewPayload {
  visitorId: string;
  url: string;
  path: string;
  referrer?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
  userAgent?: string;
  sessionId?: string;
  duration?: number;
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

  let body: InboundPageViewPayload;
  try {
    body = await request.json();
  } catch (err) {
    console.error("Invalid JSON in inbound pageview request:", err);
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Validate required fields
  if (!body.visitorId || !body.url || !body.path) {
    return NextResponse.json(
      { error: "visitorId, url, and path are required" },
      { status: 400 }
    );
  }

  try {
    // 2. Check VisitorIdentity — resolve contactId if this visitor is already identified
    let contactId: string | null = null;
    const identity = await prisma.visitorIdentity.findUnique({
      where: { visitorId: body.visitorId },
    });
    if (identity) {
      contactId = identity.contactId;
    }

    // 1. Create PageView record with all fields
    await prisma.pageView.create({
      data: {
        visitorId: body.visitorId,
        contactId,
        url: body.url,
        path: body.path,
        referrer: body.referrer || null,
        utmSource: body.utmSource || null,
        utmMedium: body.utmMedium || null,
        utmCampaign: body.utmCampaign || null,
        utmTerm: body.utmTerm || null,
        utmContent: body.utmContent || null,
        userAgent: body.userAgent || null,
        sessionId: body.sessionId || null,
        duration: body.duration ?? null,
      },
    });

    // 3. If contact is identified AND high-intent page, bump engagementScore by 2
    if (contactId && HIGH_INTENT_PATHS.some((p) => body.path.startsWith(p))) {
      await prisma.contact.update({
        where: { id: contactId },
        data: {
          engagementScore: { increment: 2 },
          scoreDirty: true,
        },
      });
    }

    // 4. If contact identified AND viewed pricing 3+ times in 7 days, create hot_lead insight
    if (contactId && body.path.startsWith("/pricing")) {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const pricingViewCount = await prisma.pageView.count({
        where: {
          contactId,
          path: { startsWith: "/pricing" },
          createdAt: { gte: sevenDaysAgo },
        },
      });

      if (pricingViewCount >= 3) {
        // Check if we already created a hot_lead insight for this contact recently (avoid duplicates)
        const existingInsight = await prisma.aIInsight.findFirst({
          where: {
            type: "hot_lead",
            resourceType: "contact",
            resourceId: contactId,
            createdAt: { gte: sevenDaysAgo },
          },
        });

        if (!existingInsight) {
          const contact = await prisma.contact.findUnique({
            where: { id: contactId },
            select: { firstName: true, lastName: true, email: true },
          });

          await prisma.aIInsight.create({
            data: {
              type: "hot_lead",
              title: `${contact?.firstName} ${contact?.lastName} viewed pricing ${pricingViewCount} times in 7 days`,
              description: `Contact ${contact?.email} has visited the pricing page ${pricingViewCount} times in the last 7 days. This is a strong buying signal — consider triggering immediate outreach.`,
              reasoning: `Pricing page view frequency (${pricingViewCount}x in 7d) exceeds hot lead threshold (3x). Visitor is actively evaluating pricing.`,
              priority: "critical",
              resourceType: "contact",
              resourceId: contactId,
              status: "new",
            },
          });
        }
      }
    }

    // 5. Do NOT log to RawEventLog (too high volume)

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("Inbound pageview processing error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
