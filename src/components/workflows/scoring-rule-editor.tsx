"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";

const CATEGORIES = [
  { value: "demographic", label: "Demographic" },
  { value: "behavioral", label: "Behavioral" },
  { value: "engagement", label: "Engagement" },
  { value: "firmographic", label: "Firmographic" },
];

const CONDITION_FIELDS: Record<string, { value: string; label: string }[]> = {
  demographic: [
    { value: "jobTitle", label: "Job Title" },
    { value: "seniority", label: "Seniority Level" },
    { value: "department", label: "Department" },
    { value: "location", label: "Location" },
  ],
  behavioral: [
    { value: "emailOpens", label: "Email Opens" },
    { value: "emailClicks", label: "Email Clicks" },
    { value: "pageViews", label: "Page Views" },
    { value: "formSubmissions", label: "Form Submissions" },
    { value: "meetingsBooked", label: "Meetings Booked" },
  ],
  engagement: [
    { value: "lastActivityDays", label: "Days Since Last Activity" },
    { value: "totalActivities", label: "Total Activities" },
    { value: "repliedToEmail", label: "Replied to Email" },
    { value: "sequenceCompleted", label: "Completed a Sequence" },
  ],
  firmographic: [
    { value: "companySize", label: "Company Size" },
    { value: "industry", label: "Industry" },
    { value: "revenue", label: "Company Revenue" },
    { value: "companyLocation", label: "Company Location" },
  ],
};

const OPERATORS = [
  { value: "equals", label: "Equals" },
  { value: "not_equals", label: "Not Equals" },
  { value: "contains", label: "Contains" },
  { value: "greater_than", label: "Greater Than" },
  { value: "less_than", label: "Less Than" },
  { value: "exists", label: "Exists" },
];

interface ScoringRule {
  id?: string;
  name: string;
  category: string;
  condition: { field: string; operator: string; value: string };
  points: number;
  isActive: boolean;
  isAIManaged: boolean;
}

interface ScoringRuleEditorProps {
  open: boolean;
  onClose: () => void;
  onSave: (rule: Omit<ScoringRule, "id">) => void;
  initialRule?: ScoringRule;
}

export function ScoringRuleEditor({
  open,
  onClose,
  onSave,
  initialRule,
}: ScoringRuleEditorProps) {
  const [name, setName] = useState(initialRule?.name || "");
  const [category, setCategory] = useState(initialRule?.category || "demographic");
  const [field, setField] = useState(initialRule?.condition?.field || "");
  const [operator, setOperator] = useState(initialRule?.condition?.operator || "equals");
  const [value, setValue] = useState(initialRule?.condition?.value || "");
  const [points, setPoints] = useState(initialRule?.points ?? 10);
  const [isActive, setIsActive] = useState(initialRule?.isActive ?? true);

  const conditionFields = CONDITION_FIELDS[category] || [];

  const handleSave = () => {
    if (!name || !field) return;
    onSave({
      name,
      category,
      condition: { field, operator, value },
      points,
      isActive,
      isAIManaged: false,
    });
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={initialRule ? "Edit Scoring Rule" : "Create Scoring Rule"}>
      <div className="space-y-4">
        <Input
          label="Rule Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. C-Suite decision maker"
        />

        <Select
          label="Category"
          options={CATEGORIES}
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setField("");
          }}
        />

        <Select
          label="Condition Field"
          options={conditionFields}
          placeholder="Select field..."
          value={field}
          onChange={(e) => setField(e.target.value)}
        />

        <div className="grid grid-cols-2 gap-4">
          <Select
            label="Operator"
            options={OPERATORS}
            value={operator}
            onChange={(e) => setOperator(e.target.value)}
          />
          <Input
            label="Value"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Value to match"
          />
        </div>

        <Input
          label="Points"
          type="number"
          value={points}
          onChange={(e) => setPoints(parseInt(e.target.value) || 0)}
          placeholder="Points to add/subtract"
        />

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="rule-active"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="rounded border-zinc-300"
          />
          <label htmlFor="rule-active" className="text-sm text-zinc-700 dark:text-zinc-300">
            Active
          </label>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!name || !field}>
            {initialRule ? "Update Rule" : "Create Rule"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
