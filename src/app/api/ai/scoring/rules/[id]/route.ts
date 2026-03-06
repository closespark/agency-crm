import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const { name, category, condition, points, isActive, isAIManaged } = body;

  const existing = await prisma.leadScoreRule.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Rule not found" }, { status: 404 });
  }

  const rule = await prisma.leadScoreRule.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(category !== undefined && { category }),
      ...(condition !== undefined && {
        condition: typeof condition === "string" ? condition : JSON.stringify(condition),
      }),
      ...(points !== undefined && { points: parseInt(points) || 0 }),
      ...(isActive !== undefined && { isActive }),
      ...(isAIManaged !== undefined && { isAIManaged }),
    },
  });

  return NextResponse.json({ data: rule });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const existing = await prisma.leadScoreRule.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Rule not found" }, { status: 404 });
  }

  await prisma.leadScoreRule.delete({ where: { id } });

  return NextResponse.json({ data: { success: true } });
}

// PATCH - toggle active/inactive
export async function PATCH(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const existing = await prisma.leadScoreRule.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Rule not found" }, { status: 404 });
  }

  const rule = await prisma.leadScoreRule.update({
    where: { id },
    data: { isActive: !existing.isActive },
  });

  return NextResponse.json({ data: rule });
}
