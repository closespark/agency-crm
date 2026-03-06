import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const status = searchParams.get("status") || "";
  const channel = searchParams.get("channel") || "";
  const search = searchParams.get("search") || "";

  const where: Record<string, unknown> = {};

  if (status) {
    where.status = status;
  }

  if (channel) {
    where.channel = channel;
  }

  if (search) {
    where.OR = [
      { subject: { contains: search } },
      {
        messages: {
          some: { body: { contains: search } },
        },
      },
    ];
  }

  const conversations = await prisma.conversation.findMany({
    where,
    include: {
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: {
          user: { select: { id: true, name: true, image: true } },
          contact: { select: { id: true, firstName: true, lastName: true } },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({ data: conversations });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { channel, contactId, subject } = body;

  if (!channel) {
    return NextResponse.json(
      { error: "Channel is required" },
      { status: 400 }
    );
  }

  const conversation = await prisma.conversation.create({
    data: {
      channel,
      contactId: contactId || null,
      subject: subject || null,
      assigneeId: session.user.id,
      status: "open",
    },
    include: {
      messages: true,
    },
  });

  return NextResponse.json({ data: conversation }, { status: 201 });
}
