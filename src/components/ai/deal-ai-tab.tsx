"use client";

import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/loading";
import { DealHealthPanel } from "./deal-health-panel";

interface AIInsightEntry {
  id: string;
  type: string;
  title: string;
  description: string;
  priority: string;
  actionItems: string | null;
  status: string;
  createdAt: string;
}

interface DealAITabProps {
  dealId: string;
  onActionClick?: (action: string) => void;
}

function priorityVariant(priority: string) {
  switch (priority) {
    case "critical":
      return "danger" as const;
    case "high":
      return "warning" as const;
    default:
      return "secondary" as const;
  }
}

export function DealAITab({ dealId, onActionClick }: DealAITabProps) {
  const [insights, setInsights] = useState<AIInsightEntry[]>([]);
  const [loadingInsights, setLoadingInsights] = useState(true);

  useEffect(() => {
    async function fetchInsights() {
      try {
        const res = await fetch(
          `/api/ai/insights?resourceType=deal&resourceId=${dealId}`
        );
        const json = await res.json();
        if (res.ok) setInsights(json.data || []);
      } catch {
        // silent fail
      } finally {
        setLoadingInsights(false);
      }
    }

    fetchInsights();
  }, [dealId]);

  // Group insights by date for risk timeline
  const timelineInsights = [...insights].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  return (
    <div className="space-y-6">
      {/* Deal Health Panel */}
      <DealHealthPanel dealId={dealId} onActionClick={onActionClick} />

      {/* AI Insights */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">AI Insights</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingInsights ? (
            <div className="flex justify-center py-4">
              <Spinner />
            </div>
          ) : insights.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              No AI insights yet for this deal.
            </p>
          ) : (
            <ul className="space-y-3">
              {insights.map((insight) => {
                let actions: { action: string; priority?: string }[] = [];
                if (insight.actionItems) {
                  try {
                    actions = JSON.parse(insight.actionItems);
                  } catch {
                    // ignore
                  }
                }

                return (
                  <li
                    key={insight.id}
                    className="rounded-md border border-zinc-200 p-3 dark:border-zinc-700"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Badge variant={priorityVariant(insight.priority)}>
                            {insight.priority}
                          </Badge>
                          <Badge variant="secondary">
                            {insight.type.replace(/_/g, " ")}
                          </Badge>
                        </div>
                        <p className="mt-1 text-sm font-medium text-zinc-900 dark:text-zinc-100">
                          {insight.title}
                        </p>
                        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                          {insight.description}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-zinc-400">
                        {new Date(insight.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    {actions.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {actions.map((a, i) => (
                          <p
                            key={i}
                            className="text-xs text-zinc-600 dark:text-zinc-400"
                          >
                            - {a.action}
                          </p>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Risk Timeline */}
      {timelineInsights.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Risk Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative border-l-2 border-zinc-200 pl-6 dark:border-zinc-700">
              {timelineInsights.map((insight, i) => (
                <div key={insight.id} className={`relative ${i < timelineInsights.length - 1 ? "pb-6" : ""}`}>
                  {/* Dot on timeline */}
                  <div
                    className={`absolute -left-[31px] h-4 w-4 rounded-full border-2 border-white dark:border-zinc-950 ${
                      insight.priority === "critical"
                        ? "bg-red-500"
                        : insight.priority === "high"
                        ? "bg-yellow-500"
                        : "bg-zinc-400"
                    }`}
                  />
                  <div>
                    <p className="text-xs text-zinc-400">
                      {new Date(insight.createdAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
                    <div className="mt-0.5 flex items-center gap-2">
                      <Badge variant={priorityVariant(insight.priority)}>
                        {insight.priority}
                      </Badge>
                      <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                        {insight.title}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                      {insight.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
