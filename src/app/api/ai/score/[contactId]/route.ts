import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { scoreContact } from "@/lib/ai/lead-scorer";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ contactId: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { contactId } = await params;

  try {
    const result = await scoreContact(contactId);
    return NextResponse.json({ data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to score contact";
    const status = message === "Contact not found" ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
