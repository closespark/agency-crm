import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { instantly } from "@/lib/integrations/instantly";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.INSTANTLY_API_KEY) {
    return NextResponse.json(
      {
        error:
          "Instantly integration not configured. Set INSTANTLY_API_KEY in your environment variables.",
      },
      { status: 503 }
    );
  }

  try {
    const result = await instantly.accounts.list();
    return NextResponse.json({ data: result.items });
  } catch (error) {
    console.error("Error fetching Instantly accounts:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
