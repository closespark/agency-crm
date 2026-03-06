"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { SearchInput } from "@/components/shared/search-input";
import { DataTable, type Column } from "@/components/shared/data-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { PageLoader } from "@/components/ui/loading";
import { api, buildQueryString } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import type { Workflow } from "@/types";

type WorkflowRow = Workflow & { [key: string]: unknown };

export default function WorkflowsPage() {
  const router = useRouter();
  const [workflows, setWorkflows] = useState<WorkflowRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchWorkflows = useCallback(async () => {
    setLoading(true);
    const qs = buildQueryString({
      page,
      pageSize: 25,
      search,
      filters: {
        ...(activeFilter && { isActive: activeFilter }),
      },
    });
    const res = await api.get<WorkflowRow[]>(`/workflows${qs}`);
    if (res.data) {
      setWorkflows(res.data);
      setTotalPages(res.meta?.totalPages || 1);
    }
    setLoading(false);
  }, [page, search, activeFilter]);

  useEffect(() => {
    fetchWorkflows();
  }, [fetchWorkflows]);

  useEffect(() => {
    setPage(1);
  }, [search, activeFilter]);

  const toggleActive = async (workflow: WorkflowRow) => {
    await api.put(`/workflows/${workflow.id}`, {
      name: workflow.name,
      description: workflow.description,
      trigger: workflow.trigger,
      actions: workflow.actions,
      isActive: !workflow.isActive,
    });
    fetchWorkflows();
  };

  const columns: Column<WorkflowRow>[] = [
    {
      key: "name",
      label: "Name",
      render: (w) => (
        <div>
          <p className="font-medium">{w.name}</p>
          {w.description && (
            <p className="text-xs text-zinc-400">{w.description}</p>
          )}
        </div>
      ),
    },
    {
      key: "isActive",
      label: "Status",
      render: (w) => (
        <Badge variant={w.isActive ? "success" : "secondary"}>
          {w.isActive ? "Active" : "Inactive"}
        </Badge>
      ),
    },
    {
      key: "runCount",
      label: "Runs",
      render: (w) => <span className="text-sm">{w.runCount}</span>,
    },
    {
      key: "lastRunAt",
      label: "Last Run",
      render: (w) => (
        <span className="text-sm text-zinc-500">
          {w.lastRunAt ? formatDate(w.lastRunAt) : "Never"}
        </span>
      ),
    },
    {
      key: "createdAt",
      label: "Created",
      render: (w) => (
        <span className="text-sm text-zinc-500">
          {formatDate(w.createdAt)}
        </span>
      ),
    },
    {
      key: "actions",
      label: "",
      render: (w) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            toggleActive(w);
          }}
        >
          {w.isActive ? "Deactivate" : "Activate"}
        </Button>
      ),
    },
  ];

  if (loading) return <PageLoader />;

  return (
    <div>
      <PageHeader
        title="Workflows"
        description="Automate marketing and sales processes"
        actions={
          <Link href="/marketing/workflows/new">
            <Button>New Workflow</Button>
          </Link>
        }
      />

      <div className="mb-4 flex items-center gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search workflows..."
          className="w-64"
        />
        <Select
          options={[
            { value: "true", label: "Active" },
            { value: "false", label: "Inactive" },
          ]}
          placeholder="All statuses"
          value={activeFilter}
          onChange={(e) => setActiveFilter(e.target.value)}
          className="w-40"
        />
      </div>

      <DataTable
        columns={columns}
        data={workflows}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        onRowClick={(w) => router.push(`/marketing/workflows/new?edit=${w.id}`)}
        emptyMessage="No workflows found"
      />
    </div>
  );
}
