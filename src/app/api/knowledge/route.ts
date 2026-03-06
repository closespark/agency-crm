import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const knowledgeArticleSchema = z.object({
  title: z.string().min(1, "Title is required"),
  slug: z.string().min(1, "Slug is required"),
  body: z.string().min(1, "Body is required"),
  category: z.string().optional(),
  status: z.string().default("draft"),
});

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = req.nextUrl.searchParams;
  const page = Math.max(1, parseInt(url.get("page") || "1"));
  const pageSize = Math.min(100, Math.max(1, parseInt(url.get("pageSize") || "20")));
  const search = url.get("search") || "";
  const category = url.get("category") || "";
  const status = url.get("status") || "";
  const sortBy = url.get("sortBy") || "createdAt";
  const sortDir = url.get("sortDir") === "asc" ? "asc" : "desc";

  const where: Record<string, unknown> = {};

  if (search) {
    where.OR = [
      { title: { contains: search } },
      { body: { contains: search } },
    ];
  }
  if (category) where.category = category;
  if (status) where.status = status;

  const [articles, total] = await Promise.all([
    prisma.knowledgeArticle.findMany({
      where,
      orderBy: { [sortBy]: sortDir },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.knowledgeArticle.count({ where }),
  ]);

  return NextResponse.json({
    data: articles,
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
  const parsed = knowledgeArticleSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const data = parsed.data;

  // Check for duplicate slug
  const existingSlug = await prisma.knowledgeArticle.findUnique({
    where: { slug: data.slug },
  });
  if (existingSlug) {
    return NextResponse.json(
      { error: "An article with this slug already exists" },
      { status: 409 }
    );
  }

  const article = await prisma.knowledgeArticle.create({
    data: {
      title: data.title,
      slug: data.slug,
      body: data.body,
      category: data.category || null,
      status: data.status,
    },
  });

  return NextResponse.json({ data: article }, { status: 201 });
}
