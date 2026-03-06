"use client";

import { useEffect, useState, useCallback } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { AgentCard } from "@/components/ai/agent-card";
import { PageLoader, EmptyState } from "@/components/ui/loading";
import { Bot } from "lucide-react";

interface AgentData {
  id: string;
  name: string;
  description: string | null;
  systemPrompt: string;
  model: string;
  temperature: number;
  isActive: boolean;
  config: string | null;
  _count: { jobs: number };
}

export default function AIAgentsPage() {
  const [agents, setAgents] = useState<AgentData[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/agents");
      const data = await res.json();
      setAgents(data.data || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  async function handleToggleActive(id: string, isActive: boolean) {
    await fetch(`/api/ai/agents/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive }),
    });
    setAgents((prev) =>
      prev.map((a) => (a.id === id ? { ...a, isActive } : a))
    );
  }

  async function handleUpdate(id: string, data: Partial<AgentData>) {
    const res = await fetch(`/api/ai/agents/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const result = await res.json();
    if (result.data) {
      setAgents((prev) =>
        prev.map((a) => (a.id === id ? { ...a, ...result.data } : a))
      );
    }
  }

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Agents"
        description="Configure and manage your AI agents"
      />

      {agents.length === 0 ? (
        <EmptyState
          icon={<Bot size={48} />}
          title="No agents configured"
          description="AI agents will be created when the autopilot is initialized."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              onToggleActive={handleToggleActive}
              onUpdate={handleUpdate}
            />
          ))}
        </div>
      )}
    </div>
  );
}
