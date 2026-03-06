import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const data = await prisma.aIAgent.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: { select: { jobs: true } },
    },
  });

  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();

  if (!body.name || !body.systemPrompt) {
    return NextResponse.json(
      { error: "Name and system prompt are required" },
      { status: 400 }
    );
  }

  const agent = await prisma.aIAgent.create({
    data: {
      name: body.name,
      description: body.description || null,
      systemPrompt: body.systemPrompt,
      model: body.model || "claude-sonnet-4-20250514",
      temperature: body.temperature ?? 0.7,
      isActive: body.isActive ?? true,
      config: body.config ? JSON.stringify(body.config) : null,
    },
  });

  return NextResponse.json({ data: agent }, { status: 201 });
}
