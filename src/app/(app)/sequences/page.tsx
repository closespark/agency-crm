"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { SearchInput } from "@/components/shared/search-input";
import { DataTable, type Column } from "@/components/shared/data-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PageLoader } from "@/components/ui/loading";
import { api, buildQueryString } from "@/lib/api";
import { formatDate, parseJSON } from "@/lib/utils";

interface SequenceItem {
  id: string;
  name: string;
  description: string | null;
  steps: string;
  isActive: boolean;
  aiGenerated: boolean;
  stepsCount: number;
  enrollmentCounts: {
    total: number;
    active: number;
    completed: number;
    replied: number;
  };
  createdAt: string;
}

interface SequencesResponse {
  data: SequenceItem[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
  stats: { activeEnrollments: number; completedSequences: number; replyRate: number };
}

export default function SequencesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [sequences, setSequences] = useState<SequenceItem[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [stats, setStats] = useState({
    activeEnrollments: 0,
    completedSequences: 0,
    replyRate: 0,
  });

  const fetchSequences = useCallback(async () => {
    setLoading(true);
    const qs = buildQueryString({ page, search });
    const res = await api.get<SequenceItem[]>(`/sequences${qs}`);
    if (res.data) {
      setSequences(res.data);
      setTotalPages(res.meta?.totalPages || 1);
      const statsData = (res as unknown as { stats?: typeof stats }).stats;
      if (statsData) setStats(statsData);
    }
    setLoading(false);
  }, [page, search]);

  useEffect(() => {
    fetchSequences();
  }, [fetchSequences]);

  const columns: Column<SequenceItem>[] = [
    {
      key: "name",
      label: "Sequence",
      render: (item) => (
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-zinc-900 dark:text-zinc-100">
              {item.name}
            </span>
            {item.aiGenerated && (
              <Badge variant="default">AI</Badge>
            )}
            {!item.isActive && (
              <Badge variant="secondary">Inactive</Badge>
            )}
          </div>
          {item.description && (
            <p className="mt-0.5 text-xs text-zinc-500">
              {item.description.length > 80
                ? item.description.slice(0, 80) + "..."
                : item.description}
            </p>
          )}
        </div>
      ),
    },
    {
      key: "stepsCount",
      label: "Steps",
      render: (item) => (
        <span className="text-sm text-zinc-600 dark:text-zinc-400">
          {item.stepsCount} step{item.stepsCount !== 1 ? "s" : ""}
        </span>
      ),
    },
    {
      key: "enrollments",
      label: "Enrollments",
      render: (item) => (
        <div className="text-sm">
          <span className="font-medium text-zinc-900 dark:text-zinc-100">
            {item.enrollmentCounts.total}
          </span>
          <span className="text-zinc-500"> total</span>
          {item.enrollmentCounts.active > 0 && (
            <span className="ml-2 text-blue-600">
              {item.enrollmentCounts.active} active
            </span>
          )}
        </div>
      ),
    },
    {
      key: "replyRate",
      label: "Reply Rate",
      render: (item) => {
        const total = item.enrollmentCounts.total;
        const replied = item.enrollmentCounts.replied;
        const rate = total > 0 ? Math.round((replied / total) * 100) : 0;
        return (
          <span className="text-sm text-zinc-600 dark:text-zinc-400">
            {rate}%
          </span>
        );
      },
    },
    {
      key: "createdAt",
      label: "Created",
      render: (item) => (
        <span className="text-sm text-zinc-500">{formatDate(item.createdAt)}</span>
      ),
    },
  ];

  if (loading && sequences.length === 0) {
    return <PageLoader />;
  }

  return (
    <div>
      <PageHeader
        title="Sales Sequences"
        description="Manage outreach sequences and enrollments"
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => router.push("/sequences/new?mode=ai")}
            >
              Generate with AI
            </Button>
            <Button onClick={() => router.push("/sequences/new")}>
              Create Manual
            </Button>
          </>
        }
      />

      {/* Stats */}
      <div className="mb-6 grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold text-blue-600">
              {stats.activeEnrollments}
            </p>
            <p className="text-sm text-zinc-500">Active Enrollments</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold text-green-600">
              {stats.completedSequences}
            </p>
            <p className="text-sm text-zinc-500">Completed Sequences</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold text-purple-600">
              {stats.replyRate}%
            </p>
            <p className="text-sm text-zinc-500">Reply Rate</p>
          </CardContent>
        </Card>
      </div>

      <div className="mb-4">
        <SearchInput
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          placeholder="Search sequences..."
        />
      </div>

      <DataTable
        columns={columns}
        data={sequences}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        onRowClick={(item) => router.push(`/sequences/${item.id}`)}
        emptyMessage="Sequences are auto-generated on first boot. If empty, check the worker logs."
      />
    </div>
  );
}
