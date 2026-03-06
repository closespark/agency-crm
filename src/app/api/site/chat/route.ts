// POST /api/site/chat — public chat endpoint for the website chat widget.
// Origin-validated (no API key needed). Handles real-time conversation with AI.

import { NextRequest, NextResponse } from "next/server";
import { handleChatMessage } from "@/lib/ai/chat-agent";

const ALLOWED_ORIGINS = (process.env.ALLOWED_SITE_ORIGINS || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

function corsHeaders(origin: string) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin") || "";
  if (!ALLOWED_ORIGINS.includes(origin)) {
    return new NextResponse(null, { status: 403 });
  }
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

interface ChatRequestBody {
  message: string;
  conversationId?: string;
  visitorId: string;
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin") || "";
  if (ALLOWED_ORIGINS.length > 0 && !ALLOWED_ORIGINS.includes(origin)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: ChatRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.message || !body.visitorId) {
    return NextResponse.json(
      { error: "message and visitorId are required" },
      { status: 400 }
    );
  }

  try {
    const result = await handleChatMessage({
      message: body.message,
      conversationId: body.conversationId,
      visitorId: body.visitorId,
    });

    return NextResponse.json(result, {
      status: 200,
      headers: corsHeaders(origin),
    });
  } catch (err) {
    console.error("[site-chat] Error:", err);
    return NextResponse.json(
      { error: "Chat unavailable" },
      { status: 500, headers: corsHeaders(origin) }
    );
  }
}
