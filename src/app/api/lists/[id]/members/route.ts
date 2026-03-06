import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const searchParams = request.nextUrl.searchParams;
  const page = parseInt(searchParams.get("page") || "1");
  const pageSize = parseInt(searchParams.get("pageSize") || "25");

  const list = await prisma.contactList.findUnique({ where: { id } });
  if (!list) {
    return NextResponse.json({ error: "List not found" }, { status: 404 });
  }

  const where = { listId: id };

  const [data, total] = await Promise.all([
    prisma.listMembership.findMany({
      where,
      include: {
        contact: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            lifecycleStage: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.listMembership.count({ where }),
  ]);

  return NextResponse.json({
    data,
    meta: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const list = await prisma.contactList.findUnique({ where: { id } });
  if (!list) {
    return NextResponse.json({ error: "List not found" }, { status: 404 });
  }

  const body = await request.json();

  if (!body.contactId) {
    return NextResponse.json(
      { error: "contactId is required" },
      { status: 400 }
    );
  }

  const contact = await prisma.contact.findUnique({
    where: { id: body.contactId },
  });
  if (!contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  const existing = await prisma.listMembership.findUnique({
    where: {
      listId_contactId: { listId: id, contactId: body.contactId },
    },
  });

  if (existing) {
    return NextResponse.json(
      { error: "Contact is already a member of this list" },
      { status: 409 }
    );
  }

  const membership = await prisma.listMembership.create({
    data: {
      listId: id,
      contactId: body.contactId,
    },
    include: {
      contact: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          lifecycleStage: true,
        },
      },
    },
  });

  return NextResponse.json({ data: membership }, { status: 201 });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();

  if (!body.contactId) {
    return NextResponse.json(
      { error: "contactId is required" },
      { status: 400 }
    );
  }

  const membership = await prisma.listMembership.findUnique({
    where: {
      listId_contactId: { listId: id, contactId: body.contactId },
    },
  });

  if (!membership) {
    return NextResponse.json(
      { error: "Membership not found" },
      { status: 404 }
    );
  }

  await prisma.listMembership.delete({
    where: { id: membership.id },
  });

  return NextResponse.json({ data: { success: true } });
}
