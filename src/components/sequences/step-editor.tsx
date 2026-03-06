"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export interface SequenceStep {
  stepNumber: number;
  channel: "email" | "linkedin" | "call";
  delayDays: number;
  subject?: string;
  body: string;
  notes?: string;
}

interface StepEditorProps {
  steps: SequenceStep[];
  onChange: (steps: SequenceStep[]) => void;
  className?: string;
}

const channelOptions = [
  { value: "email", label: "Email" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "call", label: "Phone Call" },
];

function StepCard({
  step,
  index,
  total,
  onUpdate,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  step: SequenceStep;
  index: number;
  total: number;
  onUpdate: (updated: SequenceStep) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div
        className="flex cursor-pointer items-center justify-between p-4"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700 dark:bg-blue-900 dark:text-blue-300">
            {index + 1}
          </span>
          <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {step.channel === "email"
              ? step.subject || "Email Step"
              : step.channel === "linkedin"
                ? "LinkedIn Message"
                : "Phone Call"}
          </span>
          <span className="text-xs text-zinc-500">
            {step.channel} | {step.delayDays}d delay
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              onMoveUp();
            }}
            disabled={index === 0}
            title="Move up"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
            </svg>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              onMoveDown();
            }}
            disabled={index === total - 1}
            title="Move down"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            title="Remove step"
          >
            <svg
              className="h-4 w-4 text-red-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
              />
            </svg>
          </Button>
          <svg
            className={cn(
              "h-4 w-4 text-zinc-400 transition-transform",
              expanded && "rotate-180"
            )}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {expanded && (
        <div className="space-y-4 border-t border-zinc-200 p-4 dark:border-zinc-800">
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Channel"
              options={channelOptions}
              value={step.channel}
              onChange={(e) =>
                onUpdate({
                  ...step,
                  channel: e.target.value as "email" | "linkedin" | "call",
                })
              }
            />
            <Input
              label="Delay (days)"
              type="number"
              min={0}
              value={step.delayDays}
              onChange={(e) =>
                onUpdate({
                  ...step,
                  delayDays: parseInt(e.target.value) || 0,
                })
              }
            />
          </div>

          {step.channel === "email" && (
            <Input
              label="Subject"
              placeholder="Email subject line..."
              value={step.subject || ""}
              onChange={(e) =>
                onUpdate({ ...step, subject: e.target.value })
              }
            />
          )}

          <Textarea
            label={
              step.channel === "call" ? "Call Script / Talking Points" : "Message Body"
            }
            placeholder={
              step.channel === "email"
                ? "Write your email body... Use {{firstName}}, {{companyName}}, {{jobTitle}} as placeholders."
                : step.channel === "linkedin"
                  ? "Write your LinkedIn message..."
                  : "Outline your call talking points..."
            }
            rows={5}
            value={step.body}
            onChange={(e) => onUpdate({ ...step, body: e.target.value })}
          />

          <Textarea
            label="Internal Notes (optional)"
            placeholder="Strategy notes for this step..."
            rows={2}
            value={step.notes || ""}
            onChange={(e) => onUpdate({ ...step, notes: e.target.value })}
          />
        </div>
      )}
    </div>
  );
}

export function StepEditor({ steps, onChange, className }: StepEditorProps) {
  function addStep() {
    const newStep: SequenceStep = {
      stepNumber: steps.length + 1,
      channel: "email",
      delayDays: steps.length === 0 ? 0 : 2,
      subject: "",
      body: "",
      notes: "",
    };
    onChange([...steps, newStep]);
  }

  function updateStep(index: number, updated: SequenceStep) {
    const newSteps = [...steps];
    newSteps[index] = updated;
    onChange(newSteps);
  }

  function removeStep(index: number) {
    const newSteps = steps.filter((_, i) => i !== index);
    // Renumber
    onChange(newSteps.map((s, i) => ({ ...s, stepNumber: i + 1 })));
  }

  function moveStep(from: number, to: number) {
    if (to < 0 || to >= steps.length) return;
    const newSteps = [...steps];
    const [moved] = newSteps.splice(from, 1);
    newSteps.splice(to, 0, moved);
    // Renumber
    onChange(newSteps.map((s, i) => ({ ...s, stepNumber: i + 1 })));
  }

  return (
    <div className={cn("space-y-3", className)}>
      {steps.map((step, index) => (
        <StepCard
          key={`step-${index}-${step.stepNumber}`}
          step={step}
          index={index}
          total={steps.length}
          onUpdate={(updated) => updateStep(index, updated)}
          onRemove={() => removeStep(index)}
          onMoveUp={() => moveStep(index, index - 1)}
          onMoveDown={() => moveStep(index, index + 1)}
        />
      ))}

      <Button variant="outline" onClick={addStep} className="w-full">
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        Add Step
      </Button>
    </div>
  );
}
