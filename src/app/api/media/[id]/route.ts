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

  const asset = await prisma.mediaAsset.findUnique({
    where: { id },
  });

  if (!asset) {
    return NextResponse.json({ error: "Media asset not found" }, { status: 404 });
  }

  return NextResponse.json({ data: asset });
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

  const existing = await prisma.mediaAsset.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Media asset not found" }, { status: 404 });
  }

  await prisma.mediaAsset.delete({ where: { id } });

  return NextResponse.json({ data: { success: true } });
}
