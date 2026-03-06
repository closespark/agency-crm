import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { taskSchema } from "@/lib/validations";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const page = parseInt(searchParams.get("page") || "1");
  const pageSize = parseInt(searchParams.get("pageSize") || "25");
  const search = searchParams.get("search") || "";
  const status = searchParams.get("status") || "";
  const priority = searchParams.get("priority") || "";
  const type = searchParams.get("type") || "";
  const contactId = searchParams.get("contactId") || "";
  const userId = searchParams.get("userId") || "";
  const sortBy = searchParams.get("sortBy") || "createdAt";
  const sortDir = searchParams.get("sortDir") || "desc";

  const where: Record<string, unknown> = {};

  if (search) {
    where.OR = [
      { title: { contains: search } },
      { description: { contains: search } },
    ];
  }

  if (status) {
    where.status = status;
  }

  if (priority) {
    where.priority = priority;
  }

  if (type) {
    where.type = type;
  }

  if (contactId) {
    where.contactId = contactId;
  }

  if (userId) {
    where.userId = userId;
  }

  const [data, total] = await Promise.all([
    prisma.task.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, image: true } },
        contact: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { [sortBy]: sortDir },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.task.count({ where }),
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
  const parsed = taskSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const data = parsed.data;

  const task = await prisma.task.create({
    data: {
      title: data.title,
      description: data.description || null,
      type: data.type,
      priority: data.priority,
      status: data.status,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      userId: session.user.id,
      contactId: data.contactId || null,
    },
    include: {
      user: { select: { id: true, name: true, image: true } },
      contact: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  return NextResponse.json({ data: task }, { status: 201 });
}
