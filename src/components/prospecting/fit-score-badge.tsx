"use client";

import { cn } from "@/lib/utils";

interface FitScoreBadgeProps {
  score: number | null | undefined;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
}

function getScoreColor(score: number) {
  if (score >= 70) return "text-green-700 bg-green-100 dark:text-green-300 dark:bg-green-900";
  if (score >= 40) return "text-yellow-700 bg-yellow-100 dark:text-yellow-300 dark:bg-yellow-900";
  return "text-red-700 bg-red-100 dark:text-red-300 dark:bg-red-900";
}

function getScoreLabel(score: number) {
  if (score >= 70) return "Strong Fit";
  if (score >= 40) return "Moderate Fit";
  return "Weak Fit";
}

const sizeClasses = {
  sm: "h-6 w-6 text-[10px]",
  md: "h-8 w-8 text-xs",
  lg: "h-10 w-10 text-sm",
};

export function FitScoreBadge({ score, size = "md", showLabel = false }: FitScoreBadgeProps) {
  if (score == null) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-zinc-400">
        <span className={cn("flex items-center justify-center rounded-full bg-zinc-100 font-semibold text-zinc-400 dark:bg-zinc-800", sizeClasses[size])}>
          --
        </span>
        {showLabel && <span>No score</span>}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={cn(
          "flex items-center justify-center rounded-full font-bold",
          sizeClasses[size],
          getScoreColor(score)
        )}
      >
        {score}
      </span>
      {showLabel && (
        <span className={cn("text-xs font-medium", score >= 70 ? "text-green-600" : score >= 40 ? "text-yellow-600" : "text-red-600")}>
          {getScoreLabel(score)}
        </span>
      )}
    </span>
  );
}

export function FitScoreBar({ score }: { score: number | null | undefined }) {
  if (score == null) {
    return (
      <div className="h-2 w-full rounded-full bg-zinc-100 dark:bg-zinc-800" />
    );
  }

  const barColor = score >= 70 ? "bg-green-500" : score >= 40 ? "bg-yellow-500" : "bg-red-500";

  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-full rounded-full bg-zinc-100 dark:bg-zinc-800">
        <div
          className={cn("h-2 rounded-full transition-all", barColor)}
          style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
        />
      </div>
      <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{score}</span>
    </div>
  );
}
