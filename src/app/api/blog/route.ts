import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { blogPostSchema } from "@/lib/validations";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const page = parseInt(searchParams.get("page") || "1");
  const pageSize = parseInt(searchParams.get("pageSize") || "25");
  const search = searchParams.get("search") || "";
  const status = searchParams.get("status") || "";
  const tag = searchParams.get("tag") || "";
  const sortBy = searchParams.get("sortBy") || "createdAt";
  const sortDir = searchParams.get("sortDir") || "desc";

  const where: Record<string, unknown> = {};

  if (search) {
    where.OR = [
      { title: { contains: search } },
      { slug: { contains: search } },
      { body: { contains: search } },
    ];
  }

  if (status) {
    where.status = status;
  }

  if (tag) {
    where.tags = { contains: tag };
  }

  const [data, total] = await Promise.all([
    prisma.blogPost.findMany({
      where,
      orderBy: { [sortBy]: sortDir },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.blogPost.count({ where }),
  ]);

  return NextResponse.json({
    data,
    meta: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = blogPostSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const data = parsed.data;

  const existing = await prisma.blogPost.findUnique({
    where: { slug: data.slug },
  });

  if (existing) {
    return NextResponse.json(
      { error: "A blog post with this slug already exists" },
      { status: 409 }
    );
  }

  const post = await prisma.blogPost.create({
    data: {
      title: data.title,
      slug: data.slug,
      body: data.body,
      excerpt: data.excerpt || null,
      coverImage: data.coverImage || null,
      author: data.author || session.user.name || null,
      tags: data.tags || null,
      status: data.status,
      publishedAt: data.status === "published" ? new Date() : null,
    },
  });

  return NextResponse.json({ data: post }, { status: 201 });
}
