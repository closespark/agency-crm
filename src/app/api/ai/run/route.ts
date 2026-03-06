import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getAutopilotStats,
  generateDailyInsights,
  processSequenceQueue,
} from "@/lib/ai/autopilot";
import { batchScoreContacts } from "@/lib/ai/lead-scorer";
import { scanDealsForInsights } from "@/lib/ai/deal-advisor";

const validActions = [
  "score_contacts",
  "scan_deals",
  "process_sequences",
  "generate_insights",
] as const;

type AIAction = (typeof validActions)[number];

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const action = body.action as AIAction;

  if (!validActions.includes(action)) {
    return NextResponse.json(
      { error: "Invalid action. Must be one of: " + validActions.join(", ") },
      { status: 400 }
    );
  }

  let result: unknown;

  switch (action) {
    case "score_contacts": {
      const scoreResult = await batchScoreContacts();
      result = { scored: scoreResult.scored, message: `Scored ${scoreResult.scored} contacts` };
      break;
    }
    case "scan_deals": {
      const insightsCount = await scanDealsForInsights();
      result = { insights: insightsCount, message: `Generated ${insightsCount} deal insights` };
      break;
    }
    case "process_sequences": {
      const processed = await processSequenceQueue();
      result = { processed, message: `Processed ${processed} sequence steps` };
      break;
    }
    case "generate_insights": {
      const count = await generateDailyInsights();
      result = { insights: count, message: `Generated ${count} insights` };
      break;
    }
  }

  const stats = await getAutopilotStats();

  return NextResponse.json({ data: { result, stats } });
}
