import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { generateSequence } from "@/lib/ai/sequence-generator";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();

  const {
    targetDescription,
    industry,
    painPoints,
    agencyServices,
    channels,
    stepCount,
    tone,
  } = body as {
    targetDescription: string;
    industry?: string;
    painPoints?: string[];
    agencyServices: string;
    channels: ("email" | "linkedin" | "multi")[];
    stepCount?: number;
    tone?: string;
  };

  if (!targetDescription || !targetDescription.trim()) {
    return NextResponse.json(
      { error: "Target description is required" },
      { status: 400 }
    );
  }

  if (!agencyServices || !agencyServices.trim()) {
    return NextResponse.json(
      { error: "Agency services description is required" },
      { status: 400 }
    );
  }

  if (!channels || !Array.isArray(channels) || channels.length === 0) {
    return NextResponse.json(
      { error: "At least one channel is required" },
      { status: 400 }
    );
  }

  try {
    const generated = await generateSequence({
      targetDescription,
      industry,
      painPoints,
      agencyServices,
      channels,
      stepCount: stepCount || 7,
      tone,
    });

    return NextResponse.json({ data: generated });
  } catch (error) {
    return NextResponse.json(
      {
        error: `AI generation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      },
      { status: 500 }
    );
  }
}
