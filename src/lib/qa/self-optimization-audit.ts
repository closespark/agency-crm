// Layer 4 (of QA) — Self-Optimization Integrity Audit
// Validates that the self-learning layer can't silently corrupt system behavior.
// Runs as part of the Sunday pre-optimization check.

import { aiJSON } from "@/lib/ai/claude";
import * as fs from "fs";
import * as path from "path";

export interface SelfOptAuditResult {
  functionName: string;
  file: string;
  status: "pass" | "fail" | "warning";
  issues: string[];
}

export interface SelfOptAuditReport {
  status: "pass" | "fail" | "warning";
  results: SelfOptAuditResult[];
  criticalIssues: string[];
  timestamp: string;
}

// Files that contain self-modification logic
const SELF_OPT_FILES = [
  "src/lib/ai/self-optimization-engine.ts",
  "src/lib/ai/scoring-feedback.ts",
  "src/lib/ai/score-decay.ts",
  "src/lib/ai/icp-engine.ts",
  "src/lib/ai/lifecycle-engine.ts",
  "src/lib/ai/optimization-thresholds.ts",
];

export async function runSelfOptimizationAudit(): Promise<SelfOptAuditReport> {
  const rootDir = process.cwd();
  const fileContents: Record<string, string> = {};

  for (const filePath of SELF_OPT_FILES) {
    const fullPath = path.join(rootDir, filePath);
    try {
      fileContents[filePath] = fs.readFileSync(fullPath, "utf-8");
    } catch {
      // File doesn't exist — skip
    }
  }

  if (Object.keys(fileContents).length === 0) {
    return {
      status: "warning",
      results: [],
      criticalIssues: ["No self-optimization files found"],
      timestamp: new Date().toISOString(),
    };
  }

  const { data } = await aiJSON<{
    results: SelfOptAuditResult[];
    criticalIssues: string[];
  }>({
    system: `You are a self-optimization integrity auditor for AgencyCRM.

AgencyCRM automatically rewrites its own scoring weights, ICP model, sequence steps, and StageGate thresholds. A bug in this layer doesn't just cause an error — it causes the system to optimize in the wrong direction for weeks before detection.

For each function in the provided code, verify:
1. Minimum sample threshold is enforced before any change is made
2. Changes are written to versioned tables, not overwriting history
3. Every change is logged with the data that drove it (SystemChangelog)
4. The function cannot produce a value outside valid bounds (scores 0-100, probabilities 0-1, no negative weights)
5. A rollback mechanism exists if the change degrades performance
6. The function reads from closed deal data, not open pipeline data
7. Decay functions run before scoring functions in execution order
8. No circular dependencies exist between optimization functions

Flag any function that can silently corrupt system behavior.

Return JSON: { "results": [{ "functionName": string, "file": string, "status": "pass"|"fail"|"warning", "issues": string[] }], "criticalIssues": string[] }`,
    messages: [
      {
        role: "user",
        content: `Audit these self-optimization files:\n\n${Object.entries(fileContents)
          .map(([f, c]) => `=== ${f} ===\n${c.substring(0, 8000)}`)
          .join("\n\n")}`,
      },
    ],
    maxTokens: 4096,
    temperature: 0.3,
  });

  const overallStatus = data.criticalIssues.length > 0
    ? "fail"
    : data.results.some((r) => r.status === "fail")
      ? "fail"
      : data.results.some((r) => r.status === "warning")
        ? "warning"
        : "pass";

  return {
    status: overallStatus,
    results: data.results,
    criticalIssues: data.criticalIssues,
    timestamp: new Date().toISOString(),
  };
}
