"use client";

import { useCallback } from "react";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";

export interface PipelineFilters {
  pipeline: string;
  ownerId: string;
  dateFrom: string;
  dateTo: string;
}

interface PipelineFiltersBarProps {
  filters: PipelineFilters;
  onFiltersChange: (filters: PipelineFilters) => void;
  pipelines: { value: string; label: string }[];
  owners: { value: string; label: string }[];
}

export function PipelineFiltersBar({
  filters,
  onFiltersChange,
  pipelines,
  owners,
}: PipelineFiltersBarProps) {
  const updateFilter = useCallback(
    <K extends keyof PipelineFilters>(key: K, value: PipelineFilters[K]) => {
      onFiltersChange({ ...filters, [key]: value });
    },
    [filters, onFiltersChange]
  );

  return (
    <div className="flex flex-wrap items-end gap-3">
      {pipelines.length > 1 && (
        <Select
          label="Pipeline"
          options={pipelines}
          value={filters.pipeline}
          onChange={(e) => updateFilter("pipeline", e.target.value)}
        />
      )}

      <Select
        label="Owner"
        options={owners}
        placeholder="All owners"
        value={filters.ownerId}
        onChange={(e) => updateFilter("ownerId", e.target.value)}
      />

      <div className="space-y-1">
        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Close date from
        </label>
        <Input
          type="date"
          value={filters.dateFrom}
          onChange={(e) => updateFilter("dateFrom", e.target.value)}
        />
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Close date to
        </label>
        <Input
          type="date"
          value={filters.dateTo}
          onChange={(e) => updateFilter("dateTo", e.target.value)}
        />
      </div>
    </div>
  );
}
