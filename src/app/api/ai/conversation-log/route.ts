import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const page = parseInt(searchParams.get("page") || "1");
  const pageSize = parseInt(searchParams.get("pageSize") || "25");
  const contactId = searchParams.get("contactId") || "";
  const dealId = searchParams.get("dealId") || "";
  const sentiment = searchParams.get("sentiment") || "";
  const intent = searchParams.get("intent") || "";
  const channel = searchParams.get("channel") || "";
  const direction = searchParams.get("direction") || "";

  const where: Record<string, unknown> = {};

  if (contactId) {
    where.contactId = contactId;
  }
  if (dealId) {
    where.dealId = dealId;
  }
  if (sentiment) {
    where.sentiment = sentiment;
  }
  if (intent) {
    where.intent = intent;
  }
  if (channel) {
    where.channel = channel;
  }
  if (direction) {
    where.direction = direction;
  }

  const [data, total] = await Promise.all([
    prisma.aIConversationLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.aIConversationLog.count({ where }),
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
