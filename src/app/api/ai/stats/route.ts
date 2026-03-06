import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getAutopilotStats } from "@/lib/ai/autopilot";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const stats = await getAutopilotStats();

  return NextResponse.json({ data: stats });
}
