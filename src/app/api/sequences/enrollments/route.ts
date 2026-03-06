import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const page = parseInt(searchParams.get("page") || "1");
  const pageSize = parseInt(searchParams.get("pageSize") || "25");
  const status = searchParams.get("status") || "";
  const sequenceId = searchParams.get("sequenceId") || "";
  const contactId = searchParams.get("contactId") || "";
  const search = searchParams.get("search") || "";
  const sortBy = searchParams.get("sortBy") || "createdAt";
  const sortDir = searchParams.get("sortDir") || "desc";

  const where: Record<string, unknown> = {};

  if (status) {
    where.status = status;
  }

  if (sequenceId) {
    where.sequenceId = sequenceId;
  }

  if (contactId) {
    where.contactId = contactId;
  }

  if (search) {
    where.OR = [
      { contact: { firstName: { contains: search } } },
      { contact: { lastName: { contains: search } } },
      { contact: { email: { contains: search } } },
      { sequence: { name: { contains: search } } },
    ];
  }

  const [data, total] = await Promise.all([
    prisma.sequenceEnrollment.findMany({
      where,
      include: {
        sequence: {
          select: { id: true, name: true, steps: true },
        },
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
      orderBy: { [sortBy]: sortDir },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.sequenceEnrollment.count({ where }),
  ]);

  // Enrich with total steps count
  const enriched = data.map((enrollment) => {
    let totalSteps = 0;
    try {
      const steps = JSON.parse(enrollment.sequence.steps);
      totalSteps = Array.isArray(steps) ? steps.length : 0;
    } catch {
      totalSteps = 0;
    }

    return {
      ...enrollment,
      totalSteps,
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
  });
}
