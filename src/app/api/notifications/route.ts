import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const unreadOnly = searchParams.get("unreadOnly") === "true";

  const where: Record<string, unknown> = {
    userId: session.user.id,
  };

  if (unreadOnly) {
    where.isRead = false;
  }

  const notifications = await prisma.notification.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ data: notifications });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { userId, title, body: notifBody, type, resourceType, resourceId } = body;

  if (!title || !type) {
    return NextResponse.json(
      { error: "Title and type are required" },
      { status: 400 }
    );
  }

  const notification = await prisma.notification.create({
    data: {
      userId: userId || session.user.id,
      title,
      body: notifBody || null,
      type,
      resourceType: resourceType || null,
      resourceId: resourceId || null,
    },
  });

  return NextResponse.json({ data: notification }, { status: 201 });
}
