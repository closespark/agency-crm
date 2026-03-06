import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET all stage gates with current thresholds
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const gates = await prisma.stageGate.findMany({
    orderBy: [{ objectType: "asc" }, { fromStage: "asc" }],
  });

  // Parse JSON fields for readability
  const data = gates.map((gate) => ({
    ...gate,
    requiredFields: gate.requiredFields ? JSON.parse(gate.requiredFields) : [],
    conditions: gate.conditions ? JSON.parse(gate.conditions) : null,
  }));

  return NextResponse.json({ data });
}

// PATCH — update a specific stage gate's threshold or settings
export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { objectType, fromStage, toStage, confidenceThreshold, autoAdvance, isActive } = body;

  if (!objectType || !fromStage || !toStage) {
    return NextResponse.json(
      { error: "objectType, fromStage, and toStage are required" },
      { status: 400 }
    );
  }

  // Validate confidence threshold range
  if (confidenceThreshold !== undefined && (confidenceThreshold < 0 || confidenceThreshold > 1)) {
    return NextResponse.json(
      { error: "confidenceThreshold must be between 0 and 1" },
      { status: 400 }
    );
  }

  const existing = await prisma.stageGate.findUnique({
    where: { objectType_fromStage_toStage: { objectType, fromStage, toStage } },
  });

  if (!existing) {
    return NextResponse.json({ error: "Stage gate not found" }, { status: 404 });
  }

  const updateData: Record<string, unknown> = {};
  if (confidenceThreshold !== undefined) updateData.confidenceThreshold = confidenceThreshold;
  if (autoAdvance !== undefined) updateData.autoAdvance = autoAdvance;
  if (isActive !== undefined) updateData.isActive = isActive;

  const gate = await prisma.stageGate.update({
    where: { id: existing.id },
    data: updateData,
  });

  // Log the configuration change
  await prisma.auditLog.create({
    data: {
      action: "stage_gate_updated",
      resource: "StageGate",
      resourceId: gate.id,
      userId: session.user.id,
      details: JSON.stringify({
        objectType,
        fromStage,
        toStage,
        changes: updateData,
        previousValues: {
          confidenceThreshold: existing.confidenceThreshold,
          autoAdvance: existing.autoAdvance,
          isActive: existing.isActive,
        },
      }),
    },
  });

  return NextResponse.json({
    data: {
      ...gate,
      requiredFields: gate.requiredFields ? JSON.parse(gate.requiredFields) : [],
    },
  });
}
