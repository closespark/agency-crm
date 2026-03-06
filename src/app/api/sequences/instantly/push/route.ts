import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { instantly } from "@/lib/integrations/instantly";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { sequenceId, sendingAccountId, dailyLimit } = body as {
    sequenceId: string;
    sendingAccountId?: string;
    dailyLimit?: number;
  };

  if (!sequenceId) {
    return NextResponse.json(
      { error: "sequenceId is required" },
      { status: 400 }
    );
  }

  // Load the sequence with enrollments
  const sequence = await prisma.sequence.findUnique({
    where: { id: sequenceId },
    include: {
      enrollments: {
        where: { status: "active" },
        include: {
          contact: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              company: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  if (!sequence) {
    return NextResponse.json(
      { error: "Sequence not found" },
      { status: 404 }
    );
  }

  // Parse steps
  let steps: Array<Record<string, unknown>> = [];
  try {
    steps = JSON.parse(sequence.steps);
  } catch {
    return NextResponse.json(
      { error: "Invalid sequence steps" },
      { status: 400 }
    );
  }

  // Filter to email-only steps for Instantly
  const emailSteps = steps.filter(
    (s) => s.channel === "email" || !s.channel
  );

  if (emailSteps.length === 0) {
    return NextResponse.json(
      { error: "Sequence has no email steps for Instantly" },
      { status: 400 }
    );
  }

  try {
    // Create campaign in Instantly (v2: sending accounts are mapped separately)
    const campaign = await instantly.campaigns.create({
      name: sequence.name,
    });

    // Add enrolled contacts as leads
    const leadsToAdd = sequence.enrollments
      .filter((e) => e.contact.email)
      .map((e) => ({
        email: e.contact.email!,
        first_name: e.contact.firstName,
        last_name: e.contact.lastName,
        company_name: e.contact.company?.name || "",
      }));

    if (leadsToAdd.length > 0) {
      await instantly.leads.add(campaign.id, leadsToAdd);
    }

    // Save InstantlyCampaign record locally
    const instantlyCampaign = await prisma.instantlyCampaign.create({
      data: {
        instantlyId: campaign.id,
        name: sequence.name,
        status: "draft",
        sendingAccountId: sendingAccountId || null,
        dailyLimit: dailyLimit || 30,
        sequences: JSON.stringify(emailSteps),
        leads: JSON.stringify({
          total: leadsToAdd.length,
          emails: leadsToAdd.map((l) => l.email),
        }),
        metrics: JSON.stringify({ sent: 0, opened: 0, replied: 0, bounced: 0 }),
        syncedAt: new Date(),
      },
    });

    return NextResponse.json(
      {
        data: {
          instantlyCampaign,
          leadsAdded: leadsToAdd.length,
          stepsCount: emailSteps.length,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: `Instantly push failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      },
      { status: 500 }
    );
  }
}
