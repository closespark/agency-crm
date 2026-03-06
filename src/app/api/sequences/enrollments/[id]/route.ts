import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const { action } = body as { action: "pause" | "resume" | "unenroll" };

  if (!action || !["pause", "resume", "unenroll"].includes(action)) {
    return NextResponse.json(
      { error: "Invalid action. Must be: pause, resume, or unenroll" },
      { status: 400 }
    );
  }

  const enrollment = await prisma.sequenceEnrollment.findUnique({
    where: { id },
  });

  if (!enrollment) {
    return NextResponse.json(
      { error: "Enrollment not found" },
      { status: 404 }
    );
  }

  let updateData: Record<string, unknown> = {};

  switch (action) {
    case "pause":
      if (enrollment.status !== "active") {
        return NextResponse.json(
          { error: "Only active enrollments can be paused" },
          { status: 400 }
        );
      }
      updateData = { status: "paused" };
      break;

    case "resume":
      if (enrollment.status !== "paused") {
        return NextResponse.json(
          { error: "Only paused enrollments can be resumed" },
          { status: 400 }
        );
      }
      updateData = { status: "active" };
      break;

    case "unenroll":
      if (enrollment.status === "completed") {
        return NextResponse.json(
          { error: "Cannot unenroll a completed enrollment" },
          { status: 400 }
        );
      }
      updateData = {
        status: "completed",
        completedAt: new Date(),
      };
      break;
  }

  const updated = await prisma.sequenceEnrollment.update({
    where: { id },
    data: updateData,
    include: {
      sequence: { select: { id: true, name: true } },
      contact: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
    },
  });

  return NextResponse.json({ data: updated });
}
