// POST /api/inbound/booking — website booking creates a meeting + advances lifecycle
// Accepts booking data, upserts Contact, advances to SQL via lifecycle engine,
// creates Meeting + Deal, queues meeting brief, links visitor, sends confirmation.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateSiteApiKey, checkRateLimit } from "@/lib/inbound-auth";
import { advanceContactStage } from "@/lib/ai/lifecycle-engine";
import { sendEmail } from "@/lib/integrations/gmail";
import { createCalendarEvent, isGoogleCalendarConfigured } from "@/lib/integrations/google-calendar";

interface InboundBookingPayload {
  firstName?: string;
  lastName?: string;
  name?: string; // alternative to firstName+lastName
  email: string;
  company?: string;
  jobTitle?: string;
  role?: string; // alternative to jobTitle (from website form)
  startTime?: string; // optional for consultation requests
  endTime?: string;
  meetingType?: string;
  notes?: string;
  challenge?: string; // qualifying question — feeds BANT extractor
  visitorId?: string;
  utmParams?: Record<string, string>;
  pageUrl?: string;
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

  let body: InboundBookingPayload;
  try {
    body = await request.json();
  } catch (err) {
    console.error("Invalid JSON in inbound booking request:", err);
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Parse name if firstName/lastName not provided separately
  if (!body.firstName && body.name) {
    const parts = body.name.trim().split(/\s+/);
    body.firstName = parts[0];
    body.lastName = parts.slice(1).join(" ") || "";
  }

  // Normalize role → jobTitle
  if (body.role && !body.jobTitle) {
    body.jobTitle = body.role;
  }

  // Build notes from challenge + any existing notes
  if (body.challenge) {
    const challengeText = `Biggest sales challenge: ${body.challenge}`;
    body.notes = body.notes ? `${challengeText}\n\n${body.notes}` : challengeText;
  }

  // Append UTM + page URL to notes for attribution
  if (body.utmParams && Object.keys(body.utmParams).length > 0) {
    const utmLine = `UTM: ${Object.entries(body.utmParams).map(([k, v]) => `${k}=${v}`).join(", ")}`;
    body.notes = body.notes ? `${body.notes}\n${utmLine}` : utmLine;
  }
  if (body.pageUrl) {
    body.notes = body.notes ? `${body.notes}\nSource page: ${body.pageUrl}` : `Source page: ${body.pageUrl}`;
  }

  // Validate required fields — only email is truly required; startTime/endTime optional for consultation requests
  if (!body.firstName || !body.email) {
    return NextResponse.json(
      { error: "name (or firstName) and email are required" },
      { status: 400 }
    );
  }

  try {
    // Log raw payload to RawEventLog
    await prisma.rawEventLog.create({
      data: {
        source: "website",
        eventType: "booking",
        rawPayload: JSON.stringify(body),
        processed: false,
      },
    });

    // 1. Find or create Contact by email
    const contact = await prisma.contact.upsert({
      where: { email: body.email },
      create: {
        firstName: body.firstName!,
        lastName: body.lastName || "",
        email: body.email,
        jobTitle: body.jobTitle || null,
        lifecycleStage: "lead",
        stageEnteredAt: new Date(),
        leadStatus: "new",
        source: "inbound",
        engagementScore: 30,
        leadScore: 30,
        scoreDirty: true,
      },
      update: {
        firstName: body.firstName,
        lastName: body.lastName,
        jobTitle: body.jobTitle || undefined,
        engagementScore: { increment: 30 },
        scoreDirty: true,
      },
    });

    // Advance to SQL via lifecycle engine (forward-only — won't downgrade)
    await advanceContactStage(
      contact.id,
      "sql",
      "inbound_booking",
      "Meeting booked via website — advancing to SQL"
    ).catch((err) => {
      // Forward-only enforcement may block this if contact is already at SQL+
      console.warn(`Lifecycle advance to SQL skipped for ${contact.id}:`, err instanceof Error ? err.message : err);
    });

    // 3. If company provided, find or create Company
    let companyId: string | null = contact.companyId;
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

      if (!contact.companyId) {
        await prisma.contact.update({
          where: { id: contact.id },
          data: { companyId },
        });
      }
    }

    // 4. Create Meeting record
    // If startTime/endTime provided, use them. Otherwise, create a TBD consultation request.
    const startTime = body.startTime
      ? new Date(body.startTime)
      : new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // default: 3 days out
    const endTime = body.endTime
      ? new Date(body.endTime)
      : new Date(startTime.getTime() + 30 * 60 * 1000); // default: 30min

    const meeting = await prisma.meeting.create({
      data: {
        title: `${body.startTime ? "Meeting" : "Consultation request"} with ${body.firstName} ${body.lastName}`,
        description: body.notes || null,
        startTime,
        endTime,
        type: body.meetingType || "consultation",
        contactId: contact.id,
        status: body.startTime ? "scheduled" : "requested",
      },
    });

    // 4b. Create Google Calendar event if configured and real times provided
    if (body.startTime) {
      try {
        const gcalConfigured = await isGoogleCalendarConfigured();
        if (gcalConfigured) {
          const eventId = await createCalendarEvent({
            title: `Consultation: ${body.firstName} ${body.lastName}${body.company ? ` (${body.company})` : ""}`,
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString(),
            description: body.notes || undefined,
            attendeeEmail: body.email,
          });
          if (eventId) {
            await prisma.meeting.update({
              where: { id: meeting.id },
              data: { location: `gcal:${eventId}` },
            });
          }
        }
      } catch (err) {
        console.error("Failed to create Google Calendar event:", err);
      }
    }

    // 5. Create Deal at discovery stage if no open deal exists
    let dealId: string | null = null;
    const existingDeal = await prisma.deal.findFirst({
      where: {
        contactId: contact.id,
        stage: { notIn: ["closed_won", "closed_lost"] },
      },
    });

    if (!existingDeal) {
      const deal = await prisma.deal.create({
        data: {
          name: `${body.firstName} ${body.lastName} - Discovery`,
          stage: "discovery",
          pipeline: "new_business",
          probability: 10,
          stageEnteredAt: new Date(),
          contactId: contact.id,
          companyId,
        },
      });
      dealId = deal.id;
    } else {
      dealId = existingDeal.id;
    }

    // 6. Queue meeting brief generation — create Task with type "meeting_brief"
    // dueDate = 1 hour before startTime
    const briefDueDate = new Date(startTime.getTime() - 60 * 60 * 1000);
    const admin = await prisma.user.findFirst({ where: { role: "admin" } });
    if (admin) {
      await prisma.task.create({
        data: {
          title: `Generate meeting brief for ${body.firstName} ${body.lastName}`,
          description: `Auto-generate meeting brief before scheduled call. Meeting ID: ${meeting.id}`,
          type: "meeting_brief",
          priority: "high",
          status: "pending",
          userId: admin.id,
          contactId: contact.id,
          dueDate: briefDueDate,
        },
      });
    }

    // 7. If visitorId, link VisitorIdentity + backfill PageViews
    if (body.visitorId) {
      await prisma.visitorIdentity.upsert({
        where: { visitorId: body.visitorId },
        create: {
          visitorId: body.visitorId,
          contactId: contact.id,
          identifiedBy: "booking",
        },
        update: {
          contactId: contact.id,
        },
      });

      await prisma.pageView.updateMany({
        where: { visitorId: body.visitorId, contactId: null },
        data: { contactId: contact.id },
      });
    }

    // Update RawEventLog as processed
    await prisma.rawEventLog.updateMany({
      where: {
        source: "website",
        eventType: "booking",
        rawPayload: JSON.stringify(body),
        processed: false,
      },
      data: {
        processed: true,
        processedAt: new Date(),
        contactId: contact.id,
      },
    });

    // 8. Send confirmation email via Gmail (non-blocking, don't fail if Gmail isn't configured)
    try {
      const formattedDate = startTime.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      const formattedTime = startTime.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      });
      const senderName = process.env.EMAIL_SIGNATURE_NAME || process.env.BRANDED_FROM_NAME || "The team";
      const companyName = process.env.EMAIL_SIGNATURE_COMPANY || "Nexus Ops";

      const isConfirmed = !!body.startTime;

      await sendEmail({
        to: body.email,
        subject: isConfirmed
          ? `You're confirmed for ${formattedDate} at ${formattedTime}`
          : `Thanks for reaching out, ${body.firstName}!`,
        body: isConfirmed
          ? `<div>
              <p>Hi ${body.firstName},</p>
              <p>Great news — your consultation is confirmed:</p>
              <table cellpadding="0" cellspacing="0" style="margin: 16px 0; font-size: 14px;">
                <tr><td style="padding: 4px 12px 4px 0; color: #666;">Date</td><td style="padding: 4px 0;"><strong>${formattedDate}</strong></td></tr>
                <tr><td style="padding: 4px 12px 4px 0; color: #666;">Time</td><td style="padding: 4px 0;"><strong>${formattedTime}</strong></td></tr>
                <tr><td style="padding: 4px 12px 4px 0; color: #666;">Duration</td><td style="padding: 4px 0;">30 minutes</td></tr>
              </table>
              <p>You'll receive a calendar invite shortly with the meeting link. If you need to reschedule, just reply to this email.</p>
              ${body.challenge ? `<p>You mentioned: <em>"${body.challenge}"</em> — I'll come prepared to dig into that.</p>` : ""}
              <p>Looking forward to it,<br>${senderName}</p>
            </div>`
          : `<div>
              <p>Hi ${body.firstName},</p>
              <p>Thanks for your interest in ${companyName}! We received your consultation request and will be in touch within 24 hours to find a time that works.</p>
              ${body.challenge ? `<p>You mentioned: <em>"${body.challenge}"</em> — that's exactly the kind of thing we help with.</p>` : ""}
              <p>Talk soon,<br>${senderName}</p>
            </div>`,
      });
    } catch (err) {
      console.error("Failed to send booking confirmation email:", err);
      // Don't fail the request — Gmail may not be configured
    }

    return NextResponse.json(
      { ok: true, contactId: contact.id, meetingId: meeting.id, dealId },
      { status: 200 }
    );
  } catch (err) {
    console.error("Inbound booking processing error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
