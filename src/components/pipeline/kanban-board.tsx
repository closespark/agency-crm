"use client";

import { useCallback, useState } from "react";
import {
  DragDropContext,
  type DropResult,
  type OnDragEndResponder,
} from "@hello-pangea/dnd";
import { DEAL_STAGES, type DealStage } from "@/types";
import { KanbanColumn } from "./kanban-column";

export interface DealWithRelations {
  id: string;
  name: string;
  amount: number | null;
  currency: string;
  stage: string;
  pipeline: string;
  probability: number | null;
  closeDate: string | Date | null;
  position: number;
  ownerId: string | null;
  contactId: string | null;
  companyId: string | null;
  contact: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
  owner: {
    id: string;
    name: string | null;
    email: string;
  } | null;
  company: {
    id: string;
    name: string;
  } | null;
}

interface KanbanBoardProps {
  initialDeals: DealWithRelations[];
  onCardClick?: (dealId: string) => void;
}

type DealsByStage = Record<string, DealWithRelations[]>;

function groupDealsByStage(deals: DealWithRelations[]): DealsByStage {
  const grouped: DealsByStage = {};
  for (const stage of DEAL_STAGES) {
    grouped[stage] = [];
  }
  for (const deal of deals) {
    if (grouped[deal.stage]) {
      grouped[deal.stage].push(deal);
    } else {
      grouped[deal.stage] = [deal];
    }
  }
  // Sort each stage by position
  for (const stage of Object.keys(grouped)) {
    grouped[stage].sort((a, b) => a.position - b.position);
  }
  return grouped;
}

export function KanbanBoard({ initialDeals, onCardClick }: KanbanBoardProps) {
  const [dealsByStage, setDealsByStage] = useState<DealsByStage>(() =>
    groupDealsByStage(initialDeals)
  );

  const handleDragEnd: OnDragEndResponder = useCallback(
    async (result: DropResult) => {
      const { source, destination, draggableId } = result;

      // Dropped outside a droppable
      if (!destination) return;

      // Dropped in the same position
      if (
        source.droppableId === destination.droppableId &&
        source.index === destination.index
      ) {
        return;
      }

      const sourceStage = source.droppableId;
      const destStage = destination.droppableId;

      setDealsByStage((prev) => {
        const next = { ...prev };

        // Clone arrays for the affected stages
        const sourceDeals = [...(next[sourceStage] || [])];
        const destDeals =
          sourceStage === destStage
            ? sourceDeals
            : [...(next[destStage] || [])];

        // Remove the deal from the source
        const [movedDeal] = sourceDeals.splice(source.index, 1);
        if (!movedDeal) return prev;

        // Update the deal's stage
        const updatedDeal = { ...movedDeal, stage: destStage };

        // Insert at the destination index
        destDeals.splice(destination.index, 0, updatedDeal);

        // Update positions for affected stages
        const reindex = (deals: DealWithRelations[]) =>
          deals.map((d, i) => ({ ...d, position: i }));

        next[sourceStage] = reindex(sourceDeals);
        if (sourceStage !== destStage) {
          next[destStage] = reindex(destDeals);
        }

        return next;
      });

      // Persist to API
      try {
        await fetch("/api/deals/reorder", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dealId: draggableId,
            stage: destStage as DealStage,
            position: destination.index,
          }),
        });
      } catch (error) {
        // On failure, revert to original state
        console.error("Failed to update deal position:", error);
        setDealsByStage(groupDealsByStage(initialDeals));
      }
    },
    [initialDeals]
  );

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {DEAL_STAGES.map((stage) => (
          <KanbanColumn
            key={stage}
            stage={stage}
            deals={dealsByStage[stage] || []}
            onCardClick={onCardClick}
          />
        ))}
      </div>
    </DragDropContext>
  );
}
