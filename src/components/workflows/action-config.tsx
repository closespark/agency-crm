"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export const ACTION_TYPES = [
  { value: "send_email", label: "Send Email" },
  { value: "enroll_in_sequence", label: "Enroll in Sequence" },
  { value: "update_lifecycle_stage", label: "Update Lifecycle Stage" },
  { value: "update_lead_status", label: "Update Lead Status" },
  { value: "create_task", label: "Create Task" },
  { value: "create_deal", label: "Create Deal" },
  { value: "score_contact", label: "Score Contact (AI)" },
  { value: "send_notification", label: "Send Notification" },
  { value: "add_to_list", label: "Add to List" },
  { value: "ai_analyze", label: "AI Analyze" },
  { value: "webhook", label: "Webhook" },
  { value: "wait", label: "Wait (Delay)" },
] as const;

const LIFECYCLE_STAGES = [
  { value: "subscriber", label: "Subscriber" },
  { value: "lead", label: "Lead" },
  { value: "mql", label: "MQL" },
  { value: "sql", label: "SQL" },
  { value: "opportunity", label: "Opportunity" },
  { value: "customer", label: "Customer" },
  { value: "evangelist", label: "Evangelist" },
];

const LEAD_STATUSES = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "interested", label: "Interested" },
  { value: "unqualified", label: "Unqualified" },
  { value: "bad_timing", label: "Bad Timing" },
];

const TASK_PRIORITIES = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

const AI_ANALYZE_TYPES = [
  { value: "reply", label: "Analyze Reply" },
  { value: "deal", label: "Analyze Deal" },
  { value: "contact", label: "Analyze Contact" },
];

interface ActionConfigProps {
  action: { type: string; config: Record<string, unknown> };
  index: number;
  onChange: (action: { type: string; config: Record<string, unknown> }) => void;
  onRemove: () => void;
}

export function ActionConfig({ action, index, onChange, onRemove }: ActionConfigProps) {
  const setType = (type: string) => onChange({ type, config: {} });
  const setConfig = (key: string, value: unknown) =>
    onChange({ ...action, config: { ...action.config, [key]: value } });

  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Action {index + 1}
        </span>
        <Button variant="ghost" size="sm" onClick={onRemove}>
          Remove
        </Button>
      </div>

      <div className="space-y-3">
        <Select
          label="Action Type"
          options={ACTION_TYPES.map((a) => ({ value: a.value, label: a.label }))}
          placeholder="Select an action..."
          value={action.type}
          onChange={(e) => setType(e.target.value)}
        />

        {action.type === "send_email" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id={`ai-generate-${index}`}
                checked={!!action.config.aiGenerate}
                onChange={(e) => setConfig("aiGenerate", e.target.checked)}
                className="rounded border-zinc-300"
              />
              <label htmlFor={`ai-generate-${index}`} className="text-sm text-zinc-700 dark:text-zinc-300">
                AI-generate email content
              </label>
            </div>
            {action.config.aiGenerate ? (
              <>
                <Input
                  label="Purpose"
                  value={(action.config.purpose as string) || ""}
                  onChange={(e) => setConfig("purpose", e.target.value)}
                  placeholder="e.g. follow_up, introduction, proposal"
                />
                <Select
                  label="Tone"
                  options={[
                    { value: "professional", label: "Professional" },
                    { value: "casual", label: "Casual" },
                    { value: "friendly", label: "Friendly" },
                    { value: "urgent", label: "Urgent" },
                  ]}
                  value={(action.config.tone as string) || "professional"}
                  onChange={(e) => setConfig("tone", e.target.value)}
                />
              </>
            ) : (
              <Input
                label="Template ID"
                value={(action.config.templateId as string) || ""}
                onChange={(e) => setConfig("templateId", e.target.value)}
                placeholder="Email template ID"
              />
            )}
          </div>
        )}

        {action.type === "enroll_in_sequence" && (
          <Input
            label="Sequence ID"
            value={(action.config.sequenceId as string) || ""}
            onChange={(e) => setConfig("sequenceId", e.target.value)}
            placeholder="Sequence ID"
          />
        )}

        {action.type === "update_lifecycle_stage" && (
          <Select
            label="New Stage"
            options={LIFECYCLE_STAGES}
            placeholder="Select stage..."
            value={(action.config.stage as string) || ""}
            onChange={(e) => setConfig("stage", e.target.value)}
          />
        )}

        {action.type === "update_lead_status" && (
          <Select
            label="New Status"
            options={LEAD_STATUSES}
            placeholder="Select status..."
            value={(action.config.status as string) || ""}
            onChange={(e) => setConfig("status", e.target.value)}
          />
        )}

        {action.type === "create_task" && (
          <div className="space-y-3">
            <Input
              label="Task Title"
              value={(action.config.title as string) || ""}
              onChange={(e) => setConfig("title", e.target.value)}
              placeholder="e.g. Follow up with contact"
            />
            <div className="grid grid-cols-2 gap-3">
              <Select
                label="Priority"
                options={TASK_PRIORITIES}
                value={(action.config.priority as string) || "medium"}
                onChange={(e) => setConfig("priority", e.target.value)}
              />
              <Input
                label="Due In (days)"
                type="number"
                min={0}
                value={(action.config.dueInDays as number) ?? ""}
                onChange={(e) =>
                  setConfig("dueInDays", e.target.value ? parseInt(e.target.value) : undefined)
                }
                placeholder="e.g. 3"
              />
            </div>
          </div>
        )}

        {action.type === "create_deal" && (
          <div className="space-y-3">
            <Input
              label="Deal Name"
              value={(action.config.name as string) || ""}
              onChange={(e) => setConfig("name", e.target.value)}
              placeholder="e.g. New opportunity from {{contact}}"
            />
            <Select
              label="Initial Stage"
              options={[
                { value: "discovery", label: "Discovery" },
                { value: "proposal_sent", label: "Proposal Sent" },
                { value: "negotiation", label: "Negotiation" },
                { value: "contract_sent", label: "Contract Sent" },
              ]}
              value={(action.config.stage as string) || "discovery"}
              onChange={(e) => setConfig("stage", e.target.value)}
            />
          </div>
        )}

        {action.type === "score_contact" && (
          <p className="text-sm text-zinc-500">
            Triggers AI lead scoring for the contact associated with this event.
          </p>
        )}

        {action.type === "send_notification" && (
          <div className="space-y-3">
            <Input
              label="Notification Title"
              value={(action.config.title as string) || ""}
              onChange={(e) => setConfig("title", e.target.value)}
              placeholder="e.g. New lead alert"
            />
            <Textarea
              label="Notification Body"
              value={(action.config.body as string) || ""}
              onChange={(e) => setConfig("body", e.target.value)}
              placeholder="Notification message..."
            />
          </div>
        )}

        {action.type === "add_to_list" && (
          <Input
            label="List ID"
            value={(action.config.listId as string) || ""}
            onChange={(e) => setConfig("listId", e.target.value)}
            placeholder="List ID"
          />
        )}

        {action.type === "ai_analyze" && (
          <Select
            label="Analysis Type"
            options={AI_ANALYZE_TYPES}
            placeholder="Select analysis type..."
            value={(action.config.type as string) || ""}
            onChange={(e) => setConfig("type", e.target.value)}
          />
        )}

        {action.type === "webhook" && (
          <div className="space-y-3">
            <Input
              label="URL"
              value={(action.config.url as string) || ""}
              onChange={(e) => setConfig("url", e.target.value)}
              placeholder="https://..."
            />
            <Select
              label="Method"
              options={[
                { value: "POST", label: "POST" },
                { value: "GET", label: "GET" },
                { value: "PUT", label: "PUT" },
                { value: "PATCH", label: "PATCH" },
              ]}
              value={(action.config.method as string) || "POST"}
              onChange={(e) => setConfig("method", e.target.value)}
            />
          </div>
        )}

        {action.type === "wait" && (
          <Input
            label="Wait (days)"
            type="number"
            min={1}
            value={(action.config.days as number) ?? ""}
            onChange={(e) =>
              setConfig("days", e.target.value ? parseInt(e.target.value) : undefined)
            }
            placeholder="e.g. 3"
          />
        )}
      </div>
    </div>
  );
}
