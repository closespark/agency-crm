import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ integrationId: string }> }
) {
  const { integrationId } = await params;

  const integration = await prisma.integration.findUnique({
    where: { id: integrationId },
  });

  if (!integration) {
    return NextResponse.json(
      { error: "Integration not found" },
      { status: 404 }
    );
  }

  if (!integration.isActive) {
    return NextResponse.json(
      { error: "Integration is not active" },
      { status: 403 }
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    payload = { raw: await request.text() };
  }

  const eventType =
    request.headers.get("x-event-type") ||
    request.headers.get("x-webhook-event") ||
    (typeof payload === "object" && payload !== null && "event" in payload
      ? String((payload as Record<string, unknown>).event)
      : "unknown");

  const webhookEvent = await prisma.webhookEvent.create({
    data: {
      integrationId,
      eventType,
      payload: JSON.stringify(payload),
      status: "pending",
    },
  });

  await prisma.integration.update({
    where: { id: integrationId },
    data: { lastSyncAt: new Date() },
  });

  return NextResponse.json(
    { received: true, eventId: webhookEvent.id },
    { status: 200 }
  );
}
