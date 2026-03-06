"use client";

import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner, EmptyState } from "@/components/ui/loading";
import { cn, formatDateTime } from "@/lib/utils";

interface Notification {
  id: string;
  userId: string;
  title: string;
  body: string | null;
  type: string;
  resourceType: string | null;
  resourceId: string | null;
  isRead: boolean;
  createdAt: string;
}

const typeConfig: Record<
  string,
  { label: string; variant: "default" | "success" | "warning" | "danger" | "secondary" }
> = {
  deal_update: { label: "Deal", variant: "default" },
  task_due: { label: "Task", variant: "warning" },
  mention: { label: "Mention", variant: "success" },
  assignment: { label: "Assignment", variant: "secondary" },
};

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (showUnreadOnly) params.set("unreadOnly", "true");

      const res = await fetch(`/api/notifications?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setNotifications(json.data);
      }
    } finally {
      setLoading(false);
    }
  }, [showUnreadOnly]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  async function markAsRead(id: string) {
    const res = await fetch(`/api/notifications/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isRead: true }),
    });

    if (res.ok) {
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      );
    }
  }

  async function markAllAsRead() {
    const unread = notifications.filter((n) => !n.isRead);
    await Promise.all(
      unread.map((n) =>
        fetch(`/api/notifications/${n.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isRead: true }),
        })
      )
    );
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  }

  async function deleteNotification(id: string) {
    const res = await fetch(`/api/notifications/${id}`, { method: "DELETE" });
    if (res.ok) {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }
  }

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="mx-auto max-w-3xl px-6 py-6">
      <PageHeader
        title="Notifications"
        description={
          unreadCount > 0
            ? `${unreadCount} unread notification${unreadCount !== 1 ? "s" : ""}`
            : "All caught up"
        }
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant={showUnreadOnly ? "default" : "outline"}
              size="sm"
              onClick={() => setShowUnreadOnly(!showUnreadOnly)}
            >
              {showUnreadOnly ? "Show all" : "Unread only"}
            </Button>
            {unreadCount > 0 && (
              <Button variant="outline" size="sm" onClick={markAllAsRead}>
                Mark all read
              </Button>
            )}
          </div>
        }
      />

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : notifications.length === 0 ? (
        <EmptyState
          title="No notifications"
          description={
            showUnreadOnly
              ? "No unread notifications"
              : "You have no notifications yet"
          }
        />
      ) : (
        <div className="space-y-2">
          {notifications.map((notification) => {
            const config = typeConfig[notification.type] || {
              label: notification.type,
              variant: "secondary" as const,
            };

            return (
              <div
                key={notification.id}
                className={cn(
                  "group flex items-start gap-4 rounded-lg border p-4 transition-colors",
                  notification.isRead
                    ? "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
                    : "border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/20"
                )}
              >
                {/* Unread indicator */}
                <div className="mt-1.5 shrink-0">
                  <div
                    className={cn(
                      "h-2.5 w-2.5 rounded-full",
                      notification.isRead
                        ? "bg-transparent"
                        : "bg-blue-500"
                    )}
                  />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "text-sm font-medium",
                        notification.isRead
                          ? "text-zinc-700 dark:text-zinc-300"
                          : "text-zinc-900 dark:text-zinc-100"
                      )}
                    >
                      {notification.title}
                    </span>
                    <Badge variant={config.variant} className="text-[10px]">
                      {config.label}
                    </Badge>
                  </div>
                  {notification.body && (
                    <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
                      {notification.body}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-zinc-400">
                    {formatDateTime(notification.createdAt)}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  {!notification.isRead && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => markAsRead(notification.id)}
                      className="text-xs"
                    >
                      Mark read
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteNotification(notification.id)}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    Delete
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
