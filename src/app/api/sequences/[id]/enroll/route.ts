import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();

  const { contactIds, channel = "email" } = body as {
    contactIds: string[];
    channel?: string;
  };

  if (!contactIds || !Array.isArray(contactIds) || contactIds.length === 0) {
    return NextResponse.json(
      { error: "contactIds array is required" },
      { status: 400 }
    );
  }

  // Verify sequence exists and is active
  const sequence = await prisma.sequence.findUnique({ where: { id } });
  if (!sequence) {
    return NextResponse.json({ error: "Sequence not found" }, { status: 404 });
  }

  if (!sequence.isActive) {
    return NextResponse.json(
      { error: "Sequence is not active" },
      { status: 400 }
    );
  }

  // Parse steps to determine total steps
  let steps: unknown[] = [];
  try {
    steps = JSON.parse(sequence.steps);
  } catch {
    steps = [];
  }

  if (steps.length === 0) {
    return NextResponse.json(
      { error: "Sequence has no steps" },
      { status: 400 }
    );
  }

  // Verify contacts exist
  const contacts = await prisma.contact.findMany({
    where: { id: { in: contactIds } },
    select: { id: true },
  });

  const existingContactIds = new Set(contacts.map((c) => c.id));
  const invalidIds = contactIds.filter((cid) => !existingContactIds.has(cid));

  if (invalidIds.length > 0) {
    return NextResponse.json(
      { error: `Contacts not found: ${invalidIds.join(", ")}` },
      { status: 400 }
    );
  }

  // Check for existing active enrollments to avoid duplicates
  const existingEnrollments = await prisma.sequenceEnrollment.findMany({
    where: {
      sequenceId: id,
      contactId: { in: contactIds },
      status: "active",
    },
    select: { contactId: true },
  });

  const alreadyEnrolled = new Set(existingEnrollments.map((e) => e.contactId));
  const newContactIds = contactIds.filter((cid) => !alreadyEnrolled.has(cid));

  if (newContactIds.length === 0) {
    return NextResponse.json(
      { error: "All contacts are already enrolled in this sequence" },
      { status: 400 }
    );
  }

  // Calculate first action time (first step delay)
  const firstStep = steps[0] as Record<string, unknown>;
  const delayDays = (firstStep?.delayDays as number) || 0;
  const nextActionAt = new Date();
  nextActionAt.setDate(nextActionAt.getDate() + delayDays);

  // Create enrollments
  const enrollments = await Promise.all(
    newContactIds.map((contactId) =>
      prisma.sequenceEnrollment.create({
        data: {
          sequenceId: id,
          contactId,
          status: "active",
          currentStep: 0,
          channel,
          nextActionAt,
          metadata: JSON.stringify({ enrolledBy: session.user.id }),
        },
        include: {
          contact: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      })
    )
  );

  return NextResponse.json(
    {
      data: {
        enrolled: enrollments.length,
        skipped: alreadyEnrolled.size,
        enrollments,
      },
    },
    { status: 201 }
  );
}
