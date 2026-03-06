"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";
import { SearchResultItem } from "./search-result-item";
import { cn } from "@/lib/utils";
import type { SearchResult, SearchResponse } from "@/app/api/search/route";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const debouncedQuery = useDebounce(query, 200);

  // Open/close with Cmd+K
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      setTimeout(() => inputRef.current?.focus(), 0);
    } else {
      document.body.style.overflow = "";
      setQuery("");
      setResults([]);
      setActiveIndex(0);
    }
  }, [open]);

  // Search
  useEffect(() => {
    if (!debouncedQuery || debouncedQuery.length < 2) {
      setResults([]);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    const params = new URLSearchParams({ q: debouncedQuery, type: "all" });
    fetch(`/api/search?${params}`)
      .then((res) => res.json())
      .then((data: SearchResponse) => {
        if (cancelled) return;
        const flat: SearchResult[] = [
          ...data.contacts,
          ...data.companies,
          ...data.deals,
          ...data.tickets,
        ];
        setResults(flat);
        setActiveIndex(0);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  const close = useCallback(() => setOpen(false), []);

  const navigateTo = useCallback(
    (url: string) => {
      close();
      router.push(url);
    },
    [close, router]
  );

  // Keyboard navigation
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      close();
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i < results.length - 1 ? i + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i > 0 ? i - 1 : results.length - 1));
    } else if (e.key === "Enter" && results[activeIndex]) {
      e.preventDefault();
      navigateTo(results[activeIndex].url);
    }
  }

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[20vh]"
      onClick={(e) => {
        if (e.target === overlayRef.current) close();
      }}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
        onKeyDown={onKeyDown}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-zinc-200 px-4 dark:border-zinc-700">
          <Search size={18} className="shrink-0 text-zinc-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search contacts, companies, deals, tickets..."
            className="h-12 flex-1 bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-100"
          />
          <kbd className="hidden shrink-0 rounded border border-zinc-300 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400 sm:inline-block dark:border-zinc-600">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto p-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-300 border-t-blue-600" />
            </div>
          ) : results.length > 0 ? (
            <div className="space-y-0.5">
              {results.map((result, index) => (
                <SearchResultItem
                  key={`${result.type}-${result.id}`}
                  result={result}
                  isActive={index === activeIndex}
                  onClick={() => navigateTo(result.url)}
                />
              ))}
            </div>
          ) : debouncedQuery.length >= 2 ? (
            <p className="py-8 text-center text-sm text-zinc-500">
              No results found for &quot;{debouncedQuery}&quot;
            </p>
          ) : (
            <div className="py-8 text-center">
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Start typing to search...
              </p>
              <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">
                Search across contacts, companies, deals, and tickets
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        {results.length > 0 && (
          <div className="flex items-center justify-between border-t border-zinc-200 px-4 py-2 dark:border-zinc-700">
            <div className="flex gap-2 text-xs text-zinc-400">
              <span className="flex items-center gap-1">
                <kbd className={cn("rounded border border-zinc-300 px-1 py-0.5 text-[10px] dark:border-zinc-600")}>
                  &uarr;
                </kbd>
                <kbd className={cn("rounded border border-zinc-300 px-1 py-0.5 text-[10px] dark:border-zinc-600")}>
                  &darr;
                </kbd>
                navigate
              </span>
              <span className="flex items-center gap-1">
                <kbd className={cn("rounded border border-zinc-300 px-1 py-0.5 text-[10px] dark:border-zinc-600")}>
                  &crarr;
                </kbd>
                open
              </span>
            </div>
            <span className="text-xs text-zinc-400">
              {results.length} result{results.length !== 1 ? "s" : ""}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
