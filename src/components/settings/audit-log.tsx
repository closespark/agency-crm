"use client";

import { useState, useEffect, useCallback } from "react";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Spinner } from "@/components/ui/loading";
import { Pagination } from "@/components/ui/pagination";
import { formatDateTime } from "@/lib/utils";

interface AuditLogEntry {
  id: string;
  userId: string;
  action: string;
  resource: string;
  resourceId: string;
  details: string | null;
  createdAt: string;
  user: {
    id: string;
    name: string | null;
    email: string;
  };
}

const ACTION_OPTIONS = [
  { value: "", label: "All Actions" },
  { value: "created", label: "Created" },
  { value: "updated", label: "Updated" },
  { value: "deleted", label: "Deleted" },
  { value: "viewed", label: "Viewed" },
];

const RESOURCE_OPTIONS = [
  { value: "", label: "All Resources" },
  { value: "contact", label: "Contact" },
  { value: "company", label: "Company" },
  { value: "deal", label: "Deal" },
  { value: "ticket", label: "Ticket" },
  { value: "user", label: "User" },
  { value: "team", label: "Team" },
  { value: "task", label: "Task" },
];

const actionBadgeVariant = (action: string) => {
  switch (action) {
    case "created": return "success" as const;
    case "updated": return "warning" as const;
    case "deleted": return "danger" as const;
    default: return "secondary" as const;
  }
};

export function AuditLog() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [actionFilter, setActionFilter] = useState("");
  const [resourceFilter, setResourceFilter] = useState("");
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: "25",
      });
      if (actionFilter) params.set("action", actionFilter);
      if (resourceFilter) params.set("resource", resourceFilter);

      const res = await fetch(`/api/audit-log?${params}`);
      if (!res.ok) throw new Error("Failed to fetch audit logs");
      const data = await res.json();
      setLogs(data.logs);
      setTotalPages(data.totalPages);
    } catch {
      setError("Failed to load audit logs");
    } finally {
      setLoading(false);
    }
  }, [page, actionFilter, resourceFilter]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  function handleFilterChange(type: "action" | "resource", value: string) {
    setPage(1);
    if (type === "action") setActionFilter(value);
    else setResourceFilter(value);
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center gap-4">
        <Select
          options={ACTION_OPTIONS}
          value={actionFilter}
          onChange={(e) => handleFilterChange("action", e.target.value)}
          className="w-40"
        />
        <Select
          options={RESOURCE_OPTIONS}
          value={resourceFilter}
          onChange={(e) => handleFilterChange("resource", e.target.value)}
          className="w-40"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : logs.length === 0 ? (
        <p className="py-12 text-center text-sm text-zinc-500">No audit log entries found.</p>
      ) : (
        <>
          <div className="overflow-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Resource</TableHead>
                  <TableHead>Resource ID</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead>Timestamp</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell>
                      <div>
                        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                          {log.user.name || "Unnamed"}
                        </p>
                        <p className="text-xs text-zinc-500">{log.user.email}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={actionBadgeVariant(log.action)}>{log.action}</Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm capitalize text-zinc-700 dark:text-zinc-300">
                        {log.resource}
                      </span>
                    </TableCell>
                    <TableCell>
                      <code className="text-xs text-zinc-500">
                        {log.resourceId.slice(0, 12)}...
                      </code>
                    </TableCell>
                    <TableCell>
                      {log.details ? (
                        <code className="block max-w-xs truncate text-xs text-zinc-500">
                          {log.details}
                        </code>
                      ) : (
                        <span className="text-xs text-zinc-400">--</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-zinc-500">
                        {formatDateTime(log.createdAt)}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {totalPages > 1 && (
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          )}
        </>
      )}
    </div>
  );
}
