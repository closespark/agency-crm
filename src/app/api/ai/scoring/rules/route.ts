import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rules = await prisma.leadScoreRule.findMany({
    orderBy: [{ category: "asc" }, { points: "desc" }],
  });

  return NextResponse.json({ data: rules });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { name, category, condition, points, isActive, isAIManaged } = body;

  if (!name || !category || !condition) {
    return NextResponse.json(
      { error: "name, category, and condition are required" },
      { status: 400 }
    );
  }

  const validCategories = ["demographic", "behavioral", "engagement", "firmographic"];
  if (!validCategories.includes(category)) {
    return NextResponse.json(
      { error: `category must be one of: ${validCategories.join(", ")}` },
      { status: 400 }
    );
  }

  const rule = await prisma.leadScoreRule.create({
    data: {
      name,
      category,
      condition: typeof condition === "string" ? condition : JSON.stringify(condition),
      points: parseInt(points) || 0,
      isActive: isActive !== false,
      isAIManaged: isAIManaged === true,
    },
  });

  return NextResponse.json({ data: rule }, { status: 201 });
}
