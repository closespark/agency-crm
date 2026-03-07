// POST /api/site/newsletter — public newsletter subscribe endpoint.
// Origin-validated (no API key), like the chat endpoint.
// Called from the Nexus Ops website.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const ALLOWED_ORIGINS = (process.env.ALLOWED_SITE_ORIGINS || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  return ALLOWED_ORIGINS.some((allowed) => origin === allowed || origin.endsWith(`.${new URL(allowed).hostname}`));
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!isAllowedOrigin(origin)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const email = body.email?.trim()?.toLowerCase();

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }

  // Deduplicate
  const existing = await prisma.newsletterSubscriber.findUnique({
    where: { email },
  });

  if (existing) {
    if (!existing.isActive) {
      await prisma.newsletterSubscriber.update({
        where: { id: existing.id },
        data: { isActive: true, unsubscribedAt: null },
      });
    }
    const res = NextResponse.json({ ok: true, status: "subscribed" });
    res.headers.set("Access-Control-Allow-Origin", origin!);
    return res;
  }

  // Link to existing CRM contact if email matches
  const contact = await prisma.contact.findUnique({
    where: { email },
    select: { id: true },
  });

  await prisma.newsletterSubscriber.create({
    data: {
      email,
      contactId: contact?.id,
    },
  });

  // If contact exists, log activity and mark score dirty
  if (contact) {
    const adminUser = await prisma.user.findFirst({ where: { role: "admin" } });
    if (adminUser) {
      await prisma.activity.create({
        data: {
          type: "note",
          subject: "Newsletter subscription",
          body: `Subscribed to newsletter from website`,
          userId: adminUser.id,
          contactId: contact.id,
        },
      });
    }
    await prisma.contact.update({
      where: { id: contact.id },
      data: { scoreDirty: true },
    });
  }

  const res = NextResponse.json({ ok: true, status: "subscribed" });
  res.headers.set("Access-Control-Allow-Origin", origin!);
  return res;
}

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!isAllowedOrigin(origin)) {
    return new NextResponse(null, { status: 403 });
  }
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin!,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
