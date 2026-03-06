"use client";

import { useEffect, useState, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PageLoader } from "@/components/ui/loading";
import { TriggerConfig } from "@/components/workflows/trigger-config";
import { ActionConfig } from "@/components/workflows/action-config";
import { WorkflowFlow } from "@/components/workflows/workflow-flow";

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
  updatedAt: string;
}

function parseTrigger(raw: string): { type: string; conditions: Record<string, unknown> } {
  try {
    const parsed = JSON.parse(raw);
    return { type: parsed.type || "", conditions: parsed.conditions || {} };
  } catch {
    return { type: "", conditions: {} };
  }
}

function parseActions(raw: string): { type: string; config: Record<string, unknown> }[] {
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export default function WorkflowDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);

  // Edit state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [trigger, setTrigger] = useState<{
    type: string;
    conditions: Record<string, unknown>;
  }>({ type: "", conditions: {} });
  const [actions, setActions] = useState<
    { type: string; config: Record<string, unknown> }[]
  >([]);

  const fetchWorkflow = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/workflows/${id}`);
    if (res.ok) {
      const json = await res.json();
      setWorkflow(json.data);
      setName(json.data.name);
      setDescription(json.data.description || "");
      setTrigger(parseTrigger(json.data.trigger));
      setActions(parseActions(json.data.actions));
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchWorkflow();
  }, [fetchWorkflow]);

  const handleSave = async () => {
    if (!workflow) return;
    setSaving(true);
    await fetch(`/api/workflows/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        description,
        trigger: JSON.stringify(trigger),
        actions: JSON.stringify(actions),
        isActive: workflow.isActive,
      }),
    });
    setEditing(false);
    setSaving(false);
    fetchWorkflow();
  };

  const handleToggle = async () => {
    if (!workflow) return;
    await fetch(`/api/workflows/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: workflow.name,
        description: workflow.description,
        trigger: workflow.trigger,
        actions: workflow.actions,
        isActive: !workflow.isActive,
      }),
    });
    fetchWorkflow();
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this workflow?")) return;
    await fetch(`/api/workflows/${id}`, { method: "DELETE" });
    router.push("/workflows");
  };

  const handleRunNow = async () => {
    if (!workflow) return;
    setRunning(true);
    try {
      const t = parseTrigger(workflow.trigger);
      await fetch("/api/workflows/engine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventType: t.type,
          data: { manual: true, workflowId: workflow.id },
        }),
      });
      await fetchWorkflow();
    } finally {
      setRunning(false);
    }
  };

  const addAction = () => {
    setActions([...actions, { type: "", config: {} }]);
  };

  const updateAction = (
    index: number,
    action: { type: string; config: Record<string, unknown> }
  ) => {
    const updated = [...actions];
    updated[index] = action;
    setActions(updated);
  };

  const removeAction = (index: number) => {
    setActions(actions.filter((_, i) => i !== index));
  };

  if (loading) return <PageLoader />;
  if (!workflow)
    return (
      <div className="text-center py-12 text-zinc-500">Workflow not found.</div>
    );

  const displayTrigger = parseTrigger(workflow.trigger);
  const displayActions = parseActions(workflow.actions);

  return (
    <div>
      <PageHeader
        title={workflow.name}
        description={workflow.description || undefined}
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleRunNow}
              disabled={running}
            >
              {running ? "Running..." : "Run Now"}
            </Button>
            <Button variant="outline" onClick={handleToggle}>
              {workflow.isActive ? "Deactivate" : "Activate"}
            </Button>
            <Button
              variant={editing ? "default" : "outline"}
              onClick={() => (editing ? handleSave() : setEditing(true))}
              disabled={saving}
            >
              {editing ? (saving ? "Saving..." : "Save Changes") : "Edit"}
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </div>
        }
      />

      {/* Status row */}
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <Badge variant={workflow.isActive ? "success" : "secondary"}>
          {workflow.isActive ? "Active" : "Inactive"}
        </Badge>
        <span className="text-sm text-zinc-500">
          Run {workflow.runCount} time{workflow.runCount !== 1 ? "s" : ""}
        </span>
        {workflow.lastRunAt && (
          <span className="text-sm text-zinc-500">
            Last run: {new Date(workflow.lastRunAt).toLocaleString()}
          </span>
        )}
        <span className="text-sm text-zinc-500">
          Created: {new Date(workflow.createdAt).toLocaleDateString()}
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: Config or Flow */}
        <div className="lg:col-span-2 space-y-6">
          {editing ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Workflow Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Input
                    label="Name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                  <Textarea
                    label="Description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Trigger</CardTitle>
                </CardHeader>
                <CardContent>
                  <TriggerConfig trigger={trigger} onChange={setTrigger} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Actions</CardTitle>
                    <Button variant="outline" size="sm" onClick={addAction}>
                      + Add Action
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {actions.map((action, idx) => (
                      <ActionConfig
                        key={idx}
                        action={action}
                        index={idx}
                        onChange={(a) => updateAction(idx, a)}
                        onRemove={() => removeAction(idx)}
                      />
                    ))}
                    {actions.length === 0 && (
                      <p className="text-center text-sm text-zinc-400 py-4">
                        No actions configured.
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>

              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => {
                  setEditing(false);
                  setTrigger(parseTrigger(workflow.trigger));
                  setActions(parseActions(workflow.actions));
                  setName(workflow.name);
                  setDescription(workflow.description || "");
                }}>
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Workflow Flow</CardTitle>
              </CardHeader>
              <CardContent className="flex justify-center py-8">
                <WorkflowFlow trigger={displayTrigger} actions={displayActions} />
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right: Summary / Run history */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Run Statistics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-500">Total Runs</span>
                  <span className="font-semibold">{workflow.runCount}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-500">Last Run</span>
                  <span className="font-semibold">
                    {workflow.lastRunAt
                      ? new Date(workflow.lastRunAt).toLocaleString()
                      : "Never"}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-500">Status</span>
                  <Badge variant={workflow.isActive ? "success" : "secondary"}>
                    {workflow.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {editing && (
            <Card className="sticky top-6">
              <CardHeader>
                <CardTitle className="text-base">Live Preview</CardTitle>
              </CardHeader>
              <CardContent>
                {trigger.type ? (
                  <WorkflowFlow
                    trigger={trigger}
                    actions={actions.filter((a) => a.type)}
                  />
                ) : (
                  <p className="text-center text-sm text-zinc-400">
                    Choose a trigger to preview.
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
