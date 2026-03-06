import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();

  const validStatuses = ["new", "acknowledged", "acted_on", "dismissed"];
  if (body.status && !validStatuses.includes(body.status)) {
    return NextResponse.json(
      { error: "Invalid status. Must be one of: " + validStatuses.join(", ") },
      { status: 400 }
    );
  }

  const insight = await prisma.aIInsight.update({
    where: { id },
    data: {
      ...(body.status && { status: body.status }),
    },
  });

  return NextResponse.json({ data: insight });
}
