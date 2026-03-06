import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { activitySchema } from "@/lib/validations";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const page = parseInt(searchParams.get("page") || "1");
  const pageSize = parseInt(searchParams.get("pageSize") || "25");
  const contactId = searchParams.get("contactId") || "";
  const dealId = searchParams.get("dealId") || "";
  const type = searchParams.get("type") || "";
  const userId = searchParams.get("userId") || "";
  const sortBy = searchParams.get("sortBy") || "createdAt";
  const sortDir = searchParams.get("sortDir") || "desc";

  const where: Record<string, unknown> = {};

  if (contactId) {
    where.contactId = contactId;
  }

  if (dealId) {
    where.dealId = dealId;
  }

  if (type) {
    where.type = type;
  }

  if (userId) {
    where.userId = userId;
  }

  const [data, total] = await Promise.all([
    prisma.activity.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, image: true } },
        contact: { select: { id: true, firstName: true, lastName: true } },
        deal: { select: { id: true, name: true } },
      },
      orderBy: { [sortBy]: sortDir },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.activity.count({ where }),
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
  const parsed = activitySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const data = parsed.data;

  const activity = await prisma.activity.create({
    data: {
      type: data.type,
      subject: data.subject || null,
      body: data.body || null,
      userId: session.user.id,
      contactId: data.contactId || null,
      dealId: data.dealId || null,
      duration: data.duration || null,
      outcome: data.outcome || null,
    },
    include: {
      user: { select: { id: true, name: true, image: true } },
      contact: { select: { id: true, firstName: true, lastName: true } },
      deal: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({ data: activity }, { status: 201 });
}
