"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";

const defaultTrigger = JSON.stringify(
  {
    type: "form_submission",
    conditions: {
      formId: "",
    },
  },
  null,
  2
);

const defaultActions = JSON.stringify(
  [
    {
      type: "send_email",
      templateId: "",
      delay: 0,
    },
  ],
  null,
  2
);

export default function NewWorkflowPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [trigger, setTrigger] = useState(defaultTrigger);
  const [actions, setActions] = useState(defaultActions);
  const [triggerError, setTriggerError] = useState("");
  const [actionsError, setActionsError] = useState("");

  const validateJson = (value: string, setter: (err: string) => void) => {
    try {
      JSON.parse(value);
      setter("");
      return true;
    } catch {
      setter("Invalid JSON");
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    setError("");

    const triggerValid = validateJson(trigger, setTriggerError);
    const actionsValid = validateJson(actions, setActionsError);

    if (!triggerValid || !actionsValid) {
      setSaving(false);
      return;
    }

    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get("name") as string,
      description: (formData.get("description") as string) || undefined,
      trigger,
      actions,
      isActive: false,
    };

    const res = await api.post("/workflows", data);

    if (res.error) {
      setError(res.error);
      setSaving(false);
      return;
    }

    router.push("/marketing/workflows");
  };

  return (
    <div>
      <PageHeader
        title="New Workflow"
        actions={
          <Button variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
        }
      />

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">
                {error}
              </div>
            )}

            <Input
              id="name"
              name="name"
              label="Workflow Name"
              required
              placeholder="e.g. Welcome Email Workflow"
            />

            <Textarea
              id="description"
              name="description"
              label="Description"
              placeholder="Describe what this workflow does..."
              className="min-h-[60px]"
            />

            <div className="space-y-1">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Trigger (JSON)
              </label>
              <Textarea
                value={trigger}
                onChange={(e) => {
                  setTrigger(e.target.value);
                  validateJson(e.target.value, setTriggerError);
                }}
                className="min-h-[120px] font-mono text-sm"
                required
              />
              {triggerError && (
                <p className="text-xs text-red-500">{triggerError}</p>
              )}
              <p className="text-xs text-zinc-400">
                Define when the workflow triggers. Types: form_submission,
                contact_created, deal_stage_changed, tag_added
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Actions (JSON Array)
              </label>
              <Textarea
                value={actions}
                onChange={(e) => {
                  setActions(e.target.value);
                  validateJson(e.target.value, setActionsError);
                }}
                className="min-h-[160px] font-mono text-sm"
                required
              />
              {actionsError && (
                <p className="text-xs text-red-500">{actionsError}</p>
              )}
              <p className="text-xs text-zinc-400">
                Define the sequence of actions. Types: send_email,
                add_to_list, update_contact, create_task, wait
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Creating..." : "Create Workflow"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
