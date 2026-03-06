"use client";

import { SearchResultItem } from "./search-result-item";
import type { SearchResponse } from "@/app/api/search/route";

interface SearchResultsProps {
  results: SearchResponse;
  activeType?: string;
}

const typeLabels: Record<string, string> = {
  contacts: "Contacts",
  companies: "Companies",
  deals: "Deals",
  tickets: "Tickets",
};

export function SearchResults({ results, activeType }: SearchResultsProps) {
  const groups = (
    activeType && activeType !== "all"
      ? [activeType as keyof SearchResponse]
      : (Object.keys(typeLabels) as (keyof SearchResponse)[])
  ).filter((key) => results[key]?.length > 0);

  if (groups.length === 0) {
    return null;
  }

  return (
    <div className="space-y-6">
      {groups.map((key) => (
        <div key={key}>
          <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            {typeLabels[key]} ({results[key].length})
          </h3>
          <div className="space-y-0.5">
            {results[key].map((result) => (
              <SearchResultItem key={result.id} result={result} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
