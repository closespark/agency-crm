import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { contactSchema } from "@/lib/validations";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const contact = await prisma.contact.findUnique({
    where: { id },
    include: {
      company: true,
      owner: { select: { id: true, name: true, email: true, image: true } },
      deals: {
        include: {
          owner: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
      },
      activities: {
        include: {
          user: { select: { id: true, name: true, image: true } },
        },
        orderBy: { createdAt: "desc" },
      },
      tasks: {
        include: {
          user: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
      },
      tickets: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  return NextResponse.json({ data: contact });
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
  const parsed = contactSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const existing = await prisma.contact.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  const data = parsed.data;

  // Handle lifecycle stage change through forward-only engine if stage is advancing
  if (data.lifecycleStage && data.lifecycleStage !== existing.lifecycleStage) {
    const { advanceContactStage } = await import("@/lib/ai/lifecycle-engine");
    const result = await advanceContactStage(id, data.lifecycleStage as any, "manual", "Manual stage update via API");
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
  }

  const contact = await prisma.contact.update({
    where: { id },
    data: {
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email || null,
      phone: data.phone || null,
      jobTitle: data.jobTitle || null,
      // lifecycleStage handled above through lifecycle engine
      leadStatus: data.leadStatus || null,
      ownerId: data.ownerId || undefined,
      companyId: data.companyId || null,
      source: data.source || null,
    },
    include: {
      company: { select: { id: true, name: true } },
      owner: { select: { id: true, name: true, image: true } },
    },
  });

  return NextResponse.json({ data: contact });
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

  const existing = await prisma.contact.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  await prisma.contact.delete({ where: { id } });

  return NextResponse.json({ data: { success: true } });
}
