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
  angle: string;
  goal: string;
  objectionToAddress?: string;
  tone?: string;
  // Legacy fields for backward compat
  subject?: string;
  body?: string;
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

  const stepLabel = step.angle
    ? step.angle.length > 50
      ? step.angle.slice(0, 50) + "..."
      : step.angle
    : step.channel === "email"
      ? step.subject || "Email Step"
      : step.channel === "linkedin"
        ? "LinkedIn Message"
        : "Phone Call";

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
            {stepLabel}
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

          <Textarea
            label="Angle / Approach"
            placeholder="What insight or value should this step lead with? e.g., 'Reference their HubSpot migration pain from the discovery call and position our workflow automation as the fix'"
            rows={3}
            value={step.angle || ""}
            onChange={(e) => onUpdate({ ...step, angle: e.target.value })}
          />

          <Input
            label="Goal"
            placeholder="What outcome do you want? e.g., 'Book a follow-up demo' or 'Get confirmation they'll review the proposal'"
            value={step.goal || ""}
            onChange={(e) => onUpdate({ ...step, goal: e.target.value })}
          />

          <Input
            label="Objection to Address (optional)"
            placeholder="e.g., 'competing priorities' or 'budget concerns'"
            value={step.objectionToAddress || ""}
            onChange={(e) =>
              onUpdate({ ...step, objectionToAddress: e.target.value })
            }
          />

          <Input
            label="Tone (optional)"
            placeholder="e.g., 'direct and specific' or 'empathetic, peer-to-peer'"
            value={step.tone || ""}
            onChange={(e) => onUpdate({ ...step, tone: e.target.value })}
          />

          <div className="rounded-md bg-emerald-50 p-3 text-xs text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">
            The actual email copy will be generated per-contact at enrollment time using their discovery call transcript, BANT data, engagement history, company intel, and fit score.
          </div>
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
      angle: "",
      goal: "",
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
    onChange(newSteps.map((s, i) => ({ ...s, stepNumber: i + 1 })));
  }

  function moveStep(from: number, to: number) {
    if (to < 0 || to >= steps.length) return;
    const newSteps = [...steps];
    const [moved] = newSteps.splice(from, 1);
    newSteps.splice(to, 0, moved);
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
