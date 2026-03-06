"use client";

import { Droppable } from "@hello-pangea/dnd";
import { cn, formatCurrency } from "@/lib/utils";
import { DealCard } from "./deal-card";
import type { DealWithRelations } from "./kanban-board";

const STAGE_LABELS: Record<string, string> = {
  discovery: "Discovery",
  proposal_sent: "Proposal Sent",
  negotiation: "Negotiation",
  contract_sent: "Contract Sent",
  closed_won: "Closed Won",
  closed_lost: "Closed Lost",
};

const STAGE_COLORS: Record<string, string> = {
  discovery: "bg-blue-400",
  proposal_sent: "bg-amber-500",
  negotiation: "bg-orange-500",
  contract_sent: "bg-purple-500",
  closed_won: "bg-green-500",
  closed_lost: "bg-red-500",
};

interface KanbanColumnProps {
  stage: string;
  deals: DealWithRelations[];
  onCardClick?: (dealId: string) => void;
}

export function KanbanColumn({ stage, deals, onCardClick }: KanbanColumnProps) {
  const totalAmount = deals.reduce((sum, d) => sum + (d.amount ?? 0), 0);

  return (
    <div className="flex w-72 shrink-0 flex-col rounded-lg bg-zinc-50 dark:bg-zinc-800/50">
      {/* Column header */}
      <div className="flex items-center gap-2 px-3 py-3">
        <div className={cn("h-2.5 w-2.5 rounded-full", STAGE_COLORS[stage] ?? "bg-zinc-400")} />
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">
          {STAGE_LABELS[stage] ?? stage}
        </h3>
        <span className="ml-auto rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
          {deals.length}
        </span>
      </div>

      {/* Total amount */}
      <div className="border-b border-zinc-200 px-3 pb-2 dark:border-zinc-700">
        <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
          {formatCurrency(totalAmount)}
        </p>
      </div>

      {/* Droppable area */}
      <Droppable droppableId={stage}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={cn(
              "flex-1 overflow-y-auto p-2 transition-colors",
              "min-h-[120px]",
              snapshot.isDraggingOver && "bg-blue-50 dark:bg-blue-900/20"
            )}
          >
            {deals.map((deal, index) => (
              <DealCard
                key={deal.id}
                deal={deal}
                index={index}
                onClick={onCardClick}
              />
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  );
}
