// Pre-deploy QA endpoint — called by Railway CI hook before deployment.
// Returns 200 if deploy should proceed, 422 if deployment should be blocked.

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { runPreDeployQA } from "@/lib/qa/orchestrator";

export async function POST(request: NextRequest) {
  // Verify this is an authorized CI call
  const authHeader = request.headers.get("authorization");
  const expectedToken = process.env.QA_WEBHOOK_SECRET;
  if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let commitDiff: string | undefined;
  try {
    const body = await request.json();
    commitDiff = body.commitDiff;
  } catch {
    // No body — run without diff context
  }

  const result = await runPreDeployQA(commitDiff);

  return NextResponse.json(result, {
    status: result.deploy ? 200 : 422,
  });
}

// GET for manual checks from dashboard
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runPreDeployQA();
  return NextResponse.json(result, {
    status: result.deploy ? 200 : 422,
  });
}
