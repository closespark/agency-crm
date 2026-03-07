import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const AUTOPILOT_KEY = { category: "autopilot", changeType: "status" };

/**
 * GET /api/ai/autopilot — returns current autopilot active/paused state
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const record = await prisma.systemChangelog.findFirst({
    where: AUTOPILOT_KEY,
    orderBy: { createdAt: "desc" },
  });

  // Default to active if no record exists
  const isActive = record ? record.description === "active" : true;

  return NextResponse.json({
    data: {
      isActive,
      lastChangedAt: record?.createdAt || null,
      lastChangedBy: record?.dataEvidence || null,
    },
  });
}

/**
 * POST /api/ai/autopilot — toggle autopilot on/off
 * Body: { active: boolean }
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const active = Boolean(body.active);

  await prisma.systemChangelog.create({
    data: {
      category: "autopilot",
      changeType: "status",
      description: active ? "active" : "paused",
      dataEvidence: session.user.email || session.user.name || "unknown",
    },
  });

  return NextResponse.json({
    data: { isActive: active },
    message: active ? "Autopilot activated" : "Autopilot paused",
  });
}
