import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { contactListSchema } from "@/lib/validations";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const list = await prisma.contactList.findUnique({
    where: { id },
    include: {
      _count: {
        select: { memberships: true },
      },
    },
  });

  if (!list) {
    return NextResponse.json({ error: "List not found" }, { status: 404 });
  }

  return NextResponse.json({ data: list });
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
  const parsed = contactListSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const existing = await prisma.contactList.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "List not found" }, { status: 404 });
  }

  const data = parsed.data;

  const list = await prisma.contactList.update({
    where: { id },
    data: {
      name: data.name,
      type: data.type,
      filters: data.filters || null,
    },
  });

  return NextResponse.json({ data: list });
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

  const existing = await prisma.contactList.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "List not found" }, { status: 404 });
  }

  await prisma.contactList.delete({ where: { id } });

  return NextResponse.json({ data: { success: true } });
}
