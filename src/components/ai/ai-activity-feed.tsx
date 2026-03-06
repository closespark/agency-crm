"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";
import { Spinner } from "@/components/ui/loading";
import {
  Bot,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
} from "lucide-react";

interface RecentJob {
  id: string;
  type: string;
  status: string;
  tokens: number | null;
  createdAt: string;
  agent: { id: string; name: string };
}

const statusConfig: Record<string, { icon: typeof CheckCircle; color: string }> = {
  completed: { icon: CheckCircle, color: "text-green-600" },
  failed: { icon: XCircle, color: "text-red-600" },
  running: { icon: Loader2, color: "text-blue-600" },
  pending: { icon: Clock, color: "text-zinc-400" },
};

export function AIActivityFeed() {
  const [jobs, setJobs] = useState<RecentJob[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/ai/jobs?pageSize=10&page=1")
      .then((r) => r.json())
      .then((res) => setJobs(res.data || []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Bot size={18} />
          Recent AI Activity
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-4">
            <Spinner />
          </div>
        ) : jobs.length === 0 ? (
          <p className="py-4 text-center text-sm text-zinc-500">No recent activity</p>
        ) : (
          <div className="space-y-3">
            {jobs.map((job) => {
              const cfg = statusConfig[job.status] || statusConfig.pending;
              const StatusIcon = cfg.icon;
              return (
                <div
                  key={job.id}
                  className="flex items-center gap-3 text-sm"
                >
                  <StatusIcon
                    size={16}
                    className={`shrink-0 ${cfg.color} ${job.status === "running" ? "animate-spin" : ""}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-zinc-900 dark:text-zinc-100">
                        {job.agent.name}
                      </span>
                      <Badge variant="secondary" className="text-[10px]">
                        {job.type}
                      </Badge>
                    </div>
                    <p className="text-xs text-zinc-400">
                      {formatDateTime(job.createdAt)}
                      {job.tokens ? ` -- ${job.tokens.toLocaleString()} tokens` : ""}
                    </p>
                  </div>
                  <Badge
                    variant={
                      job.status === "completed"
                        ? "success"
                        : job.status === "failed"
                          ? "danger"
                          : "secondary"
                    }
                  >
                    {job.status}
                  </Badge>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
