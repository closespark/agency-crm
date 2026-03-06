import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const integrations = await prisma.integration.findMany({
    include: {
      _count: { select: { webhookEvents: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ data: integrations });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();

  const { name, type, config } = body;

  if (!name || !type) {
    return NextResponse.json(
      { error: "Name and type are required" },
      { status: 400 }
    );
  }

  if (!["oauth", "api_key", "webhook"].includes(type)) {
    return NextResponse.json(
      { error: "Type must be one of: oauth, api_key, webhook" },
      { status: 400 }
    );
  }

  const integration = await prisma.integration.create({
    data: {
      name,
      type,
      config: config ? JSON.stringify(config) : "{}",
      isActive: false,
    },
  });

  return NextResponse.json({ data: integration }, { status: 201 });
}
