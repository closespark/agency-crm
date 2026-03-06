import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const object = searchParams.get("object") || "";

  const where: Record<string, unknown> = {};

  if (object) {
    where.object = object;
  }

  // Show views belonging to the current user or views with no userId (shared)
  where.OR = [{ userId: session.user.id }, { userId: null }];

  const views = await prisma.savedView.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ data: views });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();

  if (!body.name || !body.object) {
    return NextResponse.json(
      { error: "Name and object are required" },
      { status: 400 }
    );
  }

  const view = await prisma.savedView.create({
    data: {
      name: body.name,
      object: body.object,
      filters: JSON.stringify(body.filters || {}),
      columns: JSON.stringify(body.columns || []),
      sortBy: body.sortBy || null,
      sortDir: body.sortDir || "desc",
      isDefault: body.isDefault || false,
      userId: session.user.id,
    },
  });

  return NextResponse.json({ data: view }, { status: 201 });
}
