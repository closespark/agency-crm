import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = req.nextUrl.searchParams;
  const page = Math.max(1, parseInt(url.get("page") || "1"));
  const pageSize = Math.min(100, Math.max(1, parseInt(url.get("pageSize") || "20")));
  const search = url.get("search") || "";
  const status = url.get("status") || "";
  const searchId = url.get("searchId") || "";
  const minFitScore = url.get("minFitScore") || "";
  const maxFitScore = url.get("maxFitScore") || "";
  const sortBy = url.get("sortBy") || "createdAt";
  const sortDir = url.get("sortDir") === "asc" ? "asc" : "desc";

  const where: Record<string, unknown> = {};

  if (search) {
    where.OR = [
      { firstName: { contains: search } },
      { lastName: { contains: search } },
      { email: { contains: search } },
      { companyName: { contains: search } },
      { jobTitle: { contains: search } },
    ];
  }
  if (status) where.status = status;
  if (searchId) where.searchId = searchId;
  if (minFitScore || maxFitScore) {
    where.fitScore = {
      ...(minFitScore ? { gte: parseInt(minFitScore) } : {}),
      ...(maxFitScore ? { lte: parseInt(maxFitScore) } : {}),
    };
  }

  const [prospects, total] = await Promise.all([
    prisma.prospect.findMany({
      where,
      include: {
        search: { select: { id: true, name: true } },
      },
      orderBy: { [sortBy]: sortDir },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.prospect.count({ where }),
  ]);

  return NextResponse.json({
    data: prospects,
    meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  });
}
