import * as fs from "fs";
import * as path from "path";
import { aiJSON } from "@/lib/ai/claude";
import { cacheGet } from "@/lib/redis";
import { API_DOCS_REGISTRY, DocsSnapshot } from "@/lib/qa/docs-registry";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuditResult {
  api: string;
  status: "pass" | "fail" | "warning";
  missingFields: string[];
  typeMismatches: string[];
  missingRelationships: string[];
  warnings: string[];
}

interface SchemaAuditResponse {
  results: AuditResult[];
}

// ---------------------------------------------------------------------------
// runSchemaAudit — Audit Prisma schema completeness against API docs
// ---------------------------------------------------------------------------

export async function runSchemaAudit(): Promise<AuditResult[]> {
  // Read the Prisma schema from disk
  const schemaPath = path.resolve(
    process.cwd(),
    "prisma",
    "schema.prisma"
  );
  const schemaContent = fs.readFileSync(schemaPath, "utf-8");

  // Gather cached doc snapshots for all registered APIs
  const apiNames = Object.keys(API_DOCS_REGISTRY);
  const docSummaries: Array<{ api: string; content: string }> = [];

  for (const apiName of apiNames) {
    const snapshot = await cacheGet<DocsSnapshot>(
      `docsSnapshots:${apiName}`
    );
    if (snapshot) {
      // Truncate to keep within token limits
      docSummaries.push({
        api: apiName,
        content: snapshot.content.slice(0, 20_000),
      });
    }
  }

  if (docSummaries.length === 0) {
    return apiNames.map((api) => ({
      api,
      status: "warning" as const,
      missingFields: [],
      typeMismatches: [],
      missingRelationships: [],
      warnings: ["No cached documentation available — run refreshAllDocs first"],
    }));
  }

  const docsContext = docSummaries
    .map((d) => `=== ${d.api} API Documentation ===\n${d.content}`)
    .join("\n\n");

  const { data } = await aiJSON<SchemaAuditResponse>({
    system: [
      "You are a database schema auditor for a CRM system that integrates with multiple",
      "third-party APIs. Your job is to compare the Prisma schema against API documentation",
      "and identify gaps.\n\n",
      "For each API, check:\n",
      "1. Missing fields: API response fields that should be stored but have no matching",
      "   column in the Prisma schema.\n",
      "2. Type mismatches: Fields where the Prisma type does not match the API field type",
      "   (e.g., String vs Int, missing DateTime for timestamp fields).\n",
      "3. Missing relationships: Related entities in the API that lack foreign keys or",
      "   relation definitions in the schema.\n",
      "4. Warnings: Any other concerns (deprecated fields still present, naming",
      "   inconsistencies, missing indexes for frequently queried API fields).\n\n",
      "Set status to 'pass' if no issues, 'fail' if there are missing fields or type",
      "mismatches, 'warning' if there are only minor concerns.",
    ].join(""),
    messages: [
      {
        role: "user",
        content: [
          "=== PRISMA SCHEMA ===",
          schemaContent,
          "",
          "=== API DOCUMENTATION SNAPSHOTS ===",
          docsContext,
          "",
          "Audit the Prisma schema for completeness against each API.",
          "Return JSON: { \"results\": [{ \"api\": string, \"status\": \"pass\" | \"fail\" | \"warning\",",
          "\"missingFields\": string[], \"typeMismatches\": string[],",
          "\"missingRelationships\": string[], \"warnings\": string[] }] }",
          "",
          "Include an entry for every API listed above, even if it passes.",
        ].join("\n"),
      },
    ],
    maxTokens: 8192,
    temperature: 0.1,
  });

  return data.results;
}
