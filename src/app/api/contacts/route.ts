import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { contactSchema } from "@/lib/validations";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const page = parseInt(searchParams.get("page") || "1");
  const pageSize = parseInt(searchParams.get("pageSize") || "25");
  const search = searchParams.get("search") || "";
  const lifecycleStage = searchParams.get("lifecycleStage") || "";
  const leadStatus = searchParams.get("leadStatus") || "";
  const companyId = searchParams.get("companyId") || "";
  const ownerId = searchParams.get("ownerId") || "";
  const sortBy = searchParams.get("sortBy") || "createdAt";
  const sortDir = searchParams.get("sortDir") || "desc";

  const where: Record<string, unknown> = {};

  if (search) {
    where.OR = [
      { firstName: { contains: search } },
      { lastName: { contains: search } },
      { email: { contains: search } },
      { phone: { contains: search } },
    ];
  }

  if (lifecycleStage) {
    where.lifecycleStage = lifecycleStage;
  }

  if (leadStatus) {
    where.leadStatus = leadStatus;
  }

  if (companyId) {
    where.companyId = companyId;
  }

  if (ownerId) {
    where.ownerId = ownerId;
  }

  const [data, total] = await Promise.all([
    prisma.contact.findMany({
      where,
      include: {
        company: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true, image: true } },
      },
      orderBy: { [sortBy]: sortDir },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.contact.count({ where }),
  ]);

  return NextResponse.json({
    data,
    meta: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = contactSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const data = parsed.data;

  const contact = await prisma.contact.create({
    data: {
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email || null,
      phone: data.phone || null,
      jobTitle: data.jobTitle || null,
      lifecycleStage: data.lifecycleStage || "subscriber",
      stageEnteredAt: new Date(),
      leadStatus: data.leadStatus || null,
      ownerId: data.ownerId || session.user.id,
      companyId: data.companyId || null,
      source: data.source || null,
    },
    include: {
      company: { select: { id: true, name: true } },
      owner: { select: { id: true, name: true, image: true } },
    },
  });

  return NextResponse.json({ data: contact }, { status: 201 });
}
