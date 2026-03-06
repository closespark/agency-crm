"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Bot, Pencil, Power, Save, X } from "lucide-react";

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

interface AgentCardProps {
  agent: AgentData;
  onToggleActive: (id: string, isActive: boolean) => void;
  onUpdate: (id: string, data: Partial<AgentData>) => void;
}

const modelOptions = [
  { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
  { value: "claude-opus-4-20250514", label: "Claude Opus 4" },
  { value: "claude-haiku-4-20250514", label: "Claude Haiku 4" },
];

export function AgentCard({ agent, onToggleActive, onUpdate }: AgentCardProps) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    systemPrompt: agent.systemPrompt,
    model: agent.model,
    temperature: agent.temperature,
    description: agent.description || "",
  });

  function handleSave() {
    onUpdate(agent.id, {
      systemPrompt: form.systemPrompt,
      model: form.model,
      temperature: form.temperature,
      description: form.description || null,
    });
    setEditing(false);
  }

  function handleCancel() {
    setForm({
      systemPrompt: agent.systemPrompt,
      model: agent.model,
      temperature: agent.temperature,
      description: agent.description || "",
    });
    setEditing(false);
  }

  return (
    <Card className={!agent.isActive ? "opacity-60" : ""}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-blue-100 p-2 text-blue-600 dark:bg-blue-900/50">
              <Bot size={18} />
            </div>
            <div>
              <CardTitle className="text-base">{agent.name}</CardTitle>
              <p className="text-xs text-zinc-500">{agent._count.jobs} jobs run</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Badge variant={agent.isActive ? "success" : "secondary"}>
              {agent.isActive ? "Active" : "Inactive"}
            </Badge>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => onToggleActive(agent.id, !agent.isActive)}
              title={agent.isActive ? "Deactivate" : "Activate"}
            >
              <Power size={14} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {editing ? (
          <div className="space-y-3">
            <Textarea
              label="System Prompt"
              value={form.systemPrompt}
              onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
              rows={4}
            />
            <Input
              label="Description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
            <div className="grid grid-cols-2 gap-3">
              <Select
                label="Model"
                value={form.model}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
                options={modelOptions}
              />
              <Input
                label="Temperature"
                type="number"
                min="0"
                max="2"
                step="0.1"
                value={form.temperature}
                onChange={(e) => setForm({ ...form, temperature: parseFloat(e.target.value) })}
              />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSave}>
                <Save size={14} />
                Save
              </Button>
              <Button size="sm" variant="outline" onClick={handleCancel}>
                <X size={14} />
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {agent.description || "No description"}
            </p>
            <div className="mt-2 flex items-center gap-3 text-xs text-zinc-500">
              <span>Model: {agent.model}</span>
              <span>Temp: {agent.temperature}</span>
            </div>
            <p className="mt-2 line-clamp-2 text-xs text-zinc-400">
              {agent.systemPrompt}
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-3"
              onClick={() => setEditing(true)}
            >
              <Pencil size={14} />
              Edit Config
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
