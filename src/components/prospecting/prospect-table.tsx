"use client";

import Link from "next/link";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { FitScoreBadge } from "./fit-score-badge";

interface Prospect {
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
}

interface ProspectTableProps {
  prospects: Prospect[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  sortBy: string;
  sortDir: "asc" | "desc";
  onSort: (field: string) => void;
}

const statusVariant: Record<string, "default" | "success" | "warning" | "danger" | "secondary"> = {
  new: "default",
  verified: "success",
  contacted: "warning",
  converted: "success",
  rejected: "danger",
};

function SortIcon({ field, sortBy, sortDir }: { field: string; sortBy: string; sortDir: string }) {
  if (field !== sortBy) return <span className="ml-1 text-zinc-300">&#8597;</span>;
  return <span className="ml-1">{sortDir === "asc" ? "\u2191" : "\u2193"}</span>;
}

export function ProspectTable({
  prospects,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  sortBy,
  sortDir,
  onSort,
}: ProspectTableProps) {
  const allSelected = prospects.length > 0 && prospects.every((p) => selectedIds.has(p.id));

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={onToggleSelectAll}
              className="h-4 w-4 rounded border-zinc-300"
            />
          </TableHead>
          <TableHead>
            <button onClick={() => onSort("lastName")} className="inline-flex items-center font-medium">
              Name <SortIcon field="lastName" sortBy={sortBy} sortDir={sortDir} />
            </button>
          </TableHead>
          <TableHead>Title</TableHead>
          <TableHead>
            <button onClick={() => onSort("companyName")} className="inline-flex items-center font-medium">
              Company <SortIcon field="companyName" sortBy={sortBy} sortDir={sortDir} />
            </button>
          </TableHead>
          <TableHead>
            <button onClick={() => onSort("fitScore")} className="inline-flex items-center font-medium">
              Fit Score <SortIcon field="fitScore" sortBy={sortBy} sortDir={sortDir} />
            </button>
          </TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Location</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {prospects.map((prospect) => {
          const fullName = [prospect.firstName, prospect.lastName].filter(Boolean).join(" ") || "Unknown";
          return (
            <TableRow key={prospect.id}>
              <TableCell>
                <input
                  type="checkbox"
                  checked={selectedIds.has(prospect.id)}
                  onChange={() => onToggleSelect(prospect.id)}
                  className="h-4 w-4 rounded border-zinc-300"
                />
              </TableCell>
              <TableCell>
                <Link
                  href={`/prospecting/prospect/${prospect.id}`}
                  className="font-medium text-zinc-900 hover:text-blue-600 dark:text-zinc-100 dark:hover:text-blue-400"
                >
                  {fullName}
                </Link>
                {prospect.email && (
                  <p className="text-xs text-zinc-500">{prospect.email}</p>
                )}
              </TableCell>
              <TableCell className="text-zinc-600 dark:text-zinc-400">
                {prospect.jobTitle || "-"}
              </TableCell>
              <TableCell>
                <div>
                  <span className="text-zinc-900 dark:text-zinc-100">{prospect.companyName || "-"}</span>
                  {prospect.companySize && (
                    <p className="text-xs text-zinc-500">{prospect.companySize}</p>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <FitScoreBadge score={prospect.fitScore} size="sm" />
              </TableCell>
              <TableCell>
                <Badge variant={statusVariant[prospect.status] || "secondary"}>
                  {prospect.status}
                </Badge>
              </TableCell>
              <TableCell className="text-zinc-500">{prospect.location || "-"}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
