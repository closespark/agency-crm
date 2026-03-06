"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/loading";

interface DealAnalysis {
  healthScore: number;
  winProbability: number;
  riskFactors: { risk: string; severity: "low" | "medium" | "high" }[];
  nextActions: { action: string; priority: "now" | "this_week" | "this_month" }[];
  pricingAdvice?: string;
  predictedCloseDate?: string;
  stageRecommendation?: string;
  insights: string[];
}

interface DealHealthPanelProps {
  dealId: string;
  onActionClick?: (action: string) => void;
}

function severityVariant(severity: string) {
  switch (severity) {
    case "high":
      return "danger" as const;
    case "medium":
      return "warning" as const;
    default:
      return "secondary" as const;
  }
}

function priorityVariant(priority: string) {
  switch (priority) {
    case "now":
      return "danger" as const;
    case "this_week":
      return "warning" as const;
    default:
      return "secondary" as const;
  }
}

function GaugeRing({ value, size = 120 }: { value: number; size?: number }) {
  const radius = (size - 16) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;

  let color = "text-red-500";
  if (value >= 70) color = "text-green-500";
  else if (value >= 40) color = "text-yellow-500";

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={8}
          className="text-zinc-200 dark:text-zinc-700"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={8}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className={`transition-all duration-700 ${color}`}
        />
      </svg>
      <span className={`absolute text-2xl font-bold ${color}`}>{value}</span>
    </div>
  );
}

export function DealHealthPanel({ dealId, onActionClick }: DealHealthPanelProps) {
  const [data, setData] = useState<DealAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  const analyze = useCallback(async () => {
    setAnalyzing(true);
    setError(null);
    try {
      const res = await fetch(`/api/ai/deal-analysis/${dealId}`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to analyze deal");
      setData(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setAnalyzing(false);
    }
  }, [dealId]);

  useEffect(() => {
    setLoading(true);
    analyze().finally(() => setLoading(false));
  }, [analyze]);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-8">
          <Spinner size="lg" />
        </CardContent>
      </Card>
    );
  }

  if (error && !data) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-red-500">{error}</p>
          <Button size="sm" variant="outline" className="mt-2" onClick={analyze}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">AI Deal Analysis</CardTitle>
          <Button size="sm" variant="outline" onClick={analyze} disabled={analyzing}>
            {analyzing ? <Spinner size="sm" /> : "Analyze Again"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Health + Win Probability */}
        <div className="flex items-center gap-6">
          <div className="text-center">
            <GaugeRing value={data.healthScore} />
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Health Score</p>
          </div>
          <div className="flex-1 space-y-2">
            <div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Win Probability</p>
              <p className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">
                {data.winProbability}%
              </p>
            </div>
            {data.predictedCloseDate && (
              <div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Predicted Close Date
                </p>
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  {new Date(data.predictedCloseDate).toLocaleDateString()}
                </p>
              </div>
            )}
            {data.stageRecommendation && (
              <div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Stage Recommendation
                </p>
                <Badge>{data.stageRecommendation}</Badge>
              </div>
            )}
          </div>
        </div>

        {/* Risk Factors */}
        {data.riskFactors.length > 0 && (
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase text-zinc-500 dark:text-zinc-400">
              Risk Factors
            </h4>
            <ul className="space-y-1.5">
              {data.riskFactors.map((rf, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-sm text-zinc-700 dark:text-zinc-300"
                >
                  <Badge variant={severityVariant(rf.severity)} className="mt-0.5 shrink-0">
                    {rf.severity}
                  </Badge>
                  <span>{rf.risk}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Next Actions */}
        {data.nextActions.length > 0 && (
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase text-zinc-500 dark:text-zinc-400">
              Next Actions
            </h4>
            <ul className="space-y-1.5">
              {data.nextActions.map((na, i) => (
                <li key={i} className="flex items-center gap-2">
                  <Badge variant={priorityVariant(na.priority)} className="shrink-0">
                    {na.priority}
                  </Badge>
                  <span className="flex-1 text-sm text-zinc-700 dark:text-zinc-300">
                    {na.action}
                  </span>
                  {onActionClick && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onActionClick(na.action)}
                    >
                      Do
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Pricing Advice */}
        {data.pricingAdvice && (
          <div className="rounded-md border border-zinc-200 p-3 dark:border-zinc-700">
            <h4 className="mb-1 text-xs font-semibold uppercase text-zinc-500 dark:text-zinc-400">
              Pricing Advice
            </h4>
            <p className="text-sm text-zinc-700 dark:text-zinc-300">
              {data.pricingAdvice}
            </p>
          </div>
        )}

        {/* Insights */}
        {data.insights.length > 0 && (
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase text-zinc-500 dark:text-zinc-400">
              Insights
            </h4>
            <ul className="space-y-1">
              {data.insights.map((insight, i) => (
                <li
                  key={i}
                  className="text-sm text-zinc-700 dark:text-zinc-300"
                >
                  - {insight}
                </li>
              ))}
            </ul>
          </div>
        )}

        {error && <p className="text-xs text-red-500">{error}</p>}
      </CardContent>
    </Card>
  );
}
