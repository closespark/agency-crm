"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TriggerConfig } from "@/components/workflows/trigger-config";
import { ActionConfig } from "@/components/workflows/action-config";
import { WorkflowFlow } from "@/components/workflows/workflow-flow";

export default function NewWorkflowPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(false);

  const [trigger, setTrigger] = useState<{
    type: string;
    conditions: Record<string, unknown>;
  }>({ type: "", conditions: {} });

  const [actions, setActions] = useState<
    { type: string; config: Record<string, unknown> }[]
  >([]);

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

  const handleSave = async () => {
    if (!name || !trigger.type || actions.length === 0) return;

    setSaving(true);
    try {
      const res = await fetch("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description,
          trigger: JSON.stringify(trigger),
          actions: JSON.stringify(actions),
          isActive,
        }),
      });

      if (res.ok) {
        const json = await res.json();
        router.push(`/workflows/${json.data.id}`);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleAISuggest = async () => {
    setSuggesting(true);
    try {
      const res = await fetch("/api/ai/workflows/suggest", { method: "POST" });
      const json = await res.json();
      const suggestions = json.data?.suggestions;
      if (suggestions && suggestions.length > 0) {
        const first = suggestions[0];
        setName(first.name || "");
        setDescription(first.description || "");
        if (first.trigger) setTrigger(first.trigger);
        if (first.actions) setActions(first.actions);
      }
    } catch {
      // Silently handle errors
    }
    setSuggesting(false);
  };

  const canProceedStep1 = !!trigger.type;
  const canProceedStep2 = actions.length > 0 && actions.every((a) => a.type);
  const canSave = !!name && canProceedStep1 && canProceedStep2;

  return (
    <div>
      <PageHeader
        title="Create Workflow"
        description="Build an automation in 3 steps: trigger, actions, and details."
        actions={
          <Button variant="outline" onClick={handleAISuggest} disabled={suggesting}>
            {suggesting ? "Generating..." : "AI Suggest"}
          </Button>
        }
      />

      {/* Step indicators */}
      <div className="mb-8 flex items-center gap-4">
        {[
          { num: 1, label: "Choose Trigger" },
          { num: 2, label: "Add Actions" },
          { num: 3, label: "Review & Save" },
        ].map(({ num, label }) => (
          <button
            key={num}
            onClick={() => setStep(num)}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              step === num
                ? "bg-blue-600 text-white"
                : step > num
                  ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                  : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
            }`}
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20 text-xs">
              {step > num ? "\u2713" : num}
            </span>
            {label}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main config area */}
        <div className="lg:col-span-2">
          {step === 1 && (
            <Card>
              <CardHeader>
                <CardTitle>Step 1: Choose Trigger</CardTitle>
              </CardHeader>
              <CardContent>
                <TriggerConfig trigger={trigger} onChange={setTrigger} />
                <div className="mt-6 flex justify-end">
                  <Button onClick={() => setStep(2)} disabled={!canProceedStep1}>
                    Next: Add Actions
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {step === 2 && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Step 2: Add Actions</CardTitle>
                  <Button variant="outline" size="sm" onClick={addAction}>
                    + Add Action
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {actions.length === 0 ? (
                  <div className="py-8 text-center text-sm text-zinc-400">
                    <p>No actions added yet.</p>
                    <Button variant="outline" className="mt-3" onClick={addAction}>
                      + Add Your First Action
                    </Button>
                  </div>
                ) : (
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
                  </div>
                )}
                <div className="mt-6 flex justify-between">
                  <Button variant="outline" onClick={() => setStep(1)}>
                    Back
                  </Button>
                  <Button onClick={() => setStep(3)} disabled={!canProceedStep2}>
                    Next: Review
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {step === 3 && (
            <Card>
              <CardHeader>
                <CardTitle>Step 3: Name & Activate</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <Input
                    label="Workflow Name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. New Lead Auto-Nurture"
                  />
                  <Textarea
                    label="Description (optional)"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What does this workflow do?"
                  />
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="is-active"
                      checked={isActive}
                      onChange={(e) => setIsActive(e.target.checked)}
                      className="rounded border-zinc-300"
                    />
                    <label
                      htmlFor="is-active"
                      className="text-sm text-zinc-700 dark:text-zinc-300"
                    >
                      Activate immediately
                    </label>
                  </div>
                </div>
                <div className="mt-6 flex justify-between">
                  <Button variant="outline" onClick={() => setStep(2)}>
                    Back
                  </Button>
                  <Button onClick={handleSave} disabled={!canSave || saving}>
                    {saving ? "Saving..." : "Create Workflow"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Live preview */}
        <div>
          <Card className="sticky top-6">
            <CardHeader>
              <CardTitle className="text-base">Preview</CardTitle>
            </CardHeader>
            <CardContent>
              {trigger.type ? (
                <WorkflowFlow trigger={trigger} actions={actions.filter((a) => a.type)} />
              ) : (
                <p className="text-center text-sm text-zinc-400">
                  Choose a trigger to see the workflow preview.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
