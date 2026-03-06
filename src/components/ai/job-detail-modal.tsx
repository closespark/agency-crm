"use client";

import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { formatDateTime, formatCurrency } from "@/lib/utils";
import { Spinner } from "@/components/ui/loading";
import { useEffect, useState } from "react";

interface JobDetail {
  id: string;
  agentId: string;
  type: string;
  status: string;
  input: string;
  output: string | null;
  error: string | null;
  tokens: number | null;
  cost: number | null;
  contactId: string | null;
  dealId: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  agent: { id: string; name: string };
}

interface JobDetailModalProps {
  jobId: string | null;
  open: boolean;
  onClose: () => void;
}

const statusVariant: Record<string, "success" | "warning" | "danger" | "default" | "secondary"> = {
  completed: "success",
  running: "warning",
  failed: "danger",
  pending: "default",
  cancelled: "secondary",
};

function FormatJSON({ data }: { data: string | null }) {
  if (!data) return <span className="text-zinc-400">null</span>;
  try {
    const parsed = JSON.parse(data);
    return (
      <pre className="max-h-64 overflow-auto rounded-md bg-zinc-50 p-3 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
        {JSON.stringify(parsed, null, 2)}
      </pre>
    );
  } catch {
    return (
      <pre className="max-h-64 overflow-auto rounded-md bg-zinc-50 p-3 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
        {data}
      </pre>
    );
  }
}

export function JobDetailModal({ jobId, open, onClose }: JobDetailModalProps) {
  const [job, setJob] = useState<JobDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!jobId || !open) return;
    setLoading(true);
    fetch(`/api/ai/jobs/${jobId}`)
      .then((r) => r.json())
      .then((res) => setJob(res.data))
      .finally(() => setLoading(false));
  }, [jobId, open]);

  return (
    <Modal open={open} onClose={onClose} title="Job Detail" className="max-w-2xl">
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Spinner />
        </div>
      ) : job ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-zinc-500">Agent:</span>{" "}
              <span className="font-medium">{job.agent.name}</span>
            </div>
            <div>
              <span className="text-zinc-500">Type:</span>{" "}
              <span className="font-medium">{job.type}</span>
            </div>
            <div>
              <span className="text-zinc-500">Status:</span>{" "}
              <Badge variant={statusVariant[job.status] || "secondary"}>
                {job.status}
              </Badge>
            </div>
            <div>
              <span className="text-zinc-500">Tokens:</span>{" "}
              <span className="font-medium">{job.tokens?.toLocaleString() ?? "N/A"}</span>
            </div>
            <div>
              <span className="text-zinc-500">Cost:</span>{" "}
              <span className="font-medium">
                {job.cost != null ? formatCurrency(job.cost) : "N/A"}
              </span>
            </div>
            <div>
              <span className="text-zinc-500">Created:</span>{" "}
              <span className="font-medium">{formatDateTime(job.createdAt)}</span>
            </div>
            {job.startedAt && (
              <div>
                <span className="text-zinc-500">Started:</span>{" "}
                <span className="font-medium">{formatDateTime(job.startedAt)}</span>
              </div>
            )}
            {job.completedAt && (
              <div>
                <span className="text-zinc-500">Completed:</span>{" "}
                <span className="font-medium">{formatDateTime(job.completedAt)}</span>
              </div>
            )}
          </div>

          <div>
            <h4 className="mb-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">Input</h4>
            <FormatJSON data={job.input} />
          </div>

          <div>
            <h4 className="mb-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">Output</h4>
            <FormatJSON data={job.output} />
          </div>

          {job.error && (
            <div>
              <h4 className="mb-1 text-sm font-medium text-red-600">Error</h4>
              <pre className="max-h-32 overflow-auto rounded-md bg-red-50 p-3 text-xs text-red-700 dark:bg-red-900/20 dark:text-red-300">
                {job.error}
              </pre>
            </div>
          )}
        </div>
      ) : (
        <p className="py-4 text-center text-sm text-zinc-500">Job not found</p>
      )}
    </Modal>
  );
}
