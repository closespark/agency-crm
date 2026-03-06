"use client";

import { Draggable } from "@hello-pangea/dnd";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { DealWithRelations } from "./kanban-board";

interface DealCardProps {
  deal: DealWithRelations;
  index: number;
  onClick?: (dealId: string) => void;
}

function getProbabilityColor(probability: number | null | undefined) {
  if (probability == null) return "secondary";
  if (probability >= 75) return "success" as const;
  if (probability >= 50) return "default" as const;
  if (probability >= 25) return "warning" as const;
  return "danger" as const;
}

export function DealCard({ deal, index, onClick }: DealCardProps) {
  const contactName = deal.contact
    ? `${deal.contact.firstName} ${deal.contact.lastName}`
    : null;

  return (
    <Draggable draggableId={deal.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className={cn(
            "mb-2 rounded-lg border border-zinc-200 bg-white p-3 shadow-sm transition-shadow hover:shadow-md dark:border-zinc-700 dark:bg-zinc-900",
            snapshot.isDragging && "rotate-2 shadow-lg ring-2 ring-blue-500"
          )}
          onClick={() => onClick?.(deal.id)}
        >
          <div className="mb-2 flex items-start justify-between gap-2">
            <h4 className="text-sm font-medium text-zinc-900 dark:text-zinc-100 line-clamp-2">
              {deal.name}
            </h4>
            {deal.probability != null && (
              <Badge variant={getProbabilityColor(deal.probability)} className="shrink-0">
                {deal.probability}%
              </Badge>
            )}
          </div>

          {deal.amount != null && (
            <p className="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              {formatCurrency(deal.amount, deal.currency)}
            </p>
          )}

          <div className="flex items-center justify-between gap-2">
            {contactName && (
              <span className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                {contactName}
              </span>
            )}
            {deal.closeDate && (
              <span className="shrink-0 text-xs text-zinc-400 dark:text-zinc-500">
                {formatDate(deal.closeDate)}
              </span>
            )}
          </div>

          {deal.owner && (
            <div className="mt-2 flex items-center gap-1.5">
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 text-[10px] font-medium text-blue-700 dark:bg-blue-900 dark:text-blue-200">
                {deal.owner.name
                  ? deal.owner.name
                      .split(" ")
                      .map((n) => n[0])
                      .join("")
                      .toUpperCase()
                      .slice(0, 2)
                  : "?"}
              </div>
              <span className="truncate text-xs text-zinc-400 dark:text-zinc-500">
                {deal.owner.name || deal.owner.email}
              </span>
            </div>
          )}
        </div>
      )}
    </Draggable>
  );
}
