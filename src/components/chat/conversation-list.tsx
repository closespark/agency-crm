"use client";

import { useState } from "react";
import { SearchInput } from "@/components/shared/search-input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Spinner } from "@/components/ui/loading";
import { cn, truncate } from "@/lib/utils";

interface ConversationMessage {
  id: string;
  body: string;
  createdAt: string;
  user?: { id: string; name: string | null; image: string | null } | null;
  contact?: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
}

interface Conversation {
  id: string;
  channel: string;
  status: string;
  subject: string | null;
  contactId: string | null;
  assigneeId: string | null;
  createdAt: string;
  updatedAt: string;
  messages: ConversationMessage[];
}

interface ConversationListProps {
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  loading: boolean;
  statusFilter: string;
  channelFilter: string;
  search: string;
  onStatusChange: (value: string) => void;
  onChannelChange: (value: string) => void;
  onSearchChange: (value: string) => void;
}

const channelBadgeVariant: Record<
  string,
  "default" | "success" | "warning" | "secondary"
> = {
  email: "default",
  chat: "success",
  whatsapp: "warning",
};

function formatRelativeTime(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "now";
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function ConversationList({
  conversations,
  selectedId,
  onSelect,
  loading,
  statusFilter,
  channelFilter,
  search,
  onStatusChange,
  onChannelChange,
  onSearchChange,
}: ConversationListProps) {
  return (
    <div className="flex h-full flex-col border-r border-zinc-200 dark:border-zinc-800">
      {/* Header and filters */}
      <div className="space-y-3 border-b border-zinc-200 p-4 dark:border-zinc-800">
        <SearchInput
          value={search}
          onChange={onSearchChange}
          placeholder="Search conversations..."
        />
        <div className="flex gap-2">
          <Select
            options={[
              { value: "open", label: "Open" },
              { value: "assigned", label: "Assigned" },
              { value: "closed", label: "Closed" },
            ]}
            placeholder="All statuses"
            value={statusFilter}
            onChange={(e) => onStatusChange(e.target.value)}
            className="h-8 text-xs"
          />
          <Select
            options={[
              { value: "email", label: "Email" },
              { value: "chat", label: "Chat" },
              { value: "whatsapp", label: "WhatsApp" },
            ]}
            placeholder="All channels"
            value={channelFilter}
            onChange={(e) => onChannelChange(e.target.value)}
            className="h-8 text-xs"
          />
        </div>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner />
          </div>
        ) : conversations.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-zinc-500">
            No conversations found
          </div>
        ) : (
          conversations.map((conv) => {
            const lastMessage = conv.messages[0];
            const contactName = lastMessage?.contact
              ? `${lastMessage.contact.firstName} ${lastMessage.contact.lastName}`
              : null;
            const displayName =
              contactName || conv.subject || "Unknown contact";
            const lastMessagePreview = lastMessage
              ? truncate(lastMessage.body, 60)
              : "No messages yet";
            const lastMessageTime = lastMessage
              ? formatRelativeTime(lastMessage.createdAt)
              : formatRelativeTime(conv.createdAt);

            return (
              <button
                key={conv.id}
                onClick={() => onSelect(conv.id)}
                className={cn(
                  "w-full border-b border-zinc-100 px-4 py-3 text-left transition-colors hover:bg-zinc-50 dark:border-zinc-800/50 dark:hover:bg-zinc-800/50",
                  selectedId === conv.id &&
                    "bg-blue-50 hover:bg-blue-50 dark:bg-blue-950/30 dark:hover:bg-blue-950/30"
                )}
              >
                <div className="flex items-start gap-3">
                  <Avatar
                    name={displayName}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                        {displayName}
                      </span>
                      <span className="shrink-0 text-xs text-zinc-400">
                        {lastMessageTime}
                      </span>
                    </div>
                    {conv.subject && contactName && (
                      <div className="truncate text-xs font-medium text-zinc-600 dark:text-zinc-400">
                        {conv.subject}
                      </div>
                    )}
                    <div className="mt-0.5 flex items-center justify-between gap-2">
                      <span className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                        {lastMessagePreview}
                      </span>
                      <Badge
                        variant={channelBadgeVariant[conv.channel] || "secondary"}
                        className="shrink-0 text-[10px] px-1.5 py-0"
                      >
                        {conv.channel}
                      </Badge>
                    </div>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
