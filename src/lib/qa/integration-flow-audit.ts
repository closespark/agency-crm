import * as fs from "fs/promises";
import * as path from "path";
import { aiJSON } from "@/lib/ai/claude";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FlowStep {
  from: string;
  to: string;
  fieldsTransferred: string[];
  fieldsDropped: string[];
  typeMismatches: string[];
  errorHandlingGaps: string[];
}

export interface FlowAuditResult {
  workflow: string;
  steps: FlowStep[];
  status: "pass" | "fail";
  criticalGaps: string[];
}

// ---------------------------------------------------------------------------
// Workflow definitions
// ---------------------------------------------------------------------------

interface WorkflowDefinition {
  name: string;
  description: string;
  /** Ordered list of source files involved in this workflow chain. */
  files: string[];
}

const PROJECT_ROOT = process.cwd();

function src(...segments: string[]): string {
  return path.resolve(PROJECT_ROOT, "src", ...segments);
}

/**
 * The six canonical integration workflows from the spec.
 */
export const WORKFLOWS: WorkflowDefinition[] = [
  {
    name: "Apollo -> Contact -> Sequence",
    description:
      "Prospect discovered in Apollo is created as a Contact, then enrolled into an outbound sequence via Instantly/Meet Alfred.",
    files: [
      src("lib/integrations/apollo.ts"),
      src("lib/ai/prospector.ts"),
      src("lib/integrations/instantly.ts"),
      src("lib/integrations/meet-alfred.ts"),
    ],
  },
  {
    name: "Reply -> BANT -> Lifecycle",
    description:
      "An inbound reply is analyzed for BANT signals, scores are updated, and the contact lifecycle stage advances.",
    files: [
      src("lib/ai/reply-analyzer.ts"),
      src("lib/ai/bant-extractor.ts"),
      src("lib/ai/lead-scorer.ts"),
      src("lib/ai/lifecycle-engine.ts"),
    ],
  },
  {
    name: "Meeting Booked -> Brief -> Follow-up",
    description:
      "A Google Calendar meeting is detected, a meeting brief is generated, and post-meeting follow-up tasks are created.",
    files: [
      src("lib/integrations/google-calendar.ts"),
      src("lib/ai/meeting-brief.ts"),
      src("lib/ai/meeting-lifecycle.ts"),
    ],
  },
  {
    name: "Call -> Transcript -> Deal Update",
    description:
      "A VAPI/tl;dv call is recorded, transcript is processed, and the deal record is updated with extracted insights.",
    files: [
      src("lib/integrations/vapi.ts"),
      src("lib/integrations/tldv.ts"),
      src("lib/ai/deal-advisor.ts"),
    ],
  },
  {
    name: "Proposal -> Signature -> Invoice",
    description:
      "A PandaDocs proposal is sent, signature is captured, and a Stripe invoice is created upon signing.",
    files: [
      src("lib/integrations/pandadocs.ts"),
      src("lib/integrations/stripe.ts"),
    ],
  },
  {
    name: "Signal -> Score Decay -> Re-engagement",
    description:
      "Engagement signals are monitored, score decay is applied to stale contacts, and re-engagement sequences are triggered.",
    files: [
      src("lib/ai/signal-monitor.ts"),
      src("lib/ai/score-decay.ts"),
      src("lib/ai/channel-coordinator.ts"),
      src("lib/integrations/instantly.ts"),
    ],
  },
];

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

const INTEGRATION_FLOW_PROMPT = `You are an integration-flow auditor for a CRM system.

You will be given the source code for a sequence of files that form a data workflow.
Trace the data as it moves from one module to the next and identify:

1. **Fields transferred** — data fields that are correctly passed between each pair of consecutive steps.
2. **Fields dropped** — data fields available in the source step but not forwarded to the next step when they should be.
3. **Type mismatches** — fields where the producing step outputs one type but the consuming step expects a different type.
4. **Error handling gaps** — places where a failure in one step would leave the next step in an inconsistent state (e.g., no try/catch, no rollback, no retry, no fallback).

For each consecutive pair of files (step N -> step N+1), produce an object:
{
  "from": "<filename of step N>",
  "to": "<filename of step N+1>",
  "fieldsTransferred": [...],
  "fieldsDropped": [...],
  "typeMismatches": [...],
  "errorHandlingGaps": [...]
}

Then produce an overall status:
- "pass" if there are no dropped fields, no type mismatches, and no critical error handling gaps.
- "fail" otherwise.

Also list any criticalGaps — the most severe issues that could cause data loss or silent failures.

Respond with a single JSON object:
{
  "steps": [...],
  "status": "pass" | "fail",
  "criticalGaps": [...]
}`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function readFileSafe(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch {
    return `// FILE NOT FOUND: ${filePath}`;
  }
}

// ---------------------------------------------------------------------------
// Main audit
// ---------------------------------------------------------------------------

/**
 * Run the Integration Flow audit across all defined workflows.
 */
export async function runIntegrationFlowAudit(): Promise<FlowAuditResult[]> {
  const results: FlowAuditResult[] = [];

  for (const workflow of WORKFLOWS) {
    // Read all source files in the chain
    const fileSources: Array<{ name: string; content: string }> = [];
    for (const filePath of workflow.files) {
      const content = await readFileSafe(filePath);
      fileSources.push({
        name: path.basename(filePath),
        content,
      });
    }

    // Build the prompt content
    const fileBlocks = fileSources
      .map(
        (f, idx) =>
          `### Step ${idx + 1}: ${f.name}\n\`\`\`typescript\n${f.content}\n\`\`\``
      )
      .join("\n\n");

    const { data } = await aiJSON<{
      steps: FlowStep[];
      status: "pass" | "fail";
      criticalGaps: string[];
    }>({
      system: INTEGRATION_FLOW_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            `## Workflow: ${workflow.name}`,
            "",
            workflow.description,
            "",
            fileBlocks,
            "",
            "Trace the data handoffs and return the JSON analysis.",
          ].join("\n"),
        },
      ],
      maxTokens: 4096,
      temperature: 0.2,
    });

    results.push({
      workflow: workflow.name,
      steps: data.steps ?? [],
      status: data.status ?? "fail",
      criticalGaps: data.criticalGaps ?? [],
    });
  }

  return results;
}
