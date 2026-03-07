"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { PageLoader } from "@/components/ui/loading";
import { TRIGGER_TYPES } from "@/components/workflows/trigger-config";

interface Workflow {
  id: string;
  name: string;
  description: string | null;
  trigger: string;
  actions: string;
  isActive: boolean;
  lastRunAt: string | null;
  runCount: number;
  createdAt: string;
}

function getTriggerLabel(type: string): string {
  return TRIGGER_TYPES.find((t) => t.value === type)?.label || type;
}

function parseTrigger(raw: string): { type: string; conditions?: Record<string, unknown> } {
  try {
    return JSON.parse(raw);
  } catch {
    return { type: "unknown" };
  }
}

function parseActions(raw: string): unknown[] {
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("");
  const [suggesting, setSuggesting] = useState(false);

  const fetchWorkflows = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filter) params.set("isActive", filter);
    params.set("pageSize", "100");
    const res = await fetch(`/api/workflows?${params}`);
    const json = await res.json();
    setWorkflows(json.data || []);
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    fetchWorkflows();
  }, [fetchWorkflows]);

  const handleToggle = async (id: string, workflow: Workflow) => {
    const trigger = parseTrigger(workflow.trigger);
    const actions = parseActions(workflow.actions);
    await fetch(`/api/workflows/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: workflow.name,
        description: workflow.description,
        trigger: JSON.stringify(trigger),
        actions: JSON.stringify(actions),
        isActive: !workflow.isActive,
      }),
    });
    fetchWorkflows();
  };

  const handleAISuggest = async () => {
    setSuggesting(true);
    try {
      const res = await fetch("/api/ai/workflows/suggest", { method: "POST" });
      const json = await res.json();
      if (json.data?.suggestions) {
        alert(
          `AI suggested ${json.data.suggestions.length} workflow(s). Check the console for details.`
        );
        console.log("AI Workflow Suggestions:", json.data.suggestions);
      }
    } catch {
      alert("Failed to get AI suggestions.");
    }
    setSuggesting(false);
  };

  return (
    <div>
      <PageHeader
        title="Workflow Automation"
        description="Build trigger-action automations that run your CRM autonomously."
        actions={
          <span className="text-sm text-zinc-500">Managed autonomously by AI</span>
        }
      />

      <div className="mb-4">
        <Select
          options={[
            { value: "", label: "All Workflows" },
            { value: "true", label: "Active Only" },
            { value: "false", label: "Inactive Only" },
          ]}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-48"
        />
      </div>

      {loading ? (
        <PageLoader />
      ) : workflows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-zinc-500">Managed autonomously by AI. Workflows will appear after the next autopilot cycle.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {workflows.map((wf) => {
            const trigger = parseTrigger(wf.trigger);
            const actions = parseActions(wf.actions);
            return (
              <Link key={wf.id} href={`/workflows/${wf.id}`}>
                <Card className="h-full transition-shadow hover:shadow-md">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-base">{wf.name}</CardTitle>
                      <Badge variant={wf.isActive ? "success" : "secondary"}>
                        {wf.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    {wf.description && (
                      <p className="mt-1 text-sm text-zinc-500 line-clamp-2">
                        {wf.description}
                      </p>
                    )}
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-zinc-600 dark:text-zinc-400">Trigger:</span>
                        <Badge variant="default">{getTriggerLabel(trigger.type)}</Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-zinc-600 dark:text-zinc-400">Actions:</span>
                        <span>{actions.length} step{actions.length !== 1 ? "s" : ""}</span>
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter className="justify-between text-xs text-zinc-400">
                    <span>Ran {wf.runCount} time{wf.runCount !== 1 ? "s" : ""}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.preventDefault();
                        handleToggle(wf.id, wf);
                      }}
                    >
                      {wf.isActive ? "Deactivate" : "Activate"}
                    </Button>
                  </CardFooter>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
