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
  const type = searchParams.get("type") || "";
  const status = searchParams.get("status") || "";
  const priority = searchParams.get("priority") || "";

  const where: Record<string, unknown> = {};

  if (type) {
    where.type = type;
  }
  if (status) {
    where.status = status;
  }
  if (priority) {
    where.priority = priority;
  }

  const [data, total] = await Promise.all([
    prisma.aIInsight.findMany({
      where,
      orderBy: [
        { priority: "desc" },
        { createdAt: "desc" },
      ],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.aIInsight.count({ where }),
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

  if (!body.type || !body.title || !body.description || !body.resourceType || !body.resourceId) {
    return NextResponse.json(
      { error: "type, title, description, resourceType, and resourceId are required" },
      { status: 400 }
    );
  }

  const insight = await prisma.aIInsight.create({
    data: {
      type: body.type,
      title: body.title,
      description: body.description,
      priority: body.priority || "medium",
      resourceType: body.resourceType,
      resourceId: body.resourceId,
      actionItems: body.actionItems ? JSON.stringify(body.actionItems) : null,
      status: "new",
    },
  });

  return NextResponse.json({ data: insight }, { status: 201 });
}
