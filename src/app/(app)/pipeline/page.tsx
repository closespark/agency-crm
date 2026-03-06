"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { KanbanBoard, type DealWithRelations } from "@/components/pipeline/kanban-board";
import {
  PipelineFiltersBar,
  type PipelineFilters,
} from "@/components/pipeline/pipeline-filters";
import { PageLoader, EmptyState } from "@/components/ui/loading";

interface PipelineData {
  deals: DealWithRelations[];
  pipelines: string[];
  owners: { id: string; name: string | null; email: string }[];
}

export default function PipelinePage() {
  const router = useRouter();
  const [data, setData] = useState<PipelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filters, setFilters] = useState<PipelineFilters>({
    pipeline: "default",
    ownerId: "",
    dateFrom: "",
    dateTo: "",
  });

  // Fetch deals with filters
  useEffect(() => {
    let cancelled = false;

    async function fetchDeals() {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams();
        if (filters.pipeline) params.set("pipeline", filters.pipeline);
        if (filters.ownerId) params.set("ownerId", filters.ownerId);
        if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
        if (filters.dateTo) params.set("dateTo", filters.dateTo);

        const res = await fetch(`/api/deals/pipeline?${params.toString()}`);
        if (!res.ok) throw new Error("Failed to fetch deals");

        const json = await res.json();
        if (!cancelled) {
          setData(json.data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Something went wrong");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchDeals();
    return () => {
      cancelled = true;
    };
  }, [filters]);

  const handleCardClick = useCallback(
    (dealId: string) => {
      router.push(`/deals/${dealId}`);
    },
    [router]
  );

  const pipelineOptions = (data?.pipelines ?? ["default"]).map((p) => ({
    value: p,
    label: p.charAt(0).toUpperCase() + p.slice(1),
  }));

  const ownerOptions = (data?.owners ?? []).map((o) => ({
    value: o.id,
    label: o.name || o.email,
  }));

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
          Pipeline
        </h1>
      </div>

      <div className="mb-4">
        <PipelineFiltersBar
          filters={filters}
          onFiltersChange={setFilters}
          pipelines={pipelineOptions}
          owners={ownerOptions}
        />
      </div>

      {loading && <PageLoader />}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {!loading && !error && data && data.deals.length === 0 && (
        <EmptyState
          title="No deals found"
          description="Create your first deal or adjust your filters to see deals on the pipeline board."
        />
      )}

      {!loading && !error && data && (
        <div className="flex-1 overflow-hidden">
          <KanbanBoard
            initialDeals={data.deals}
            onCardClick={handleCardClick}
          />
        </div>
      )}
    </div>
  );
}
