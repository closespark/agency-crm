import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const search = await prisma.prospectSearch.findUnique({
    where: { id },
    include: {
      prospects: {
        orderBy: { fitScore: "desc" },
      },
      _count: { select: { prospects: true } },
    },
  });

  if (!search) {
    return NextResponse.json({ error: "Search not found" }, { status: 404 });
  }

  return NextResponse.json({ data: search });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const search = await prisma.prospectSearch.findUnique({ where: { id } });
  if (!search) {
    return NextResponse.json({ error: "Search not found" }, { status: 404 });
  }

  await prisma.prospectSearch.delete({ where: { id } });

  return NextResponse.json({ data: { success: true } });
}
