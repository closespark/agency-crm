import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const feedbackSchema = z.object({
  type: z.enum(["nps", "csat", "ces"]),
  score: z.coerce.number().int().min(0).max(10),
  comment: z.string().optional(),
  contactId: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = req.nextUrl.searchParams;
  const page = Math.max(1, parseInt(url.get("page") || "1"));
  const pageSize = Math.min(100, Math.max(1, parseInt(url.get("pageSize") || "20")));
  const type = url.get("type") || "";
  const sortBy = url.get("sortBy") || "createdAt";
  const sortDir = url.get("sortDir") === "asc" ? "asc" : "desc";

  const where: Record<string, unknown> = {};
  if (type) where.type = type;

  const [surveys, total] = await Promise.all([
    prisma.feedbackSurvey.findMany({
      where,
      orderBy: { [sortBy]: sortDir },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.feedbackSurvey.count({ where }),
  ]);

  return NextResponse.json({
    data: surveys,
    meta: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = feedbackSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const data = parsed.data;

  const survey = await prisma.feedbackSurvey.create({
    data: {
      type: data.type,
      score: data.score,
      comment: data.comment || null,
      contactId: data.contactId || null,
    },
  });

  return NextResponse.json({ data: survey }, { status: 201 });
}
