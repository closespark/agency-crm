"use client";

import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

export const TRIGGER_TYPES = [
  { value: "contact_created", label: "Contact Created" },
  { value: "contact_stage_changed", label: "Contact Stage Changed" },
  { value: "deal_stage_changed", label: "Deal Stage Changed" },
  { value: "email_replied", label: "Email Replied" },
  { value: "lead_score_threshold", label: "Lead Score Threshold" },
  { value: "form_submitted", label: "Form Submitted" },
  { value: "meeting_booked", label: "Meeting Booked" },
  { value: "no_activity", label: "No Activity For X Days" },
  { value: "sequence_completed", label: "Sequence Completed" },
] as const;

const LIFECYCLE_STAGES = [
  { value: "", label: "Any" },
  { value: "subscriber", label: "Subscriber" },
  { value: "lead", label: "Lead" },
  { value: "mql", label: "MQL" },
  { value: "sql", label: "SQL" },
  { value: "opportunity", label: "Opportunity" },
  { value: "customer", label: "Customer" },
  { value: "evangelist", label: "Evangelist" },
];

const DEAL_STAGES = [
  { value: "", label: "Any" },
  { value: "discovery", label: "Discovery" },
  { value: "proposal_sent", label: "Proposal Sent" },
  { value: "negotiation", label: "Negotiation" },
  { value: "contract_sent", label: "Contract Sent" },
  { value: "closed_won", label: "Closed Won" },
  { value: "closed_lost", label: "Closed Lost" },
];

interface TriggerConfigProps {
  trigger: { type: string; conditions: Record<string, unknown> };
  onChange: (trigger: { type: string; conditions: Record<string, unknown> }) => void;
}

export function TriggerConfig({ trigger, onChange }: TriggerConfigProps) {
  const setType = (type: string) => onChange({ type, conditions: {} });
  const setCondition = (key: string, value: unknown) =>
    onChange({ ...trigger, conditions: { ...trigger.conditions, [key]: value } });

  return (
    <div className="space-y-4">
      <Select
        label="Trigger Type"
        options={TRIGGER_TYPES.map((t) => ({ value: t.value, label: t.label }))}
        placeholder="Select a trigger..."
        value={trigger.type}
        onChange={(e) => setType(e.target.value)}
      />

      {trigger.type === "contact_stage_changed" && (
        <div className="grid grid-cols-2 gap-4">
          <Select
            label="From Stage"
            options={LIFECYCLE_STAGES}
            value={(trigger.conditions.from as string) || ""}
            onChange={(e) => setCondition("from", e.target.value || undefined)}
          />
          <Select
            label="To Stage"
            options={LIFECYCLE_STAGES}
            value={(trigger.conditions.to as string) || ""}
            onChange={(e) => setCondition("to", e.target.value || undefined)}
          />
        </div>
      )}

      {trigger.type === "deal_stage_changed" && (
        <div className="grid grid-cols-2 gap-4">
          <Select
            label="From Stage"
            options={DEAL_STAGES}
            value={(trigger.conditions.from as string) || ""}
            onChange={(e) => setCondition("from", e.target.value || undefined)}
          />
          <Select
            label="To Stage"
            options={DEAL_STAGES}
            value={(trigger.conditions.to as string) || ""}
            onChange={(e) => setCondition("to", e.target.value || undefined)}
          />
        </div>
      )}

      {trigger.type === "lead_score_threshold" && (
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Score Above"
            type="number"
            min={0}
            max={100}
            value={(trigger.conditions.above as number) ?? ""}
            onChange={(e) =>
              setCondition("above", e.target.value ? parseInt(e.target.value) : undefined)
            }
          />
          <Input
            label="Score Below"
            type="number"
            min={0}
            max={100}
            value={(trigger.conditions.below as number) ?? ""}
            onChange={(e) =>
              setCondition("below", e.target.value ? parseInt(e.target.value) : undefined)
            }
          />
        </div>
      )}

      {trigger.type === "form_submitted" && (
        <Input
          label="Form ID (leave blank for any form)"
          value={(trigger.conditions.formId as string) || ""}
          onChange={(e) => setCondition("formId", e.target.value || undefined)}
          placeholder="Optional form ID"
        />
      )}

      {trigger.type === "no_activity" && (
        <Input
          label="Days of Inactivity"
          type="number"
          min={1}
          value={(trigger.conditions.days as number) ?? ""}
          onChange={(e) =>
            setCondition("days", e.target.value ? parseInt(e.target.value) : undefined)
          }
          placeholder="e.g. 7"
        />
      )}

      {trigger.type === "sequence_completed" && (
        <Input
          label="Sequence ID (leave blank for any sequence)"
          value={(trigger.conditions.sequenceId as string) || ""}
          onChange={(e) => setCondition("sequenceId", e.target.value || undefined)}
          placeholder="Optional sequence ID"
        />
      )}

      {(trigger.type === "contact_created" ||
        trigger.type === "email_replied" ||
        trigger.type === "meeting_booked") &&
        trigger.type && (
          <p className="text-sm text-zinc-500">
            No additional configuration needed. This trigger fires on every matching event.
          </p>
        )}
    </div>
  );
}
