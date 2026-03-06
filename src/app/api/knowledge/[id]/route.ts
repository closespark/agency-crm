import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const knowledgeArticleUpdateSchema = z.object({
  title: z.string().min(1, "Title is required").optional(),
  slug: z.string().min(1, "Slug is required").optional(),
  body: z.string().min(1, "Body is required").optional(),
  category: z.string().optional(),
  status: z.string().optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Try finding by id first, then by slug
  let article = await prisma.knowledgeArticle.findUnique({ where: { id } });
  if (!article) {
    article = await prisma.knowledgeArticle.findUnique({ where: { slug: id } });
  }

  if (!article) {
    return NextResponse.json({ error: "Article not found" }, { status: 404 });
  }

  // Increment view count
  await prisma.knowledgeArticle.update({
    where: { id: article.id },
    data: { viewCount: { increment: 1 } },
  });

  return NextResponse.json({ data: article });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();
  const parsed = knowledgeArticleUpdateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const existing = await prisma.knowledgeArticle.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Article not found" }, { status: 404 });
  }

  // Check for duplicate slug if slug is being changed
  if (parsed.data.slug && parsed.data.slug !== existing.slug) {
    const slugTaken = await prisma.knowledgeArticle.findUnique({
      where: { slug: parsed.data.slug },
    });
    if (slugTaken) {
      return NextResponse.json(
        { error: "An article with this slug already exists" },
        { status: 409 }
      );
    }
  }

  const article = await prisma.knowledgeArticle.update({
    where: { id },
    data: parsed.data,
  });

  return NextResponse.json({ data: article });
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

  const existing = await prisma.knowledgeArticle.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Article not found" }, { status: 404 });
  }

  await prisma.knowledgeArticle.delete({ where: { id } });

  return NextResponse.json({ data: { success: true } });
}
