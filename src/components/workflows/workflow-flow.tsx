"use client";

import { Badge } from "@/components/ui/badge";
import { TRIGGER_TYPES } from "./trigger-config";
import { ACTION_TYPES } from "./action-config";

interface WorkflowFlowProps {
  trigger: { type: string; conditions?: Record<string, unknown> };
  actions: { type: string; config: Record<string, unknown> }[];
}

function getTriggerLabel(type: string): string {
  return TRIGGER_TYPES.find((t) => t.value === type)?.label || type;
}

function getActionLabel(type: string): string {
  return ACTION_TYPES.find((a) => a.value === type)?.label || type;
}

function TriggerDescription({ trigger }: { trigger: WorkflowFlowProps["trigger"] }) {
  const cond = trigger.conditions || {};
  const parts: string[] = [];

  if (trigger.type === "contact_stage_changed" || trigger.type === "deal_stage_changed") {
    if (cond.from) parts.push(`from "${cond.from}"`);
    if (cond.to) parts.push(`to "${cond.to}"`);
  }
  if (trigger.type === "lead_score_threshold") {
    if (cond.above !== undefined) parts.push(`above ${cond.above}`);
    if (cond.below !== undefined) parts.push(`below ${cond.below}`);
  }
  if (trigger.type === "no_activity" && cond.days) {
    parts.push(`${cond.days} days`);
  }

  return parts.length > 0 ? (
    <span className="text-xs text-zinc-400">{parts.join(", ")}</span>
  ) : null;
}

function ActionDescription({ action }: { action: WorkflowFlowProps["actions"][0] }) {
  const cfg = action.config;
  let detail = "";

  switch (action.type) {
    case "send_email":
      detail = cfg.aiGenerate ? "AI-generated" : `Template: ${cfg.templateId || "—"}`;
      break;
    case "update_lifecycle_stage":
      detail = cfg.stage as string || "";
      break;
    case "update_lead_status":
      detail = cfg.status as string || "";
      break;
    case "create_task":
      detail = cfg.title as string || "";
      break;
    case "create_deal":
      detail = cfg.name as string || "";
      break;
    case "wait":
      detail = `${cfg.days || "?"} day(s)`;
      break;
    case "webhook":
      detail = cfg.url as string || "";
      break;
    case "ai_analyze":
      detail = cfg.type as string || "";
      break;
    default:
      break;
  }

  return detail ? <span className="text-xs text-zinc-400 truncate max-w-[200px] block">{detail}</span> : null;
}

export function WorkflowFlow({ trigger, actions }: WorkflowFlowProps) {
  return (
    <div className="flex flex-col items-center gap-0">
      {/* Trigger node */}
      <div className="flex w-full max-w-sm flex-col items-center rounded-lg border-2 border-blue-300 bg-blue-50 px-4 py-3 dark:border-blue-700 dark:bg-blue-950">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-blue-500" />
          <span className="text-sm font-semibold text-blue-800 dark:text-blue-200">
            {getTriggerLabel(trigger.type)}
          </span>
        </div>
        <TriggerDescription trigger={trigger} />
        <Badge variant="default" className="mt-1">
          Trigger
        </Badge>
      </div>

      {/* Connector lines and action nodes */}
      {actions.map((action, idx) => (
        <div key={idx} className="flex flex-col items-center">
          {/* Connector */}
          <div className="h-6 w-0.5 bg-zinc-300 dark:bg-zinc-600" />
          <svg className="h-3 w-3 text-zinc-300 dark:text-zinc-600" viewBox="0 0 12 8" fill="currentColor">
            <polygon points="6,8 0,0 12,0" />
          </svg>

          {/* Action node */}
          <div className="flex w-full max-w-sm flex-col items-center rounded-lg border-2 border-green-300 bg-green-50 px-4 py-3 dark:border-green-700 dark:bg-green-950">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-green-500" />
              <span className="text-sm font-semibold text-green-800 dark:text-green-200">
                {getActionLabel(action.type)}
              </span>
            </div>
            <ActionDescription action={action} />
            <Badge variant="success" className="mt-1">
              Step {idx + 1}
            </Badge>
          </div>
        </div>
      ))}

      {actions.length === 0 && (
        <div className="mt-4 text-sm text-zinc-400">No actions configured yet</div>
      )}
    </div>
  );
}
