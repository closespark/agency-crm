import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sequenceSchema } from "@/lib/validations";
import { saveGeneratedSequence } from "@/lib/ai/sequence-generator";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const page = parseInt(searchParams.get("page") || "1");
  const pageSize = parseInt(searchParams.get("pageSize") || "25");
  const search = searchParams.get("search") || "";
  const sortBy = searchParams.get("sortBy") || "createdAt";
  const sortDir = searchParams.get("sortDir") || "desc";
  const aiGenerated = searchParams.get("aiGenerated");
  const isActive = searchParams.get("isActive");

  const where: Record<string, unknown> = {};

  if (search) {
    where.OR = [
      { name: { contains: search } },
      { description: { contains: search } },
    ];
  }

  if (aiGenerated !== null && aiGenerated !== undefined && aiGenerated !== "") {
    where.aiGenerated = aiGenerated === "true";
  }

  if (isActive !== null && isActive !== undefined && isActive !== "") {
    where.isActive = isActive === "true";
  }

  const [data, total] = await Promise.all([
    prisma.sequence.findMany({
      where,
      include: {
        _count: {
          select: { enrollments: true },
        },
        enrollments: {
          select: { status: true },
        },
      },
      orderBy: { [sortBy]: sortDir },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.sequence.count({ where }),
  ]);

  // Compute stats
  const allEnrollments = await prisma.sequenceEnrollment.findMany({
    select: { status: true },
  });

  const activeEnrollments = allEnrollments.filter(
    (e) => e.status === "active"
  ).length;
  const completedSequences = allEnrollments.filter(
    (e) => e.status === "completed"
  ).length;
  const repliedCount = allEnrollments.filter(
    (e) => e.status === "replied"
  ).length;
  const replyRate =
    allEnrollments.length > 0
      ? Math.round((repliedCount / allEnrollments.length) * 100)
      : 0;

  // Enrich data with parsed steps count
  const enriched = data.map((seq) => {
    let stepsCount = 0;
    try {
      const steps = JSON.parse(seq.steps);
      stepsCount = Array.isArray(steps) ? steps.length : 0;
    } catch {
      stepsCount = 0;
    }

    const enrollmentCounts = {
      total: seq.enrollments.length,
      active: seq.enrollments.filter((e) => e.status === "active").length,
      completed: seq.enrollments.filter((e) => e.status === "completed").length,
      replied: seq.enrollments.filter((e) => e.status === "replied").length,
    };

    const { enrollments: _, _count, ...rest } = seq;
    return {
      ...rest,
      stepsCount,
      enrollmentCounts,
    };
  });

  return NextResponse.json({
    data: enriched,
    meta: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
    stats: {
      activeEnrollments,
      completedSequences,
      replyRate,
    },
  });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();

  // AI-generated sequence: save from generated data
  if (body.aiGenerated && body.generatedSequence) {
    try {
      const sequenceId = await saveGeneratedSequence(body.generatedSequence);
      const sequence = await prisma.sequence.findUnique({
        where: { id: sequenceId },
      });
      return NextResponse.json({ data: sequence }, { status: 201 });
    } catch (error) {
      return NextResponse.json(
        { error: `Failed to save AI sequence: ${error instanceof Error ? error.message : "Unknown error"}` },
        { status: 500 }
      );
    }
  }

  // Manual sequence creation
  const parsed = sequenceSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const data = parsed.data;

  const sequence = await prisma.sequence.create({
    data: {
      name: data.name,
      description: data.description || null,
      steps: data.steps,
      isActive: data.isActive,
      aiGenerated: false,
    },
  });

  return NextResponse.json({ data: sequence }, { status: 201 });
}
