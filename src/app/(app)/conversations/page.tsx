"use client";

import { useState, useEffect, useCallback } from "react";
import { ConversationList } from "@/components/chat/conversation-list";
import { MessageThread } from "@/components/chat/message-thread";
import { useDebounce } from "@/hooks/use-debounce";

interface ConversationMessage {
  id: string;
  body: string;
  direction: string;
  isInternal: boolean;
  createdAt: string;
  userId: string | null;
  contactId: string | null;
  conversationId: string;
  user?: { id: string; name: string | null; image: string | null } | null;
  contact?: {
    id: string;
    firstName: string;
    lastName: string;
    email?: string | null;
  } | null;
}

interface ConversationListItem {
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

interface ConversationDetail {
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

export default function ConversationsPage() {
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedConversation, setSelectedConversation] =
    useState<ConversationDetail | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [sending, setSending] = useState(false);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [channelFilter, setChannelFilter] = useState("");
  const debouncedSearch = useDebounce(search, 300);

  const fetchConversations = useCallback(async () => {
    setLoadingList(true);
    try {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (statusFilter) params.set("status", statusFilter);
      if (channelFilter) params.set("channel", channelFilter);

      const res = await fetch(`/api/conversations?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setConversations(json.data);
      }
    } finally {
      setLoadingList(false);
    }
  }, [debouncedSearch, statusFilter, channelFilter]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const fetchConversationDetail = useCallback(async (id: string) => {
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/conversations/${id}`);
      if (res.ok) {
        const json = await res.json();
        setSelectedConversation(json.data);
      }
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    if (selectedId) {
      fetchConversationDetail(selectedId);
    } else {
      setSelectedConversation(null);
    }
  }, [selectedId, fetchConversationDetail]);

  async function handleSendMessage(body: string, isInternal: boolean) {
    if (!selectedId) return;
    setSending(true);
    try {
      const res = await fetch(`/api/conversations/${selectedId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body,
          direction: "outbound",
          isInternal,
        }),
      });

      if (res.ok) {
        // Refresh the conversation detail to show the new message
        await fetchConversationDetail(selectedId);
        // Refresh the list to update the last message preview
        await fetchConversations();
      }
    } finally {
      setSending(false);
    }
  }

  async function handleStatusChange(status: string) {
    if (!selectedId) return;
    const res = await fetch(`/api/conversations/${selectedId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });

    if (res.ok) {
      const json = await res.json();
      setSelectedConversation(json.data);
      await fetchConversations();
    }
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
      {/* AI manages conversations autonomously */}
      {/* Left panel - conversation list */}
      <div className="w-96 shrink-0">
        <ConversationList
          conversations={conversations}
          selectedId={selectedId}
          onSelect={setSelectedId}
          loading={loadingList}
          statusFilter={statusFilter}
          channelFilter={channelFilter}
          search={search}
          onStatusChange={setStatusFilter}
          onChannelChange={setChannelFilter}
          onSearchChange={setSearch}
        />
      </div>

      {/* Right panel - message thread */}
      <div className="flex-1">
        <MessageThread
          conversation={selectedConversation}
          loading={loadingDetail}
          sending={sending}
          onSend={handleSendMessage}
          onStatusChange={handleStatusChange}
        />
      </div>
    </div>
  );
}
