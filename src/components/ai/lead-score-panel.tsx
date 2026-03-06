"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/loading";

interface ScoreResult {
  totalScore: number;
  breakdown: {
    demographic: number;
    firmographic: number;
    behavioral: number;
    recency: number;
  };
  lifecycleStage: string;
  leadStatus: string;
  reasoning: string;
  nextAction: string;
}

interface LeadScorePanelProps {
  contactId: string;
  onLifecycleApply?: (stage: string) => void;
  onNextAction?: (action: string) => void;
}

function scoreColor(score: number): string {
  if (score >= 70) return "text-green-600 dark:text-green-400";
  if (score >= 40) return "text-yellow-600 dark:text-yellow-400";
  return "text-red-600 dark:text-red-400";
}

function scoreBg(score: number): string {
  if (score >= 70) return "bg-green-600";
  if (score >= 40) return "bg-yellow-500";
  return "bg-red-500";
}

function ProgressBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-zinc-600 dark:text-zinc-400">{label}</span>
        <span className="font-medium text-zinc-900 dark:text-zinc-100">
          {value}/{max}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
        <div
          className={`h-full rounded-full transition-all ${scoreBg(pct)}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function LeadScorePanel({
  contactId,
  onLifecycleApply,
  onNextAction,
}: LeadScorePanelProps) {
  const [data, setData] = useState<ScoreResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scoring, setScoring] = useState(false);

  const fetchScore = useCallback(async () => {
    setScoring(true);
    setError(null);
    try {
      const res = await fetch(`/api/ai/score/${contactId}`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to score contact");
      setData(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setScoring(false);
    }
  }, [contactId]);

  useEffect(() => {
    // Initial score on mount
    setLoading(true);
    fetchScore().finally(() => setLoading(false));
  }, [fetchScore]);

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
          <Button size="sm" variant="outline" className="mt-2" onClick={fetchScore}>
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
          <CardTitle className="text-base">AI Lead Score</CardTitle>
          <Button size="sm" variant="outline" onClick={fetchScore} disabled={scoring}>
            {scoring ? <Spinner size="sm" /> : "Re-score"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Score Display */}
        <div className="flex items-center gap-4">
          <div
            className={`text-5xl font-bold tabular-nums ${scoreColor(data.totalScore)}`}
          >
            {data.totalScore}
          </div>
          <div className="space-y-1">
            <Badge
              variant={
                data.leadStatus === "interested"
                  ? "success"
                  : data.leadStatus === "unqualified"
                  ? "danger"
                  : "default"
              }
            >
              {data.leadStatus}
            </Badge>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">out of 100</p>
          </div>
        </div>

        {/* Breakdown */}
        <div className="space-y-2.5">
          <ProgressBar label="Demographic" value={data.breakdown.demographic} max={30} />
          <ProgressBar label="Firmographic" value={data.breakdown.firmographic} max={25} />
          <ProgressBar label="Behavioral" value={data.breakdown.behavioral} max={25} />
          <ProgressBar label="Recency" value={data.breakdown.recency} max={20} />
        </div>

        {/* Reasoning */}
        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase text-zinc-500 dark:text-zinc-400">
            AI Reasoning
          </h4>
          <p className="text-sm text-zinc-700 dark:text-zinc-300">{data.reasoning}</p>
        </div>

        {/* Lifecycle Recommendation */}
        <div className="flex items-center justify-between rounded-md border border-zinc-200 p-3 dark:border-zinc-700">
          <div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Recommended Lifecycle
            </p>
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {data.lifecycleStage}
            </p>
          </div>
          {onLifecycleApply && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => onLifecycleApply(data.lifecycleStage)}
            >
              Apply
            </Button>
          )}
        </div>

        {/* Next Action */}
        <div className="rounded-md border border-blue-200 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950">
          <p className="text-xs font-semibold text-blue-600 dark:text-blue-400">
            Recommended Next Action
          </p>
          <p className="mt-0.5 text-sm text-blue-800 dark:text-blue-200">
            {data.nextAction}
          </p>
          {onNextAction && (
            <Button
              size="sm"
              className="mt-2"
              onClick={() => onNextAction(data.nextAction)}
            >
              Execute Action
            </Button>
          )}
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}
      </CardContent>
    </Card>
  );
}
