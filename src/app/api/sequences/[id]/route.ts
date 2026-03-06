import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sequenceSchema } from "@/lib/validations";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const sequence = await prisma.sequence.findUnique({
    where: { id },
    include: {
      enrollments: {
        include: {
          contact: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              jobTitle: true,
              company: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!sequence) {
    return NextResponse.json({ error: "Sequence not found" }, { status: 404 });
  }

  // Parse steps for performance metrics
  let steps: Array<Record<string, unknown>> = [];
  try {
    steps = JSON.parse(sequence.steps);
  } catch {
    steps = [];
  }

  // Calculate per-step performance metrics from enrollment metadata
  const stepMetrics = steps.map((step, index) => {
    const enrollmentsAtStep = sequence.enrollments.filter(
      (e) => e.currentStep >= index
    );
    const total = enrollmentsAtStep.length;

    // Parse metadata for open/reply/bounce tracking
    let opens = 0;
    let replies = 0;
    let bounces = 0;

    sequence.enrollments.forEach((enrollment) => {
      try {
        const meta = enrollment.metadata
          ? JSON.parse(enrollment.metadata)
          : {};
        const stepData = meta?.stepMetrics?.[index];
        if (stepData) {
          if (stepData.opened) opens++;
          if (stepData.replied) replies++;
          if (stepData.bounced) bounces++;
        }
      } catch {
        // skip invalid metadata
      }
    });

    return {
      stepNumber: index + 1,
      channel: (step as Record<string, unknown>).channel || "email",
      subject: (step as Record<string, unknown>).subject || "",
      reached: total,
      openRate: total > 0 ? Math.round((opens / total) * 100) : 0,
      replyRate: total > 0 ? Math.round((replies / total) * 100) : 0,
      bounceRate: total > 0 ? Math.round((bounces / total) * 100) : 0,
    };
  });

  return NextResponse.json({
    data: {
      ...sequence,
      parsedSteps: steps,
      stepMetrics,
    },
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const parsed = sequenceSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const existing = await prisma.sequence.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Sequence not found" }, { status: 404 });
  }

  const data = parsed.data;

  const sequence = await prisma.sequence.update({
    where: { id },
    data: {
      name: data.name,
      description: data.description || null,
      steps: data.steps,
      isActive: data.isActive,
    },
  });

  return NextResponse.json({ data: sequence });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const existing = await prisma.sequence.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Sequence not found" }, { status: 404 });
  }

  // Delete enrollments first, then sequence
  await prisma.sequenceEnrollment.deleteMany({ where: { sequenceId: id } });
  await prisma.sequence.delete({ where: { id } });

  return NextResponse.json({ data: { success: true } });
}
