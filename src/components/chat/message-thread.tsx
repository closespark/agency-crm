"use client";

import { useEffect, useRef } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Spinner, EmptyState } from "@/components/ui/loading";
import { Button } from "@/components/ui/button";
import { MessageInput } from "./message-input";
import { cn, formatDateTime } from "@/lib/utils";

interface MessageUser {
  id: string;
  name: string | null;
  image: string | null;
}

interface MessageContact {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
}

interface Message {
  id: string;
  conversationId: string;
  userId: string | null;
  contactId: string | null;
  body: string;
  direction: string;
  isInternal: boolean;
  createdAt: string;
  user?: MessageUser | null;
  contact?: MessageContact | null;
}

interface ConversationDetail {
  id: string;
  channel: string;
  status: string;
  subject: string | null;
  assigneeId: string | null;
  contactId: string | null;
  createdAt: string;
  updatedAt: string;
  messages: Message[];
}

interface MessageThreadProps {
  conversation: ConversationDetail | null;
  loading: boolean;
  sending: boolean;
  onSend: (body: string, isInternal: boolean) => void;
  onStatusChange: (status: string) => void;
}

export function MessageThread({
  conversation,
  loading,
  sending,
  onSend,
  onStatusChange,
}: MessageThreadProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation?.messages]);

  if (!conversation && !loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center">
        <EmptyState
          title="Select a conversation"
          description="Choose a conversation from the list to view messages"
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!conversation) return null;

  const statusColors: Record<string, "default" | "warning" | "success" | "secondary"> = {
    open: "default",
    assigned: "warning",
    closed: "secondary",
  };

  return (
    <div className="flex h-full flex-col">
      {/* Conversation header */}
      <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-3 dark:border-zinc-800">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {conversation.subject || "Conversation"}
            </h2>
            <div className="mt-0.5 flex items-center gap-2">
              <Badge
                variant={statusColors[conversation.status] || "secondary"}
                className="text-[10px]"
              >
                {conversation.status}
              </Badge>
              <span className="text-xs text-zinc-400">
                {conversation.channel}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {conversation.status !== "closed" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onStatusChange("closed")}
            >
              Close
            </Button>
          )}
          {conversation.status === "closed" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onStatusChange("open")}
            >
              Reopen
            </Button>
          )}
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {conversation.messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-zinc-400">
              No messages yet. Start the conversation below.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {conversation.messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Message input */}
      {conversation.status !== "closed" && (
        <MessageInput onSend={onSend} sending={sending} />
      )}
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isOutbound = message.direction === "outbound";
  const isInternal = message.isInternal;

  const senderName = isOutbound
    ? message.user?.name || "You"
    : message.contact
      ? `${message.contact.firstName} ${message.contact.lastName}`
      : "Unknown";

  const senderImage = isOutbound ? message.user?.image : null;

  return (
    <div
      className={cn(
        "flex gap-3",
        isOutbound && !isInternal && "flex-row-reverse"
      )}
    >
      <Avatar
        name={senderName}
        src={senderImage}
        size="sm"
        className="mt-0.5 shrink-0"
      />
      <div
        className={cn(
          "max-w-[70%] space-y-1",
          isOutbound && !isInternal && "items-end text-right"
        )}
      >
        <div
          className={cn(
            "flex items-baseline gap-2",
            isOutbound && !isInternal && "flex-row-reverse"
          )}
        >
          <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
            {senderName}
          </span>
          {isInternal && (
            <Badge variant="warning" className="text-[10px] px-1.5 py-0">
              Internal
            </Badge>
          )}
          <span className="text-[10px] text-zinc-400">
            {formatDateTime(message.createdAt)}
          </span>
        </div>
        <div
          className={cn(
            "inline-block rounded-2xl px-4 py-2 text-sm",
            isInternal
              ? "rounded-tl-md bg-yellow-100 text-yellow-900 dark:bg-yellow-900/40 dark:text-yellow-200"
              : isOutbound
                ? "rounded-tr-md bg-blue-600 text-white"
                : "rounded-tl-md bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
          )}
        >
          <p className="whitespace-pre-wrap">{message.body}</p>
        </div>
      </div>
    </div>
  );
}
