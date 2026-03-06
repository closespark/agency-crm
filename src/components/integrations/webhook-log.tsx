"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { formatDateTime, truncate } from "@/lib/utils";

interface WebhookEvent {
  id: string;
  eventType: string;
  payload: string;
  status: string;
  processedAt: string | null;
  error: string | null;
  createdAt: string;
}

interface WebhookLogProps {
  events: WebhookEvent[];
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
  isLoading: boolean;
}

const statusVariant: Record<string, "default" | "success" | "danger" | "warning"> = {
  pending: "warning",
  processed: "success",
  failed: "danger",
};

export function WebhookLog({
  events,
  page,
  totalPages,
  total,
  onPageChange,
  isLoading,
}: WebhookLogProps) {
  const [selectedEvent, setSelectedEvent] = useState<WebhookEvent | null>(null);

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Webhook Events</CardTitle>
            <span className="text-sm text-zinc-500">{total} total events</span>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-blue-600" />
            </div>
          ) : events.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-500">
              No webhook events yet
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-800">
                    <th className="pb-2 pr-4 text-left font-medium text-zinc-500">
                      Event Type
                    </th>
                    <th className="pb-2 pr-4 text-left font-medium text-zinc-500">
                      Status
                    </th>
                    <th className="pb-2 pr-4 text-left font-medium text-zinc-500">
                      Payload
                    </th>
                    <th className="pb-2 pr-4 text-left font-medium text-zinc-500">
                      Received
                    </th>
                    <th className="pb-2 text-left font-medium text-zinc-500">
                      Processed
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {events.map((event) => (
                    <tr
                      key={event.id}
                      className="cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900"
                      onClick={() => setSelectedEvent(event)}
                    >
                      <td className="py-2.5 pr-4">
                        <span className="font-mono text-xs">
                          {event.eventType}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4">
                        <Badge variant={statusVariant[event.status] || "default"}>
                          {event.status}
                        </Badge>
                      </td>
                      <td className="py-2.5 pr-4">
                        <span className="font-mono text-xs text-zinc-400">
                          {truncate(event.payload, 60)}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4 whitespace-nowrap text-zinc-500">
                        {formatDateTime(event.createdAt)}
                      </td>
                      <td className="py-2.5 whitespace-nowrap text-zinc-500">
                        {event.processedAt
                          ? formatDateTime(event.processedAt)
                          : "--"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-zinc-500">
                Page {page} of {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => onPageChange(page - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => onPageChange(page + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Modal
        open={!!selectedEvent}
        onClose={() => setSelectedEvent(null)}
        title="Webhook Event Details"
        className="max-w-2xl"
      >
        {selectedEvent && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-medium text-zinc-500">Event Type</span>
                <p className="font-mono">{selectedEvent.eventType}</p>
              </div>
              <div>
                <span className="font-medium text-zinc-500">Status</span>
                <div className="mt-0.5">
                  <Badge
                    variant={statusVariant[selectedEvent.status] || "default"}
                  >
                    {selectedEvent.status}
                  </Badge>
                </div>
              </div>
              <div>
                <span className="font-medium text-zinc-500">Received</span>
                <p>{formatDateTime(selectedEvent.createdAt)}</p>
              </div>
              <div>
                <span className="font-medium text-zinc-500">Processed</span>
                <p>
                  {selectedEvent.processedAt
                    ? formatDateTime(selectedEvent.processedAt)
                    : "Not yet processed"}
                </p>
              </div>
            </div>

            {selectedEvent.error && (
              <div>
                <span className="text-sm font-medium text-zinc-500">Error</span>
                <p className="mt-1 rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/20 dark:text-red-300">
                  {selectedEvent.error}
                </p>
              </div>
            )}

            <div>
              <span className="text-sm font-medium text-zinc-500">Payload</span>
              <pre className="mt-1 max-h-64 overflow-auto rounded-md bg-zinc-100 p-3 text-xs dark:bg-zinc-800">
                {(() => {
                  try {
                    return JSON.stringify(
                      JSON.parse(selectedEvent.payload),
                      null,
                      2
                    );
                  } catch {
                    return selectedEvent.payload;
                  }
                })()}
              </pre>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
