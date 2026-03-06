import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ticketSchema } from "@/lib/validations";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = req.nextUrl.searchParams;
  const page = Math.max(1, parseInt(url.get("page") || "1"));
  const pageSize = Math.min(100, Math.max(1, parseInt(url.get("pageSize") || "20")));
  const search = url.get("search") || "";
  const status = url.get("status") || "";
  const priority = url.get("priority") || "";
  const assigneeId = url.get("assigneeId") || "";
  const category = url.get("category") || "";
  const sortBy = url.get("sortBy") || "createdAt";
  const sortDir = url.get("sortDir") === "asc" ? "asc" : "desc";

  const where: Record<string, unknown> = {};

  if (search) {
    where.OR = [
      { subject: { contains: search } },
      { description: { contains: search } },
    ];
  }
  if (status) where.status = status;
  if (priority) where.priority = priority;
  if (assigneeId) where.assigneeId = assigneeId;
  if (category) where.category = category;

  const [tickets, total] = await Promise.all([
    prisma.ticket.findMany({
      where,
      include: {
        contact: { select: { id: true, firstName: true, lastName: true, email: true } },
        company: { select: { id: true, name: true } },
      },
      orderBy: { [sortBy]: sortDir },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.ticket.count({ where }),
  ]);

  return NextResponse.json({
    data: tickets,
    meta: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = ticketSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const data = parsed.data;

  const ticket = await prisma.ticket.create({
    data: {
      subject: data.subject,
      description: data.description || null,
      status: data.status,
      priority: data.priority,
      category: data.category || null,
      pipeline: data.pipeline,
      contactId: data.contactId || null,
      companyId: data.companyId || null,
      assigneeId: data.assigneeId || null,
    },
    include: {
      contact: { select: { id: true, firstName: true, lastName: true, email: true } },
      company: { select: { id: true, name: true } },
    },
  });

  // Event-triggered ticket intelligence: classify immediately on creation
  if (ticket.contactId) {
    import("@/lib/ai/ticket-intelligence").then(({ classifyTicket }) => {
      classifyTicket(ticket.id).catch(() => {});
    });
  }

  return NextResponse.json({ data: ticket }, { status: 201 });
}
