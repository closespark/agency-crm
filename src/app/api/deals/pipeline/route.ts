import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const pipeline = searchParams.get("pipeline") || "default";
    const ownerId = searchParams.get("ownerId") || undefined;
    const dateFrom = searchParams.get("dateFrom") || undefined;
    const dateTo = searchParams.get("dateTo") || undefined;

    // Build where clause
    const where: Record<string, unknown> = { pipeline };

    if (ownerId) {
      where.ownerId = ownerId;
    }

    if (dateFrom || dateTo) {
      const closeDateFilter: Record<string, Date> = {};
      if (dateFrom) closeDateFilter.gte = new Date(dateFrom);
      if (dateTo) closeDateFilter.lte = new Date(dateTo);
      where.closeDate = closeDateFilter;
    }

    const [deals, pipelineNames, owners] = await Promise.all([
      prisma.deal.findMany({
        where,
        orderBy: { position: "asc" },
        include: {
          contact: {
            select: { id: true, firstName: true, lastName: true },
          },
          owner: {
            select: { id: true, name: true, email: true },
          },
          company: {
            select: { id: true, name: true },
          },
        },
      }),
      prisma.deal
        .findMany({
          select: { pipeline: true },
          distinct: ["pipeline"],
        })
        .then((rows: { pipeline: string }[]) => rows.map((r: { pipeline: string }) => r.pipeline)),
      prisma.user.findMany({
        where: {
          ownedDeals: { some: {} },
        },
        select: { id: true, name: true, email: true },
        orderBy: { name: "asc" },
      }),
    ]);

    return NextResponse.json({
      data: {
        deals,
        pipelines: pipelineNames.length > 0 ? pipelineNames : ["default"],
        owners,
      },
    });
  } catch (error) {
    console.error("Pipeline fetch error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
