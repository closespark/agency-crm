import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(
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

  const integration = await prisma.integration.update({
    where: { id },
    data: { isActive: !existing.isActive },
  });

  return NextResponse.json({ data: integration });
}
