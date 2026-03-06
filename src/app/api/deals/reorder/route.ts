import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DEAL_STAGES, type DealStage } from "@/types";

export async function PATCH(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { dealId, stage, position } = body as {
      dealId: string;
      stage: DealStage;
      position: number;
    };

    if (!dealId || !stage || position == null) {
      return NextResponse.json(
        { error: "dealId, stage, and position are required" },
        { status: 400 }
      );
    }

    if (!DEAL_STAGES.includes(stage)) {
      return NextResponse.json(
        { error: "Invalid deal stage" },
        { status: 400 }
      );
    }

    // Get the current deal to know its previous stage
    const deal = await prisma.deal.findUnique({
      where: { id: dealId },
      select: { id: true, stage: true, position: true, pipeline: true },
    });

    if (!deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    const previousStage = deal.stage;
    const previousPosition = deal.position;
    const pipeline = deal.pipeline;

    // Use a transaction for consistency
    await prisma.$transaction(async (tx) => {
      if (previousStage === stage) {
        // Same stage: reorder within the column
        if (position > previousPosition) {
          // Moving down: shift deals between old and new position up
          await tx.deal.updateMany({
            where: {
              pipeline,
              stage,
              id: { not: dealId },
              position: { gt: previousPosition, lte: position },
            },
            data: { position: { decrement: 1 } },
          });
        } else if (position < previousPosition) {
          // Moving up: shift deals between new and old position down
          await tx.deal.updateMany({
            where: {
              pipeline,
              stage,
              id: { not: dealId },
              position: { gte: position, lt: previousPosition },
            },
            data: { position: { increment: 1 } },
          });
        }
      } else {
        // Different stage: remove from old, insert into new

        // Close the gap in the old stage
        await tx.deal.updateMany({
          where: {
            pipeline,
            stage: previousStage,
            id: { not: dealId },
            position: { gt: previousPosition },
          },
          data: { position: { decrement: 1 } },
        });

        // Make room in the new stage
        await tx.deal.updateMany({
          where: {
            pipeline,
            stage,
            position: { gte: position },
          },
          data: { position: { increment: 1 } },
        });
      }

      // Update the deal itself
      await tx.deal.update({
        where: { id: dealId },
        data: { stage, position },
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Reorder error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
