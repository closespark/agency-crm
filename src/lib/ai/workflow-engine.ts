import { prisma } from "@/lib/prisma";
import { scoreContact } from "./lead-scorer";
import { analyzeReply } from "./reply-analyzer";
import { runAIJob } from "./job-runner";
import { safeParseJSON } from "@/lib/safe-json";
import { getKey } from "@/lib/integration-keys";

// ── Integration checks ───────────────────────────────────────────────────

const INTEGRATION_REQUIREMENTS: Partial<Record<ActionType, string[]>> = {
  send_email: ["GOOGLE_CLIENT_ID"],
  ai_analyze: ["ANTHROPIC_API_KEY"],
  score_contact: ["ANTHROPIC_API_KEY"],
};

async function checkIntegration(actionType: ActionType): Promise<boolean> {
  const required = INTEGRATION_REQUIREMENTS[actionType];
  if (!required) return true;
  for (const key of required) {
    const val = await getKey(key);
    if (!val) {
      console.warn(`[workflow] Skipping "${actionType}" — missing integration: ${key}`);
      return false;
    }
  }
  return true;
}

// ── Trigger types ──────────────────────────────────────────────────────────

export type TriggerType =
  | "contact_created"
  | "contact_stage_changed"
  | "deal_stage_changed"
  | "email_replied"
  | "lead_score_threshold"
  | "form_submitted"
  | "meeting_booked"
  | "no_activity"
  | "sequence_completed";

export interface WorkflowTrigger {
  type: TriggerType;
  conditions?: Record<string, unknown>;
}

// ── Action types ───────────────────────────────────────────────────────────

export type ActionType =
  | "send_email"
  | "enroll_in_sequence"
  | "update_lifecycle_stage"
  | "update_lead_status"
  | "create_task"
  | "create_deal"
  | "score_contact"
  | "send_notification"
  | "add_to_list"
  | "ai_analyze"
  | "webhook"
  | "wait";

export interface WorkflowAction {
  type: ActionType;
  config: Record<string, unknown>;
}

// ── Event structure ────────────────────────────────────────────────────────

export interface WorkflowEvent {
  type: string;
  data: Record<string, unknown>;
}

// ── Context passed through action execution ────────────────────────────────

export interface ActionContext {
  contactId?: string;
  dealId?: string;
  data: Record<string, unknown>;
}

// ── Trigger evaluator ──────────────────────────────────────────────────────

export function evaluateTrigger(
  trigger: WorkflowTrigger,
  event: WorkflowEvent
): boolean {
  // Event type must match the trigger type
  if (trigger.type !== event.type) return false;

  const conditions = trigger.conditions || {};

  switch (trigger.type) {
    case "contact_created":
      // No additional conditions needed — any contact creation matches
      return true;

    case "contact_stage_changed": {
      const { from, to } = conditions as { from?: string; to?: string };
      if (from && event.data.from !== from) return false;
      if (to && event.data.to !== to) return false;
      return true;
    }

    case "deal_stage_changed": {
      const { from, to } = conditions as { from?: string; to?: string };
      if (from && event.data.from !== from) return false;
      if (to && event.data.to !== to) return false;
      return true;
    }

    case "email_replied":
      return true;

    case "lead_score_threshold": {
      const { above, below } = conditions as {
        above?: number;
        below?: number;
      };
      const score = event.data.score as number;
      if (above !== undefined && score < above) return false;
      if (below !== undefined && score > below) return false;
      return true;
    }

    case "form_submitted": {
      const { formId } = conditions as { formId?: string };
      if (formId && event.data.formId !== formId) return false;
      return true;
    }

    case "meeting_booked":
      return true;

    case "no_activity": {
      const { days } = conditions as { days?: number };
      const daysSince = event.data.daysSinceActivity as number;
      if (days && daysSince < days) return false;
      return true;
    }

    case "sequence_completed": {
      const { sequenceId } = conditions as { sequenceId?: string };
      if (sequenceId && event.data.sequenceId !== sequenceId) return false;
      return true;
    }

    default:
      return false;
  }
}

// ── Action executor ────────────────────────────────────────────────────────

export async function executeAction(
  action: WorkflowAction,
  context: ActionContext
): Promise<"wait" | void> {
  const integrationOk = await checkIntegration(action.type);
  if (!integrationOk) return;

  switch (action.type) {
    case "send_email": {
      const config = action.config as {
        templateId?: string;
        contactId?: string;
        aiGenerate?: boolean;
        purpose?: string;
        tone?: string;
      };
      const targetContactId = config.contactId || context.contactId;
      if (!targetContactId) return;

      const contact = await prisma.contact.findUnique({
        where: { id: targetContactId },
        select: { email: true, firstName: true, lastName: true, domainTier: true },
      });
      if (!contact?.email) break;

      let emailContent: { subject: string; body: string } | null = null;

      if (config.aiGenerate) {
        const result = await runAIJob(
          "email_composer",
          "workflow_email",
          {
            contactId: targetContactId,
            purpose: config.purpose || "follow_up",
            tone: config.tone || "professional",
          },
          { contactId: targetContactId }
        );
        emailContent = result.output as { subject: string; body: string };
      } else if (config.templateId) {
        // Fetch template from database and render with contact data
        const template = await prisma.emailTemplate.findUnique({
          where: { id: config.templateId },
        });
        if (!template) {
          console.error(`Workflow send_email: template ${config.templateId} not found`);
          break;
        }
        // Replace merge fields: {{firstName}}, {{lastName}}, {{company}}, {{email}}
        const renderTemplate = (text: string) =>
          text
            .replace(/\{\{firstName\}\}/g, contact.firstName || "")
            .replace(/\{\{lastName\}\}/g, contact.lastName || "")
            .replace(/\{\{email\}\}/g, contact.email || "");
        emailContent = {
          subject: renderTemplate(template.subject),
          body: renderTemplate(template.body),
        };
      }

      if (emailContent) {
        if (!emailContent.body) {
          console.error("Workflow send_email: refusing to send email with empty body");
          break;
        }

        // Send via Gmail — if this fails, the email was NOT sent. Do not log as sent.
        const { sendEmail } = await import("@/lib/integrations/gmail");
        await sendEmail({
          to: contact.email,
          subject: emailContent.subject,
          body: emailContent.body,
        });

        // Only log activity AFTER successful send
        const systemUser = await prisma.user.findFirst();
        if (systemUser) {
          await prisma.activity.create({
            data: {
              type: "email",
              subject: emailContent.subject,
              body: emailContent.body,
              contactId: targetContactId,
              userId: systemUser.id,
            },
          });
        }
      }
      break;
    }

    case "enroll_in_sequence": {
      const config = action.config as { sequenceId: string };
      const contactId = context.contactId;
      if (!contactId || !config.sequenceId) return;

      const { enrollContactInSequence } = await import("./sequence-enrollment");
      await enrollContactInSequence({
        sequenceId: config.sequenceId,
        contactId,
      });
      break;
    }

    case "update_lifecycle_stage": {
      const config = action.config as { stage: string };
      const contactId = context.contactId;
      if (!contactId || !config.stage) return;

      // Use lifecycle engine for forward-only enforcement + audit trail
      const { advanceContactStage } = await import("./lifecycle-engine");
      await advanceContactStage(contactId, config.stage as any, "workflow", `Workflow action: advance to ${config.stage}`);
      break;
    }

    case "update_lead_status": {
      const config = action.config as { status: string };
      const contactId = context.contactId;
      if (!contactId || !config.status) return;

      await prisma.contact.update({
        where: { id: contactId },
        data: { leadStatus: config.status },
      });
      break;
    }

    case "create_task": {
      const config = action.config as {
        title: string;
        type?: string;
        priority?: string;
        dueInDays?: number;
      };

      const dueDate = config.dueInDays
        ? new Date(Date.now() + config.dueInDays * 86400000)
        : undefined;

      const taskUser = await prisma.user.findFirst();
      if (taskUser) {
        await prisma.task.create({
          data: {
            title: config.title,
            type: config.type || "todo",
            priority: config.priority || "medium",
            status: "pending",
            dueDate,
            contactId: context.contactId || null,
            userId: taskUser.id,
          },
        });
      }
      break;
    }

    case "create_deal": {
      const config = action.config as {
        name: string;
        stage?: string;
        pipeline?: string;
      };
      const contactId = context.contactId;
      if (!contactId) return;

      await prisma.deal.create({
        data: {
          name: config.name,
          stage: config.stage || "discovery",
          pipeline: config.pipeline || "new_business",
          contactId,
          amount: 0,
        },
      });
      break;
    }

    case "score_contact": {
      const contactId = context.contactId;
      if (!contactId) return;
      await scoreContact(contactId);
      break;
    }

    case "send_notification": {
      const config = action.config as { title: string; body: string };

      // Send notification to the first user (system user)
      const notifUser = await prisma.user.findFirst();
      if (notifUser) {
        await prisma.notification.create({
          data: {
            type: "workflow",
            title: config.title || "Workflow Notification",
            body: config.body || "",
            userId: notifUser.id,
          },
        });
      }
      break;
    }

    case "add_to_list": {
      const config = action.config as { listId: string };
      const contactId = context.contactId;
      if (!contactId || !config.listId) return;

      const existingMembership = await prisma.listMembership.findFirst({
        where: { listId: config.listId, contactId },
      });

      if (!existingMembership) {
        await prisma.listMembership.create({
          data: { listId: config.listId, contactId },
        });
      }
      break;
    }

    case "ai_analyze": {
      const config = action.config as {
        type: "reply" | "deal" | "contact";
      };

      if (config.type === "reply" && context.data.content) {
        await analyzeReply(
          context.data.content as string,
          context.contactId
        );
      } else if (config.type === "contact" && context.contactId) {
        await scoreContact(context.contactId);
      } else if (config.type === "deal" && context.dealId) {
        await runAIJob(
          "deal_advisor",
          "deal_analysis",
          { dealId: context.dealId },
          { dealId: context.dealId }
        );
      }
      break;
    }

    case "webhook": {
      const config = action.config as {
        url: string;
        method?: string;
        headers?: Record<string, string>;
        body?: Record<string, unknown>;
      };

      try {
        await fetch(config.url, {
          method: config.method || "POST",
          headers: {
            "Content-Type": "application/json",
            ...(config.headers || {}),
          },
          body: JSON.stringify(config.body || context.data),
        });
      } catch (err) {
        console.error(`Workflow webhook action failed for ${config.url}:`, err);
      }
      break;
    }

    case "wait": {
      // Schedule the remaining actions for later execution via a pending workflow task
      const waitConfig = action.config as { delayMinutes?: number; delayHours?: number; delayDays?: number };
      const delayMs =
        (waitConfig.delayMinutes || 0) * 60 * 1000 +
        (waitConfig.delayHours || 0) * 60 * 60 * 1000 +
        (waitConfig.delayDays || 0) * 24 * 60 * 60 * 1000;

      if (delayMs > 0) {
        // Create a scheduled task that will resume workflow execution after the delay
        const waitUser = await prisma.user.findFirst();
        if (waitUser) {
          await prisma.task.create({
            data: {
              title: `Workflow wait: resume after ${waitConfig.delayDays || 0}d ${waitConfig.delayHours || 0}h ${waitConfig.delayMinutes || 0}m`,
              type: "workflow_resume",
              priority: "medium",
              status: "pending",
              dueDate: new Date(Date.now() + delayMs),
              contactId: context.contactId || null,
              userId: waitUser.id,
              description: JSON.stringify({
                waitAction: true,
                resumeAfter: new Date(Date.now() + delayMs).toISOString(),
                context,
              }),
            },
          });
        }
      }
      // Signal caller to stop executing remaining actions
      return "wait";
    }

    default:
      break;
  }
}

// ── Main workflow processor ────────────────────────────────────────────────

export async function processWorkflows(event: WorkflowEvent): Promise<number> {
  // Fetch all active workflows
  const workflows = await prisma.workflow.findMany({
    where: { isActive: true },
  });

  let executedCount = 0;

  for (const workflow of workflows) {
    let trigger: WorkflowTrigger;
    let actions: WorkflowAction[];

    try {
      trigger =
        typeof workflow.trigger === "string"
          ? safeParseJSON(workflow.trigger, {} as WorkflowTrigger)
          : (workflow.trigger as unknown as WorkflowTrigger);
      actions =
        typeof workflow.actions === "string"
          ? safeParseJSON(workflow.actions, [] as WorkflowAction[])
          : (workflow.actions as unknown as WorkflowAction[]);
    } catch (err) {
      console.error(`Workflow "${workflow.name}" has invalid JSON config:`, err);
      continue;
    }

    if (!evaluateTrigger(trigger, event)) continue;

    // Build execution context from event data
    const context: ActionContext = {
      contactId: event.data.contactId as string | undefined,
      dealId: event.data.dealId as string | undefined,
      data: event.data,
    };

    // Execute each action in sequence — stop if a wait action is hit
    for (let i = 0; i < actions.length; i++) {
      try {
        const result = await executeAction(actions[i], context);
        if (result === "wait") {
          // Store remaining actions (after the wait) in the task for later resume
          const remainingActions = actions.slice(i + 1);
          if (remainingActions.length > 0) {
            // Update the most recent workflow_resume task with remaining actions
            const resumeTask = await prisma.task.findFirst({
              where: { type: "workflow_resume", status: "pending" },
              orderBy: { createdAt: "desc" },
            });
            if (resumeTask) {
              const existing = JSON.parse(resumeTask.description || "{}");
              await prisma.task.update({
                where: { id: resumeTask.id },
                data: {
                  description: JSON.stringify({
                    ...existing,
                    remainingActions,
                    context,
                  }),
                },
              });
            }
          }
          break;
        }
      } catch (err) {
        console.error(
          `Workflow "${workflow.name}" action "${actions[i].type}" failed:`, err
        );
      }
    }

    // Update the workflow stats
    await prisma.workflow.update({
      where: { id: workflow.id },
      data: {
        lastRunAt: new Date(),
        runCount: { increment: 1 },
      },
    });

    executedCount++;
  }

  return executedCount;
}
