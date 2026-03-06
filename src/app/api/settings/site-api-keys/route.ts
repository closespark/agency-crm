import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

// GET — list all site API keys (prefix only, never the full key)
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const keys = await prisma.siteApiKey.findMany({
    select: {
      id: true,
      name: true,
      keyPrefix: true,
      isActive: true,
      lastUsedAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(keys);
}

// POST — create a new site API key
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { name } = await request.json();

  if (!name || typeof name !== "string") {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  // Generate a random API key: sk_live_ + 32 random hex chars
  const rawKey = `sk_live_${crypto.randomBytes(32).toString("hex")}`;
  const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");
  const keyPrefix = rawKey.substring(0, 16) + "...";

  const record = await prisma.siteApiKey.create({
    data: {
      name,
      keyHash,
      keyPrefix,
      isActive: true,
    },
  });

  // Return the full key ONCE — it cannot be retrieved again
  return NextResponse.json({
    id: record.id,
    name: record.name,
    key: rawKey,
    keyPrefix,
    warning: "Save this key now. It cannot be retrieved again.",
  });
}

// PATCH — deactivate a key
export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, isActive } = await request.json();

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const updated = await prisma.siteApiKey.update({
    where: { id },
    data: { isActive: isActive ?? false },
    select: { id: true, name: true, keyPrefix: true, isActive: true },
  });

  return NextResponse.json(updated);
}

// DELETE — permanently remove a key
export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  await prisma.siteApiKey.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
