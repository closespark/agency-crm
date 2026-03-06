// GET /api/content/calendar — list content calendar entries
// POST /api/content/calendar — manually add a calendar entry

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const week = url.searchParams.get("week"); // YYYY-MM-DD Monday
  const channel = url.searchParams.get("channel");

  const where: Record<string, unknown> = {};
  if (week) where.weekStarting = new Date(week);
  if (channel) where.channel = channel;

  const entries = await prisma.contentCalendar.findMany({
    where,
    include: {
      drafts: {
        include: { performance: true },
      },
    },
    orderBy: [{ weekStarting: "desc" }, { priority: "desc" }],
    take: 50,
  });

  return NextResponse.json({ entries });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  if (!body.channel || !body.topic || !body.angle) {
    return NextResponse.json(
      { error: "channel, topic, and angle are required" },
      { status: 400 }
    );
  }

  const entry = await prisma.contentCalendar.create({
    data: {
      weekStarting: body.weekStarting ? new Date(body.weekStarting) : getNextMonday(),
      channel: body.channel,
      topic: body.topic,
      angle: body.angle,
      sourceInsight: body.sourceInsight,
      scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : undefined,
      priority: body.priority || 0,
    },
  });

  return NextResponse.json({ entry });
}

function getNextMonday(): Date {
  const now = new Date();
  const day = now.getDay();
  const daysUntilMonday = day === 0 ? 1 : 8 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + daysUntilMonday);
  monday.setHours(0, 0, 0, 0);
  return monday;
}
