import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Import dynamically to avoid bundling auto-seed in the API server
  const { seedWorkflowsIncremental } = await import("@/lib/ai/auto-seed");
  const created = await seedWorkflowsIncremental();

  return NextResponse.json({
    data: { created },
    message: created > 0
      ? `Created ${created} missing workflows`
      : "All workflows already exist",
  });
}
