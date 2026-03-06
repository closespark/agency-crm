import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const view = await prisma.savedView.findUnique({
    where: { id },
  });

  if (!view) {
    return NextResponse.json({ error: "View not found" }, { status: 404 });
  }

  return NextResponse.json({ data: view });
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

  const existing = await prisma.savedView.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "View not found" }, { status: 404 });
  }

  const view = await prisma.savedView.update({
    where: { id },
    data: {
      name: body.name ?? existing.name,
      object: body.object ?? existing.object,
      filters: body.filters ? JSON.stringify(body.filters) : existing.filters,
      columns: body.columns ? JSON.stringify(body.columns) : existing.columns,
      sortBy: body.sortBy !== undefined ? body.sortBy : existing.sortBy,
      sortDir: body.sortDir ?? existing.sortDir,
      isDefault: body.isDefault !== undefined ? body.isDefault : existing.isDefault,
    },
  });

  return NextResponse.json({ data: view });
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

  const existing = await prisma.savedView.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "View not found" }, { status: 404 });
  }

  await prisma.savedView.delete({ where: { id } });

  return NextResponse.json({ data: { success: true } });
}
