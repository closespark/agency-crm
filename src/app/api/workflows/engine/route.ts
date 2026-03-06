import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { processWorkflows } from "@/lib/ai/workflow-engine";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { eventType, data } = body;

  if (!eventType) {
    return NextResponse.json(
      { error: "eventType is required" },
      { status: 400 }
    );
  }

  try {
    const executedCount = await processWorkflows({
      type: eventType,
      data: data || {},
    });

    return NextResponse.json({
      data: {
        eventType,
        workflowsExecuted: executedCount,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to process workflows",
      },
      { status: 500 }
    );
  }
}
