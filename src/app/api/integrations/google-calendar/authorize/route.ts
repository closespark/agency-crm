// GET /api/integrations/google-calendar/authorize — Starts Google Calendar OAuth flow.
// Redirects the user to Google's consent screen.

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const integration = await prisma.integration.findFirst({
    where: { name: "google_calendar" },
  });

  if (!integration) {
    return NextResponse.json({ error: "Google Calendar integration not found. Create it first." }, { status: 404 });
  }

  let config: Record<string, string>;
  try {
    config = JSON.parse(integration.config);
  } catch {
    return NextResponse.json({ error: "Invalid integration config" }, { status: 400 });
  }

  if (!config.client_id || !config.client_secret) {
    return NextResponse.json({ error: "Client ID and Client Secret must be configured first" }, { status: 400 });
  }

  const redirectUri = new URL("/api/integrations/google-calendar/callback", request.url).toString();

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", config.client_id);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "https://www.googleapis.com/auth/calendar");
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");

  return NextResponse.redirect(authUrl.toString());
}
