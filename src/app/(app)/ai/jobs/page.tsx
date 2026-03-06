"use client";

import { useEffect, useState, useCallback } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Pagination } from "@/components/ui/pagination";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { JobDetailModal } from "@/components/ai/job-detail-modal";
import { PageLoader, EmptyState } from "@/components/ui/loading";
import { formatDateTime, formatCurrency } from "@/lib/utils";
import { Bot } from "lucide-react";

interface JobData {
  id: string;
  agentId: string;
  type: string;
  status: string;
  tokens: number | null;
  cost: number | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  agent: { id: string; name: string };
}

interface AgentOption {
  id: string;
  name: string;
}

const statusOptions = [
  { value: "", label: "All Statuses" },
  { value: "pending", label: "Pending" },
  { value: "running", label: "Running" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
  { value: "cancelled", label: "Cancelled" },
];

const typeOptions = [
  { value: "", label: "All Types" },
  { value: "score_lead", label: "Score Lead" },
  { value: "analyze_reply", label: "Analyze Reply" },
  { value: "analyze_deal", label: "Analyze Deal" },
  { value: "personalize_step", label: "Personalize Step" },
  { value: "prospect_research", label: "Prospect Research" },
  { value: "draft_email", label: "Draft Email" },
  { value: "enrich_contact", label: "Enrich Contact" },
];

const statusVariant: Record<string, "success" | "warning" | "danger" | "default" | "secondary"> = {
  completed: "success",
  running: "warning",
  failed: "danger",
  pending: "default",
  cancelled: "secondary",
};

function getDuration(startedAt: string | null, completedAt: string | null): string {
  if (!startedAt || !completedAt) return "N/A";
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export default function AIJobsPage() {
  const [jobs, setJobs] = useState<JobData[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [summary, setSummary] = useState({ totalJobs: 0, totalTokens: 0, totalCost: 0 });
  const [agentFilter, setAgentFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/ai/agents")
      .then((r) => r.json())
      .then((res) => setAgents(res.data || []));
  }, []);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      page: page.toString(),
      pageSize: "25",
      ...(agentFilter && { agentId: agentFilter }),
      ...(statusFilter && { status: statusFilter }),
      ...(typeFilter && { type: typeFilter }),
    });
    try {
      const res = await fetch(`/api/ai/jobs?${params}`);
      const data = await res.json();
      setJobs(data.data || []);
      setTotalPages(data.meta?.totalPages || 1);
      if (data.summary) setSummary(data.summary);
    } finally {
      setLoading(false);
    }
  }, [page, agentFilter, statusFilter, typeFilter]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  const agentOptions = [
    { value: "", label: "All Agents" },
    ...agents.map((a) => ({ value: a.id, label: a.name })),
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Job History"
        description="Complete history of all AI agent executions"
      />

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
              {summary.totalJobs.toLocaleString()}
            </p>
            <p className="text-xs text-zinc-500">Total Jobs (30 days)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
              {summary.totalTokens.toLocaleString()}
            </p>
            <p className="text-xs text-zinc-500">Total Tokens (30 days)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
              {formatCurrency(summary.totalCost)}
            </p>
            <p className="text-xs text-zinc-500">Total Cost (30 days)</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <Select
          options={agentOptions}
          value={agentFilter}
          onChange={(e) => {
            setAgentFilter(e.target.value);
            setPage(1);
          }}
          className="w-48"
        />
        <Select
          options={statusOptions}
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="w-40"
        />
        <Select
          options={typeOptions}
          value={typeFilter}
          onChange={(e) => {
            setTypeFilter(e.target.value);
            setPage(1);
          }}
          className="w-44"
        />
      </div>

      {/* Table */}
      {loading ? (
        <PageLoader />
      ) : jobs.length === 0 ? (
        <EmptyState
          icon={<Bot size={48} />}
          title="No jobs found"
          description="AI jobs will appear here as the autopilot runs."
        />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agent</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Tokens</TableHead>
                <TableHead>Cost</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((job) => (
                <TableRow
                  key={job.id}
                  className="cursor-pointer"
                  onClick={() => setSelectedJobId(job.id)}
                >
                  <TableCell className="font-medium">{job.agent.name}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{job.type}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant[job.status] || "secondary"}>
                      {job.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{job.tokens?.toLocaleString() ?? "---"}</TableCell>
                  <TableCell>
                    {job.cost != null ? formatCurrency(job.cost) : "---"}
                  </TableCell>
                  <TableCell>{getDuration(job.startedAt, job.completedAt)}</TableCell>
                  <TableCell className="text-zinc-500">
                    {formatDateTime(job.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />

      <JobDetailModal
        jobId={selectedJobId}
        open={!!selectedJobId}
        onClose={() => setSelectedJobId(null)}
      />
    </div>
  );
}
