import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { analyzeDeal } from "@/lib/ai/deal-advisor";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ dealId: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { dealId } = await params;

  try {
    const result = await analyzeDeal(dealId);
    return NextResponse.json({ data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to analyze deal";
    const status = message === "Deal not found" ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
