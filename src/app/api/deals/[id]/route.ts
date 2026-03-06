import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { dealSchema } from "@/lib/validations";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const deal = await prisma.deal.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, name: true, email: true, image: true } },
      contact: {
        select: { id: true, firstName: true, lastName: true, email: true, phone: true },
      },
      company: { select: { id: true, name: true, domain: true } },
      activities: {
        include: {
          user: { select: { id: true, name: true, image: true } },
        },
        orderBy: { createdAt: "desc" },
      },
      quotes: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!deal) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  return NextResponse.json({ data: deal });
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
  const parsed = dealSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const existing = await prisma.deal.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  const data = parsed.data;

  // Handle deal stage change through lifecycle engine if stage is changing
  if (data.stage && data.stage !== existing.stage) {
    const { advanceDealStage } = await import("@/lib/ai/lifecycle-engine");
    const result = await advanceDealStage(id, data.stage, "manual", "Manual stage update via API");
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
  }

  const deal = await prisma.deal.update({
    where: { id },
    data: {
      name: data.name,
      amount: data.amount || null,
      currency: data.currency,
      // stage handled above through lifecycle engine
      pipeline: data.pipeline,
      probability: data.probability || null,
      closeDate: data.closeDate ? new Date(data.closeDate) : null,
      ownerId: data.ownerId || undefined,
      contactId: data.contactId || null,
      companyId: data.companyId || null,
    },
    include: {
      owner: { select: { id: true, name: true, image: true } },
      contact: { select: { id: true, firstName: true, lastName: true } },
      company: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({ data: deal });
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

  const existing = await prisma.deal.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  await prisma.deal.delete({ where: { id } });

  return NextResponse.json({ data: { success: true } });
}
