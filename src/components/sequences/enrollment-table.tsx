"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/shared/data-table";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { formatDate, formatDateTime } from "@/lib/utils";
import { api } from "@/lib/api";

interface EnrollmentContact {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  jobTitle?: string | null;
  company?: { id: string; name: string } | null;
}

interface EnrollmentSequence {
  id: string;
  name: string;
  steps: string;
}

interface Enrollment {
  id: string;
  sequenceId: string;
  contactId: string;
  status: string;
  currentStep: number;
  channel: string;
  nextActionAt: string | null;
  completedAt: string | null;
  createdAt: string;
  totalSteps?: number;
  contact: EnrollmentContact;
  sequence?: EnrollmentSequence;
}

interface EnrollmentTableProps {
  enrollments: Enrollment[];
  showSequence?: boolean;
  page?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
  onRefresh?: () => void;
}

const statusVariants: Record<string, "default" | "success" | "warning" | "danger" | "secondary"> = {
  active: "default",
  paused: "warning",
  completed: "success",
  bounced: "danger",
  replied: "success",
  unsubscribed: "secondary",
};

export function EnrollmentTable({
  enrollments,
  showSequence = false,
  page,
  totalPages,
  onPageChange,
  onRefresh,
}: EnrollmentTableProps) {
  const [actionDialog, setActionDialog] = useState<{
    open: boolean;
    enrollmentId: string;
    action: "pause" | "resume" | "unenroll";
    contactName: string;
  }>({
    open: false,
    enrollmentId: "",
    action: "pause",
    contactName: "",
  });

  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());

  async function handleAction(enrollmentId: string, action: "pause" | "resume" | "unenroll") {
    try {
      await api.patch(`/sequences/enrollments/${enrollmentId}`, { action });
      onRefresh?.();
    } catch {
      // Error handled by api client
    }
  }

  async function handleBulkAction(action: "pause" | "resume" | "unenroll") {
    const ids = Array.from(bulkSelected);
    await Promise.all(ids.map((id) => handleAction(id, action)));
    setBulkSelected(new Set());
    onRefresh?.();
  }

  const columns: Column<Enrollment>[] = [
    {
      key: "select",
      label: "",
      className: "w-10",
      render: (item) => (
        <input
          type="checkbox"
          checked={bulkSelected.has(item.id)}
          onChange={(e) => {
            const next = new Set(bulkSelected);
            if (e.target.checked) {
              next.add(item.id);
            } else {
              next.delete(item.id);
            }
            setBulkSelected(next);
          }}
          className="h-4 w-4 rounded border-zinc-300"
        />
      ),
    },
    {
      key: "contact",
      label: "Contact",
      render: (item) => (
        <div>
          <p className="font-medium text-zinc-900 dark:text-zinc-100">
            {item.contact.firstName} {item.contact.lastName}
          </p>
          {item.contact.email && (
            <p className="text-xs text-zinc-500">{item.contact.email}</p>
          )}
          {item.contact.company && (
            <p className="text-xs text-zinc-400">{item.contact.company.name}</p>
          )}
        </div>
      ),
    },
  ];

  if (showSequence) {
    columns.push({
      key: "sequence",
      label: "Sequence",
      render: (item) => (
        <span className="text-sm text-zinc-700 dark:text-zinc-300">
          {item.sequence?.name || "Unknown"}
        </span>
      ),
    });
  }

  columns.push(
    {
      key: "status",
      label: "Status",
      render: (item) => (
        <Badge variant={statusVariants[item.status] || "secondary"}>
          {item.status}
        </Badge>
      ),
    },
    {
      key: "progress",
      label: "Progress",
      render: (item) => {
        const total = item.totalSteps || 0;
        return (
          <span className="text-sm text-zinc-600 dark:text-zinc-400">
            Step {item.currentStep + 1} of {total}
          </span>
        );
      },
    },
    {
      key: "channel",
      label: "Channel",
      render: (item) => (
        <Badge variant="secondary">{item.channel}</Badge>
      ),
    },
    {
      key: "nextActionAt",
      label: "Next Action",
      render: (item) =>
        item.nextActionAt ? (
          <span className="text-sm text-zinc-600 dark:text-zinc-400">
            {formatDateTime(item.nextActionAt)}
          </span>
        ) : (
          <span className="text-sm text-zinc-400">--</span>
        ),
    },
    {
      key: "createdAt",
      label: "Enrolled",
      render: (item) => (
        <span className="text-sm text-zinc-500">{formatDate(item.createdAt)}</span>
      ),
    },
    {
      key: "actions",
      label: "",
      className: "w-32",
      render: (item) => (
        <div className="flex gap-1">
          {item.status === "active" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setActionDialog({
                  open: true,
                  enrollmentId: item.id,
                  action: "pause",
                  contactName: `${item.contact.firstName} ${item.contact.lastName}`,
                })
              }
            >
              Pause
            </Button>
          )}
          {item.status === "paused" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setActionDialog({
                  open: true,
                  enrollmentId: item.id,
                  action: "resume",
                  contactName: `${item.contact.firstName} ${item.contact.lastName}`,
                })
              }
            >
              Resume
            </Button>
          )}
          {(item.status === "active" || item.status === "paused") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setActionDialog({
                  open: true,
                  enrollmentId: item.id,
                  action: "unenroll",
                  contactName: `${item.contact.firstName} ${item.contact.lastName}`,
                })
              }
            >
              Unenroll
            </Button>
          )}
        </div>
      ),
    }
  );

  return (
    <div>
      {bulkSelected.size > 0 && (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950">
          <span className="text-sm font-medium text-blue-800 dark:text-blue-200">
            {bulkSelected.size} selected
          </span>
          <Button size="sm" variant="outline" onClick={() => handleBulkAction("pause")}>
            Pause All
          </Button>
          <Button size="sm" variant="outline" onClick={() => handleBulkAction("resume")}>
            Resume All
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => handleBulkAction("unenroll")}
          >
            Unenroll All
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setBulkSelected(new Set())}
          >
            Clear
          </Button>
        </div>
      )}

      <DataTable
        columns={columns}
        data={enrollments}
        page={page}
        totalPages={totalPages}
        onPageChange={onPageChange}
        emptyMessage="No enrollments found"
      />

      <ConfirmDialog
        open={actionDialog.open}
        onClose={() => setActionDialog({ ...actionDialog, open: false })}
        onConfirm={() => handleAction(actionDialog.enrollmentId, actionDialog.action)}
        title={`${actionDialog.action.charAt(0).toUpperCase() + actionDialog.action.slice(1)} Enrollment`}
        message={`Are you sure you want to ${actionDialog.action} the enrollment for ${actionDialog.contactName}?`}
        confirmLabel={actionDialog.action.charAt(0).toUpperCase() + actionDialog.action.slice(1)}
        destructive={actionDialog.action === "unenroll"}
      />
    </div>
  );
}
