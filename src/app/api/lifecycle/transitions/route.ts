import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET lifecycle transitions with filtering — the audit trail for debugging AI decisions
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const objectType = params.get("objectType") || "";
  const objectId = params.get("objectId") || "";
  const triggeredBy = params.get("triggeredBy") || "";
  const page = parseInt(params.get("page") || "1");
  const pageSize = parseInt(params.get("pageSize") || "50");

  const where: Record<string, unknown> = {};
  if (objectType) where.objectType = objectType;
  if (objectId) where.objectId = objectId;
  if (triggeredBy) where.triggeredBy = triggeredBy;

  const [data, total] = await Promise.all([
    prisma.lifecycleTransition.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.lifecycleTransition.count({ where }),
  ]);

  // Parse JSON fields
  const transitions = data.map((t) => ({
    ...t,
    gateValidation: t.gateValidation ? JSON.parse(t.gateValidation) : null,
    metadata: t.metadata ? JSON.parse(t.metadata) : null,
  }));

  return NextResponse.json({
    data: transitions,
    meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  });
}
