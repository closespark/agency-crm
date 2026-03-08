"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Circle, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, type Column } from "@/components/shared/data-table";
import { SearchInput } from "@/components/shared/search-input";
import { PageLoader } from "@/components/ui/loading";
import { useDebounce } from "@/hooks/use-debounce";
import { usePagination } from "@/hooks/use-pagination";
import { buildQueryString } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { TASK_STATUSES, PRIORITIES } from "@/types";

interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  type: string;
  priority: string;
  status: string;
  dueDate: string | null;
  createdAt: string;
  user: { id: string; name: string | null; image: string | null };
  contact: { id: string; firstName: string; lastName: string } | null;
}

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  ...TASK_STATUSES.map((s) => ({
    value: s,
    label: s
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" "),
  })),
];

const PRIORITY_OPTIONS = [
  { value: "", label: "All Priorities" },
  ...PRIORITIES.map((p) => ({
    value: p,
    label: p.charAt(0).toUpperCase() + p.slice(1),
  })),
];

function getPriorityVariant(priority: string) {
  switch (priority) {
    case "urgent":
      return "danger" as const;
    case "high":
      return "warning" as const;
    case "medium":
      return "default" as const;
    default:
      return "secondary" as const;
  }
}

function getStatusIcon(status: string) {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    case "in_progress":
      return <Clock className="h-4 w-4 text-yellow-500" />;
    default:
      return <Circle className="h-4 w-4 text-zinc-400" />;
  }
}

export default function TasksPage() {
  const router = useRouter();
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const { page, setPage, pageSize } = usePagination();
  const debouncedSearch = useDebounce(search);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    const qs = buildQueryString({
      page,
      pageSize,
      search: debouncedSearch,
      filters: {
        ...(status && { status }),
        ...(priority && { priority }),
      },
    });

    try {
      const res = await fetch(`/api/tasks${qs}`);
      const json = await res.json();
      if (json.data) {
        setTasks(json.data);
        setTotalPages(json.meta?.totalPages || 1);
      }
    } catch (err) {
      console.error("Failed to fetch tasks:", err);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, debouncedSearch, status, priority]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, status, priority, setPage]);

  const handleToggleStatus = async (taskId: string, currentStatus: string) => {
    const newStatus =
      currentStatus === "completed" ? "pending" : "completed";

    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    await fetch(`/api/tasks/${taskId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: task.title,
        description: task.description || undefined,
        type: task.type,
        priority: task.priority,
        status: newStatus,
        dueDate: task.dueDate || undefined,
        contactId: task.contact?.id || undefined,
      }),
    });

    fetchTasks();
  };

  const columns: Column<TaskRow>[] = [
    {
      key: "status_icon",
      label: "",
      className: "w-10",
      render: (task) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleToggleStatus(task.id, task.status);
          }}
          className="hover:scale-110 transition-transform"
        >
          {getStatusIcon(task.status)}
        </button>
      ),
    },
    {
      key: "title",
      label: "Title",
      render: (task) => (
        <div>
          <div
            className={`font-medium ${
              task.status === "completed"
                ? "line-through text-zinc-400"
                : ""
            }`}
          >
            {task.title}
          </div>
          {task.contact && (
            <div className="text-xs text-zinc-500">
              {task.contact.firstName} {task.contact.lastName}
            </div>
          )}
        </div>
      ),
    },
    {
      key: "type",
      label: "Type",
      render: (task) => (
        <Badge variant="secondary">{task.type.replace(/_/g, " ")}</Badge>
      ),
    },
    {
      key: "priority",
      label: "Priority",
      render: (task) => (
        <Badge variant={getPriorityVariant(task.priority)}>
          {task.priority}
        </Badge>
      ),
    },
    {
      key: "status",
      label: "Status",
      render: (task) => {
        const variant =
          task.status === "completed"
            ? ("success" as const)
            : task.status === "in_progress"
              ? ("warning" as const)
              : ("secondary" as const);
        return (
          <Badge variant={variant}>{task.status.replace(/_/g, " ")}</Badge>
        );
      },
    },
    {
      key: "assignee",
      label: "Assigned To",
      render: (task) => task.user?.name || "-",
    },
    {
      key: "dueDate",
      label: "Due Date",
      render: (task) => {
        if (!task.dueDate) return "-";
        const due = new Date(task.dueDate);
        const now = new Date();
        const isOverdue = due < now && task.status !== "completed";
        return (
          <span className={isOverdue ? "text-red-500 font-medium" : ""}>
            {formatDate(task.dueDate)}
          </span>
        );
      },
    },
  ];

  return (
    <div>
      <PageHeader
        title="Tasks"
        description="AI-managed tasks and to-dos"
        actions={
          <span className="text-sm text-zinc-500">Managed autonomously by AI</span>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search tasks..."
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
          data={tasks}
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          emptyMessage="No tasks found"
        />
      )}
    </div>
  );
}
