"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FitScoreBadge } from "./fit-score-badge";
import { cn } from "@/lib/utils";

interface ProspectCardProps {
  prospect: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    jobTitle: string | null;
    companyName: string | null;
    companySize: string | null;
    industry: string | null;
    location: string | null;
    fitScore: number | null;
    status: string;
  };
  selected?: boolean;
  onSelect?: (id: string) => void;
}

const statusVariant: Record<string, "default" | "success" | "warning" | "danger" | "secondary"> = {
  new: "default",
  verified: "success",
  contacted: "warning",
  converted: "success",
  rejected: "danger",
};

export function ProspectCard({ prospect, selected, onSelect }: ProspectCardProps) {
  const fullName = [prospect.firstName, prospect.lastName].filter(Boolean).join(" ") || "Unknown";

  return (
    <Card className={cn("transition-shadow hover:shadow-md", selected && "ring-2 ring-blue-500")}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {onSelect && (
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onSelect(prospect.id)}
              className="mt-1 h-4 w-4 rounded border-zinc-300"
            />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <Link
                href={`/prospecting/prospect/${prospect.id}`}
                className="truncate font-medium text-zinc-900 hover:text-blue-600 dark:text-zinc-100 dark:hover:text-blue-400"
              >
                {fullName}
              </Link>
              <FitScoreBadge score={prospect.fitScore} size="sm" />
            </div>
            {prospect.jobTitle && (
              <p className="mt-0.5 truncate text-sm text-zinc-600 dark:text-zinc-400">
                {prospect.jobTitle}
              </p>
            )}
            {prospect.companyName && (
              <p className="truncate text-sm text-zinc-500 dark:text-zinc-500">
                {prospect.companyName}
                {prospect.companySize && ` (${prospect.companySize})`}
              </p>
            )}
            <div className="mt-2 flex items-center gap-2">
              <Badge variant={statusVariant[prospect.status] || "secondary"}>
                {prospect.status}
              </Badge>
              {prospect.industry && (
                <Badge variant="secondary">{prospect.industry}</Badge>
              )}
              {prospect.location && (
                <span className="truncate text-xs text-zinc-400">{prospect.location}</span>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
