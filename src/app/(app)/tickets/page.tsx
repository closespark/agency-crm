"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { SearchInput } from "@/components/shared/search-input";
import { DataTable, type Column } from "@/components/shared/data-table";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { PageLoader } from "@/components/ui/loading";
import { useDebounce } from "@/hooks/use-debounce";
import { api, buildQueryString } from "@/lib/api";
import { formatDateTime } from "@/lib/utils";
import { AlertTriangle } from "lucide-react";

interface TicketRow {
  id: string;
  subject: string;
  status: string;
  priority: string;
  category: string | null;
  pipeline: string;
  slaDeadline: string | null;
  createdAt: string;
  contact: { id: string; firstName: string; lastName: string; email: string | null } | null;
  company: { id: string; name: string } | null;
}

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "open", label: "Open" },
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In Progress" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
];

const PRIORITY_OPTIONS = [
  { value: "", label: "All Priorities" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

const STATUS_VARIANT: Record<string, "default" | "success" | "warning" | "danger" | "secondary"> = {
  open: "default",
  pending: "warning",
  in_progress: "default",
  resolved: "success",
  closed: "secondary",
};

const PRIORITY_VARIANT: Record<string, "default" | "success" | "warning" | "danger" | "secondary"> = {
  low: "secondary",
  medium: "default",
  high: "warning",
  urgent: "danger",
};

export default function TicketsPage() {
  const router = useRouter();
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const debouncedSearch = useDebounce(search, 300);

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    const qs = buildQueryString({
      page,
      pageSize: 20,
      search: debouncedSearch,
      filters: {
        ...(status && { status }),
        ...(priority && { priority }),
      },
    });
    const res = await api.get<TicketRow[]>(`/tickets${qs}`);
    if (res.data) {
      setTickets(res.data);
      if (res.meta) {
        setTotalPages(res.meta.totalPages);
      }
    }
    setLoading(false);
  }, [page, debouncedSearch, status, priority]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, status, priority]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const columns: Column<any>[] = [
    {
      key: "subject",
      label: "Subject",
      render: (t) => (
        <span className="font-medium text-zinc-900 dark:text-zinc-100">{t.subject}</span>
      ),
    },
    {
      key: "status",
      label: "Status",
      render: (t) => (
        <Badge variant={STATUS_VARIANT[t.status] || "default"}>
          {t.status.replace(/_/g, " ")}
        </Badge>
      ),
    },
    {
      key: "priority",
      label: "Priority",
      render: (t) => (
        <Badge variant={PRIORITY_VARIANT[t.priority] || "default"}>
          {(t.priority === "high" || t.priority === "urgent") && (
            <AlertTriangle className="mr-1 h-3 w-3" />
          )}
          {t.priority}
        </Badge>
      ),
    },
    {
      key: "contact",
      label: "Contact",
      render: (t) =>
        t.contact ? (
          <span>{t.contact.firstName} {t.contact.lastName}</span>
        ) : (
          <span className="text-zinc-400">--</span>
        ),
    },
    {
      key: "company",
      label: "Company",
      render: (t) =>
        t.company ? (
          <span>{t.company.name}</span>
        ) : (
          <span className="text-zinc-400">--</span>
        ),
    },
    {
      key: "createdAt",
      label: "Created",
      render: (t) => <span className="text-zinc-500">{formatDateTime(t.createdAt)}</span>,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Tickets"
        description="AI-triaged support tickets and service requests"
        actions={
          <span className="text-sm text-zinc-500">Managed autonomously by AI</span>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search tickets..."
          className="w-64"
        />
        <Select
          options={STATUS_OPTIONS}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        />
        <Select
          options={PRIORITY_OPTIONS}
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
        />
      </div>

      {loading ? (
        <PageLoader />
      ) : (
        <DataTable
          columns={columns}
          data={tickets as any}
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          onRowClick={(t: any) => router.push(`/tickets/${t.id}`)}
          emptyMessage="No tickets found"
        />
      )}
    </div>
  );
}
