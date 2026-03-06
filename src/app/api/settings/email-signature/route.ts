// GET/PUT /api/settings/email-signature — load and save email signature config.
// Stored in the Integration table with name "email_signature".

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { invalidateSignatureCache } from "@/lib/integrations/gmail";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const integration = await prisma.integration.findFirst({
    where: { name: "email_signature" },
  });

  if (!integration?.config) {
    // Return env var defaults so the form pre-fills
    return NextResponse.json({
      config: {
        name: process.env.EMAIL_SIGNATURE_NAME || "",
        title: process.env.EMAIL_SIGNATURE_TITLE || "",
        company: process.env.EMAIL_SIGNATURE_COMPANY || "",
        phone: process.env.EMAIL_SIGNATURE_PHONE || "",
        email: process.env.EMAIL_SIGNATURE_EMAIL || "",
        website: process.env.EMAIL_SIGNATURE_WEBSITE || "",
        bookingUrl: process.env.EMAIL_SIGNATURE_BOOKING_URL || "",
        linkedIn: process.env.EMAIL_SIGNATURE_LINKEDIN || "",
        twitter: process.env.EMAIL_SIGNATURE_TWITTER || "",
        logoUrl: process.env.EMAIL_SIGNATURE_LOGO_URL || "",
      },
    });
  }

  return NextResponse.json({ config: JSON.parse(integration.config) });
}

export async function PUT(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Only admins can change the signature
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });
  if (user?.role !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const body = await request.json();

  if (!body.name || !body.title || !body.company) {
    return NextResponse.json(
      { error: "Name, title, and company are required" },
      { status: 400 }
    );
  }

  const configJson = JSON.stringify({
    name: body.name,
    title: body.title,
    company: body.company,
    phone: body.phone || "",
    email: body.email || "",
    website: body.website || "",
    bookingUrl: body.bookingUrl || "",
    linkedIn: body.linkedIn || "",
    twitter: body.twitter || "",
    logoUrl: body.logoUrl || "",
  });

  // Upsert the integration record
  const existing = await prisma.integration.findFirst({
    where: { name: "email_signature" },
  });

  if (existing) {
    await prisma.integration.update({
      where: { id: existing.id },
      data: { config: configJson, isActive: true },
    });
  } else {
    await prisma.integration.create({
      data: {
        name: "email_signature",
        type: "config",
        config: configJson,
        isActive: true,
      },
    });
  }

  // Clear cached signature so the next email picks up the new config
  invalidateSignatureCache();

  return NextResponse.json({ ok: true });
}
