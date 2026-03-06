import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { dealSchema } from "@/lib/validations";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const page = parseInt(searchParams.get("page") || "1");
  const pageSize = parseInt(searchParams.get("pageSize") || "25");
  const search = searchParams.get("search") || "";
  const stage = searchParams.get("stage") || "";
  const pipeline = searchParams.get("pipeline") || "";
  const ownerId = searchParams.get("ownerId") || "";
  const contactId = searchParams.get("contactId") || "";
  const companyId = searchParams.get("companyId") || "";
  const sortBy = searchParams.get("sortBy") || "createdAt";
  const sortDir = searchParams.get("sortDir") || "desc";

  const where: Record<string, unknown> = {};

  if (search) {
    where.OR = [{ name: { contains: search } }];
  }

  if (stage) {
    where.stage = stage;
  }

  if (pipeline) {
    where.pipeline = pipeline;
  }

  if (ownerId) {
    where.ownerId = ownerId;
  }

  if (contactId) {
    where.contactId = contactId;
  }

  if (companyId) {
    where.companyId = companyId;
  }

  const [data, total] = await Promise.all([
    prisma.deal.findMany({
      where,
      include: {
        owner: { select: { id: true, name: true, image: true } },
        contact: { select: { id: true, firstName: true, lastName: true, email: true } },
        company: { select: { id: true, name: true } },
      },
      orderBy: { [sortBy]: sortDir },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.deal.count({ where }),
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
  const parsed = dealSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const data = parsed.data;

  const deal = await prisma.deal.create({
    data: {
      name: data.name,
      amount: data.amount || null,
      currency: data.currency,
      stage: data.stage || "discovery",
      pipeline: data.pipeline || "new_business",
      probability: data.probability || 10,
      stageEnteredAt: new Date(),
      closeDate: data.closeDate ? new Date(data.closeDate) : null,
      ownerId: data.ownerId || session.user.id,
      contactId: data.contactId || null,
      companyId: data.companyId || null,
    },
    include: {
      owner: { select: { id: true, name: true, image: true } },
      contact: { select: { id: true, firstName: true, lastName: true } },
      company: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({ data: deal }, { status: 201 });
}
