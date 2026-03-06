// Layer 3 — Pre-Deploy QA Orchestrator
// Runs all audit layers in parallel and gates deployment on results.
// Called by the CI hook before Railway deployment.

import { prisma } from "@/lib/prisma";

export interface QAOrchestratorResult {
  deploy: boolean;
  status: "pass" | "fail" | "warning";
  failures: AuditFailure[];
  warnings: AuditWarning[];
  duration: number;
  timestamp: string;
}

interface AuditFailure {
  layer: string;
  details: string;
}

interface AuditWarning {
  layer: string;
  details: string;
}

/**
 * Run the full pre-deploy QA suite.
 * Returns { deploy: false } if any audit fails — blocks deployment.
 * Returns { deploy: true } with warnings if all pass but some have warnings.
 */
export async function runPreDeployQA(commitDiff?: string): Promise<QAOrchestratorResult> {
  const startTime = Date.now();
  const failures: AuditFailure[] = [];
  const warnings: AuditWarning[] = [];

  // Run all audits in parallel
  const results = await Promise.allSettled([
    runSchemaAuditSafe(),
    runFunctionIdentityAuditSafe(commitDiff),
    runIntegrationFlowAuditSafe(),
    runSelfOptimizationAuditSafe(),
  ]);

  // Process results
  for (const result of results) {
    if (result.status === "rejected") {
      failures.push({
        layer: "unknown",
        details: `Audit threw an error: ${result.reason}`,
      });
      continue;
    }

    const audit = result.value;
    if (audit.status === "fail") {
      failures.push({ layer: audit.layer, details: audit.summary });
    } else if (audit.status === "warning") {
      warnings.push({ layer: audit.layer, details: audit.summary });
    }
  }

  const deploy = failures.length === 0;
  const status = failures.length > 0 ? "fail" : warnings.length > 0 ? "warning" : "pass";
  const duration = Date.now() - startTime;

  // Log to SystemChangelog
  await prisma.systemChangelog.create({
    data: {
      category: "qa",
      changeType: deploy ? "pre_deploy_passed" : "pre_deploy_blocked",
      description: deploy
        ? `Pre-deploy QA passed${warnings.length > 0 ? ` with ${warnings.length} warnings` : ""}. Duration: ${duration}ms.`
        : `Pre-deploy QA BLOCKED deployment. ${failures.length} failures. Duration: ${duration}ms.`,
      dataEvidence: JSON.stringify({ failures, warnings, duration }),
    },
  });

  return {
    deploy,
    status,
    failures,
    warnings,
    duration,
    timestamp: new Date().toISOString(),
  };
}

// Wrapper type for audit results
interface AuditLayerResult {
  layer: string;
  status: "pass" | "fail" | "warning";
  summary: string;
}

async function runSchemaAuditSafe(): Promise<AuditLayerResult> {
  try {
    const { runSchemaAudit } = await import("./schema-audit");
    const result = await runSchemaAudit();
    const failCount = result.filter((r) => r.status === "fail").length;
    const warnCount = result.filter((r) => r.status === "warning").length;
    return {
      layer: "schema",
      status: failCount > 0 ? "fail" : warnCount > 0 ? "warning" : "pass",
      summary: `${failCount} failures, ${warnCount} warnings across ${result.length} APIs`,
    };
  } catch (err) {
    return {
      layer: "schema",
      status: "warning",
      summary: `Schema audit error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

async function runFunctionIdentityAuditSafe(commitDiff?: string): Promise<AuditLayerResult> {
  try {
    const { runFunctionIdentityAudit } = await import("./function-audit");
    const result = await runFunctionIdentityAudit(commitDiff);
    const incorrectCount = result.filter((r) => r.status === "incorrect").length;
    const ambiguousCount = result.filter((r) => r.status === "ambiguous").length;
    return {
      layer: "function_identity",
      status: incorrectCount > 0 ? "fail" : ambiguousCount > 0 ? "warning" : "pass",
      summary: `${incorrectCount} incorrect, ${ambiguousCount} ambiguous across ${result.length} functions`,
    };
  } catch (err) {
    return {
      layer: "function_identity",
      status: "warning",
      summary: `Function audit error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

async function runIntegrationFlowAuditSafe(): Promise<AuditLayerResult> {
  try {
    const { runIntegrationFlowAudit } = await import("./integration-flow-audit");
    const result = await runIntegrationFlowAudit();
    const failCount = result.filter((r) => r.status === "fail").length;
    return {
      layer: "integration_flow",
      status: failCount > 0 ? "fail" : "pass",
      summary: `${failCount} workflow failures across ${result.length} workflows`,
    };
  } catch (err) {
    return {
      layer: "integration_flow",
      status: "warning",
      summary: `Integration flow audit error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

async function runSelfOptimizationAuditSafe(): Promise<AuditLayerResult> {
  try {
    const { runSelfOptimizationAudit } = await import("./self-optimization-audit");
    const result = await runSelfOptimizationAudit();
    return {
      layer: "self_optimization",
      status: result.status,
      summary: `${result.criticalIssues.length} critical issues across ${result.results.length} functions`,
    };
  } catch (err) {
    return {
      layer: "self_optimization",
      status: "warning",
      summary: `Self-optimization audit error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
