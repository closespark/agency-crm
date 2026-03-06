// Site proxy — forwards requests from the website to /api/inbound/* endpoints.
// The website never sees the API key. Authentication is by allowed origin.
// The actual API key is stored in SITE_PROXY_API_KEY env var on Railway.

import { NextRequest, NextResponse } from "next/server";

const ALLOWED_ORIGINS = (process.env.ALLOWED_SITE_ORIGINS || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const VALID_PATHS = ["lead", "booking", "pageview", "chat"];

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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const origin = request.headers.get("origin") || "";
  if (ALLOWED_ORIGINS.length > 0 && !ALLOWED_ORIGINS.includes(origin)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { path } = await params;
  const endpoint = path?.[0];
  if (!endpoint || !VALID_PATHS.includes(endpoint)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Get the internal API key stored server-side
  const apiKey = process.env.SITE_PROXY_API_KEY;
  if (!apiKey) {
    console.error("[site-proxy] SITE_PROXY_API_KEY not configured");
    return NextResponse.json({ error: "Proxy not configured" }, { status: 500 });
  }

  // Forward the request to the internal inbound endpoint
  const internalUrl = new URL(`/api/inbound/${endpoint}`, request.url);
  const body = await request.text();

  const internalResponse = await fetch(internalUrl.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body,
  });

  const responseBody = await internalResponse.text();
  const headers = corsHeaders(origin);

  return new NextResponse(responseBody, {
    status: internalResponse.status,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  });
}
