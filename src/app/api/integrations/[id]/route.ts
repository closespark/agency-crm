import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { clearKeyCache } from "@/lib/integration-keys";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const integration = await prisma.integration.findUnique({
    where: { id },
    include: {
      webhookEvents: {
        orderBy: { createdAt: "desc" },
        take: 50,
      },
      _count: { select: { webhookEvents: true } },
    },
  });

  if (!integration) {
    return NextResponse.json(
      { error: "Integration not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({ data: integration });
}

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

  const existing = await prisma.integration.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json(
      { error: "Integration not found" },
      { status: 404 }
    );
  }

  const updateData: Record<string, unknown> = {};

  if (body.name !== undefined) updateData.name = body.name;
  if (body.type !== undefined) updateData.type = body.type;
  if (body.config !== undefined) {
    updateData.config =
      typeof body.config === "string"
        ? body.config
        : JSON.stringify(body.config);
  }
  if (body.isActive !== undefined) updateData.isActive = body.isActive;

  const integration = await prisma.integration.update({
    where: { id },
    data: updateData,
  });

  // Clear cached keys so new values take effect immediately
  if (updateData.config !== undefined) {
    clearKeyCache();
  }

  return NextResponse.json({ data: integration });
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

  const existing = await prisma.integration.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json(
      { error: "Integration not found" },
      { status: 404 }
    );
  }

  await prisma.webhookEvent.deleteMany({ where: { integrationId: id } });
  await prisma.integration.delete({ where: { id } });

  return NextResponse.json({ data: { success: true } });
}
