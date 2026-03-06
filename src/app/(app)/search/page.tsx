"use client";

import { useState, useEffect, useCallback } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Spinner, EmptyState } from "@/components/ui/loading";
import { SearchResults } from "@/components/search/search-results";
import { useDebounce } from "@/hooks/use-debounce";
import type { SearchResponse } from "@/app/api/search/route";

const TABS = [
  { key: "all", label: "All" },
  { key: "contacts", label: "Contacts" },
  { key: "companies", label: "Companies" },
  { key: "deals", label: "Deals" },
  { key: "tickets", label: "Tickets" },
] as const;

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const debouncedQuery = useDebounce(query, 300);

  const performSearch = useCallback(async (q: string, type: string) => {
    if (!q || q.length < 2) {
      setResults(null);
      return;
    }

    setIsLoading(true);
    try {
      const params = new URLSearchParams({ q, type });
      const res = await fetch(`/api/search?${params}`);
      if (res.ok) {
        const data: SearchResponse = await res.json();
        setResults(data);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    performSearch(debouncedQuery, activeTab);
  }, [debouncedQuery, activeTab, performSearch]);

  const totalResults = results
    ? results.contacts.length +
      results.companies.length +
      results.deals.length +
      results.tickets.length
    : 0;

  const hasSearched = debouncedQuery.length >= 2;

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-6 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
        Search
      </h1>

      <div className="relative mb-4">
        <Search
          size={18}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
        />
        <Input
          placeholder="Search contacts, companies, deals, tickets..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-10"
          autoFocus
        />
      </div>

      <div className="mb-6 flex gap-1 border-b border-zinc-200 dark:border-zinc-700">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "border-b-2 border-blue-600 text-blue-600"
                : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : hasSearched && totalResults === 0 ? (
        <EmptyState
          icon={<Search size={40} />}
          title="No results found"
          description={`No results matching "${debouncedQuery}". Try a different search term.`}
        />
      ) : results && totalResults > 0 ? (
        <SearchResults results={results} activeType={activeTab} />
      ) : (
        <EmptyState
          icon={<Search size={40} />}
          title="Search your CRM"
          description="Type at least 2 characters to search across contacts, companies, deals, and tickets."
        />
      )}
    </div>
  );
}
