import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { analyzeReply } from "@/lib/ai/reply-analyzer";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { content, contactId, channel } = body as {
    content: string;
    contactId?: string;
    channel?: string;
  };

  if (!content) {
    return NextResponse.json(
      { error: "content is required" },
      { status: 400 }
    );
  }

  try {
    const result = await analyzeReply(content, contactId, channel);
    return NextResponse.json({ data: result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to analyze reply";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
