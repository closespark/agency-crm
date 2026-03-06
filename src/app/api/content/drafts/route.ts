// GET /api/content/drafts — list content drafts with performance data
// PATCH /api/content/drafts — update draft status (approve, reject, edit)

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const channel = url.searchParams.get("channel");
  const status = url.searchParams.get("status");

  const where: Record<string, unknown> = {};
  if (channel) where.channel = channel;
  if (status) where.status = status;

  const drafts = await prisma.contentDraft.findMany({
    where,
    include: {
      calendar: true,
      performance: true,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ drafts });
}

export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  if (!body.id) {
    return NextResponse.json({ error: "Draft id required" }, { status: 400 });
  }

  const updateData: Record<string, unknown> = {};
  if (body.status) updateData.status = body.status;
  if (body.body) updateData.body = body.body;
  if (body.title) updateData.title = body.title;
  if (body.publishAt) updateData.publishAt = new Date(body.publishAt);

  const draft = await prisma.contentDraft.update({
    where: { id: body.id },
    data: updateData,
  });

  return NextResponse.json({ draft });
}
