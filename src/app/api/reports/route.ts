import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const type = searchParams.get("type") || "";
  const search = searchParams.get("search") || "";

  const where: Record<string, unknown> = {};

  if (type) {
    where.type = type;
  }

  if (search) {
    where.name = { contains: search };
  }

  const reports = await prisma.savedReport.findMany({
    where,
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({ data: reports });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();

  if (!body.name || !body.type) {
    return NextResponse.json(
      { error: "Name and type are required" },
      { status: 400 }
    );
  }

  const report = await prisma.savedReport.create({
    data: {
      name: body.name,
      type: body.type,
      config: JSON.stringify(body.config || {}),
    },
  });

  return NextResponse.json({ data: report }, { status: 201 });
}
