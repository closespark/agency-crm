import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { activitySchema } from "@/lib/validations";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const activity = await prisma.activity.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, email: true, image: true } },
      contact: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
      deal: { select: { id: true, name: true } },
    },
  });

  if (!activity) {
    return NextResponse.json({ error: "Activity not found" }, { status: 404 });
  }

  return NextResponse.json({ data: activity });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const parsed = activitySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const existing = await prisma.activity.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Activity not found" }, { status: 404 });
  }

  const data = parsed.data;

  const activity = await prisma.activity.update({
    where: { id },
    data: {
      type: data.type,
      subject: data.subject || null,
      body: data.body || null,
      contactId: data.contactId || null,
      dealId: data.dealId || null,
      duration: data.duration || null,
      outcome: data.outcome || null,
    },
    include: {
      user: { select: { id: true, name: true, image: true } },
      contact: { select: { id: true, firstName: true, lastName: true } },
      deal: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({ data: activity });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const existing = await prisma.activity.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Activity not found" }, { status: 404 });
  }

  await prisma.activity.delete({ where: { id } });

  return NextResponse.json({ data: { success: true } });
}
