"use client";

import Link from "next/link";
import { User, Building2, Handshake, Ticket } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SearchResult } from "@/app/api/search/route";

const typeConfig = {
  contact: {
    icon: User,
    color: "text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-950",
  },
  company: {
    icon: Building2,
    color: "text-purple-600 bg-purple-50 dark:text-purple-400 dark:bg-purple-950",
  },
  deal: {
    icon: Handshake,
    color: "text-green-600 bg-green-50 dark:text-green-400 dark:bg-green-950",
  },
  ticket: {
    icon: Ticket,
    color: "text-orange-600 bg-orange-50 dark:text-orange-400 dark:bg-orange-950",
  },
} as const;

interface SearchResultItemProps {
  result: SearchResult;
  isActive?: boolean;
  onClick?: () => void;
}

export function SearchResultItem({ result, isActive, onClick }: SearchResultItemProps) {
  const config = typeConfig[result.type];
  const Icon = config.icon;

  return (
    <Link
      href={result.url}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800",
        isActive && "bg-zinc-100 dark:bg-zinc-800"
      )}
    >
      <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-md", config.color)}>
        <Icon size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-zinc-900 dark:text-zinc-100">
          {result.title}
        </p>
        {result.subtitle && (
          <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
            {result.subtitle}
          </p>
        )}
      </div>
      <span className="shrink-0 text-xs capitalize text-zinc-400">
        {result.type}
      </span>
    </Link>
  );
}
