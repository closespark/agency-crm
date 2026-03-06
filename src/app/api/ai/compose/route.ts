import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { runAIJob } from "@/lib/ai/job-runner";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { contactId, purpose, tone } = body as {
    contactId: string;
    purpose: string;
    tone?: string;
  };

  if (!contactId || !purpose) {
    return NextResponse.json(
      { error: "contactId and purpose are required" },
      { status: 400 }
    );
  }

  const validPurposes = [
    "cold_outreach",
    "follow_up",
    "nurture",
    "meeting_request",
    "proposal",
    "thank_you",
  ];
  if (!validPurposes.includes(purpose)) {
    return NextResponse.json(
      { error: `Invalid purpose. Must be one of: ${validPurposes.join(", ")}` },
      { status: 400 }
    );
  }

  try {
    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
      include: {
        company: true,
        activities: { orderBy: { createdAt: "desc" }, take: 10 },
        deals: { where: { stage: { not: "closed_lost" } }, take: 5 },
      },
    });

    if (!contact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    const input = {
      task: "Compose an email",
      purpose,
      tone: tone || "professional",
      contact: {
        firstName: contact.firstName,
        lastName: contact.lastName,
        email: contact.email,
        jobTitle: contact.jobTitle,
        lifecycleStage: contact.lifecycleStage,
        leadScore: contact.leadScore,
      },
      company: contact.company
        ? {
            name: contact.company.name,
            industry: contact.company.industry,
            size: contact.company.size,
          }
        : null,
      recentActivities: contact.activities.map((a) => ({
        type: a.type,
        subject: a.subject,
        date: a.createdAt,
      })),
      activeDeals: contact.deals.map((d) => ({
        name: d.name,
        stage: d.stage,
        amount: d.amount,
      })),
      instructions:
        "Return JSON with exactly two fields: subject (string, under 50 chars) and body (string, the email body text). Do not include any other fields.",
    };

    const result = await runAIJob("email_composer", "compose_email", input, {
      contactId,
    });

    const output = result.output as { subject: string; body: string };

    return NextResponse.json({
      data: {
        subject: output.subject,
        body: output.body,
        jobId: result.jobId,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to compose email";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
