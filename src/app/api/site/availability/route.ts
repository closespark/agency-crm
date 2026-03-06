// GET /api/site/availability — returns available meeting slots from Google Calendar.
// Public endpoint (no API key needed) — used by the website booking form.
// CORS validated by origin.

import { NextRequest, NextResponse } from "next/server";
import { getAvailableSlots, isGoogleCalendarConfigured } from "@/lib/integrations/google-calendar";

const ALLOWED_ORIGINS = (process.env.ALLOWED_SITE_ORIGINS || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

function corsHeaders(origin: string) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin") || "";
  if (ALLOWED_ORIGINS.length > 0 && !ALLOWED_ORIGINS.includes(origin)) {
    return new NextResponse(null, { status: 403 });
  }
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin") || "";
  if (ALLOWED_ORIGINS.length > 0 && !ALLOWED_ORIGINS.includes(origin)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const headers = corsHeaders(origin);

  const configured = await isGoogleCalendarConfigured();
  if (!configured) {
    return NextResponse.json(
      { available: false, slots: [], message: "Calendar not configured" },
      { status: 200, headers }
    );
  }

  try {
    const slots = await getAvailableSlots({
      daysAhead: 14,
      slotDuration: 30,
    });

    return NextResponse.json(
      { available: true, slots },
      { status: 200, headers }
    );
  } catch (err) {
    console.error("[availability] Error fetching slots:", err);
    return NextResponse.json(
      { available: false, slots: [], message: "Error fetching availability" },
      { status: 200, headers }
    );
  }
}
