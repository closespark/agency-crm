// GET /api/integrations/google-calendar/callback — OAuth2 callback for Google Calendar.
// Exchanges the authorization code for tokens and stores them in the Integration config.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");

  if (error || !code) {
    return NextResponse.redirect(new URL("/integrations?error=google_calendar_denied", request.url));
  }

  // Get the existing integration config (has client_id and client_secret)
  const integration = await prisma.integration.findFirst({
    where: { name: "google_calendar" },
  });

  if (!integration) {
    return NextResponse.redirect(new URL("/integrations?error=google_calendar_not_found", request.url));
  }

  let config: Record<string, string>;
  try {
    config = JSON.parse(integration.config);
  } catch {
    return NextResponse.redirect(new URL("/integrations?error=google_calendar_bad_config", request.url));
  }

  if (!config.client_id || !config.client_secret) {
    return NextResponse.redirect(new URL("/integrations?error=google_calendar_missing_credentials", request.url));
  }

  // Exchange code for tokens
  const redirectUri = new URL("/api/integrations/google-calendar/callback", request.url).toString();

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.client_id,
      client_secret: config.client_secret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    console.error("[gcal-oauth] Token exchange failed:", await tokenRes.text());
    return NextResponse.redirect(new URL("/integrations?error=google_calendar_token_failed", request.url));
  }

  const tokens = await tokenRes.json();

  // Save tokens to integration config
  const updatedConfig = {
    ...config,
    refresh_token: tokens.refresh_token || config.refresh_token,
    access_token: tokens.access_token,
    token_expiry: Date.now() + (tokens.expires_in * 1000),
  };

  await prisma.integration.update({
    where: { id: integration.id },
    data: {
      config: JSON.stringify(updatedConfig),
      isActive: true,
      lastSyncAt: new Date(),
    },
  });

  return NextResponse.redirect(new URL("/integrations?success=google_calendar", request.url));
}
