import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formSchema } from "@/lib/validations";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const form = await prisma.form.findUnique({
    where: { id },
    include: {
      _count: {
        select: { submissions: true },
      },
    },
  });

  if (!form) {
    return NextResponse.json({ error: "Form not found" }, { status: 404 });
  }

  return NextResponse.json({ data: form });
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
  const parsed = formSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const existing = await prisma.form.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Form not found" }, { status: 404 });
  }

  const data = parsed.data;

  const form = await prisma.form.update({
    where: { id },
    data: {
      name: data.name,
      fields: data.fields,
      submitLabel: data.submitLabel,
      redirectUrl: data.redirectUrl || null,
      isActive: data.isActive,
    },
  });

  return NextResponse.json({ data: form });
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

  const existing = await prisma.form.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Form not found" }, { status: 404 });
  }

  await prisma.form.delete({ where: { id } });

  return NextResponse.json({ data: { success: true } });
}
