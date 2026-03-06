import * as fs from "fs/promises";
import * as path from "path";
import { glob } from "glob";
import { aiJSON } from "@/lib/ai/claude";
import { cacheGet } from "@/lib/redis";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FunctionAuditResult {
  functionName: string;
  targetApi: string;
  targetEndpoint: string;
  status: "correct" | "incorrect" | "ambiguous";
  issues: string[];
  recommendation: string;
}

interface ApiDocSnapshot {
  apiName: string;
  endpoints: Array<{
    method: string;
    path: string;
    requiredFields: string[];
    optionalFields: string[];
    responseShape: Record<string, string>;
  }>;
  lastUpdated: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const INTEGRATIONS_DIR = path.resolve(
  process.cwd(),
  "src/lib/integrations"
);

const FUNCTION_IDENTITY_PROMPT = `You are a code auditor specializing in API integration correctness.

Given the source code of an integration file and the corresponding API documentation snapshot, analyze every exported function that makes an API call.

For each function, verify:
1. The HTTP method matches the documented endpoint method.
2. Required fields in the request payload are present and correctly named.
3. The endpoint URL pattern matches the documented path (including path params).
4. Response handling accounts for the documented response shape.
5. Error codes referenced in the code align with what the API actually returns.

Respond with a JSON array of objects, one per function, with this shape:
{
  "functionName": string,
  "targetApi": string,
  "targetEndpoint": string,
  "status": "correct" | "incorrect" | "ambiguous",
  "issues": string[],
  "recommendation": string
}

If a function does not make any API call, omit it from the array.
If documentation is unavailable or incomplete, mark status as "ambiguous" and explain in issues.`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Derive a cache key for the API doc snapshot from the integration filename.
 * e.g. "apollo.ts" -> "api_docs:apollo"
 */
function docCacheKey(filePath: string): string {
  const base = path.basename(filePath, ".ts");
  return `api_docs:${base}`;
}

/**
 * Extract a human-readable API name from the filename.
 */
function apiNameFromFile(filePath: string): string {
  return path.basename(filePath, ".ts");
}

// ---------------------------------------------------------------------------
// Main audit
// ---------------------------------------------------------------------------

/**
 * Run the Function Identity audit across all integration files.
 *
 * @param commitDiff - Optional git diff string to scope the audit to changed
 *   files only. When provided, only integration files whose path appears in
 *   the diff will be audited.
 */
export async function runFunctionIdentityAudit(
  commitDiff?: string
): Promise<FunctionAuditResult[]> {
  // 1. Collect integration files
  const pattern = path.join(INTEGRATIONS_DIR, "*.ts");
  let files = await glob(pattern);

  // If a commit diff is provided, filter to only changed integration files
  if (commitDiff) {
    files = files.filter((f) => {
      const relative = path.relative(process.cwd(), f);
      return commitDiff.includes(relative);
    });
  }

  if (files.length === 0) {
    return [];
  }

  const allResults: FunctionAuditResult[] = [];

  for (const filePath of files) {
    const apiName = apiNameFromFile(filePath);

    // 2. Read source
    const sourceCode = await fs.readFile(filePath, "utf-8");

    // 3. Fetch cached API doc snapshot
    const docSnapshot = await cacheGet<ApiDocSnapshot>(docCacheKey(filePath));

    const docContext = docSnapshot
      ? JSON.stringify(docSnapshot, null, 2)
      : "No API documentation snapshot available for this integration.";

    // 4. Call AI for analysis
    const { data } = await aiJSON<FunctionAuditResult[]>({
      system: FUNCTION_IDENTITY_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            `## Integration: ${apiName}`,
            "",
            "### Source Code",
            "```typescript",
            sourceCode,
            "```",
            "",
            "### API Documentation Snapshot",
            "```json",
            docContext,
            "```",
            "",
            "Analyze each exported function that makes an API call and return the JSON array.",
          ].join("\n"),
        },
      ],
      maxTokens: 4096,
      temperature: 0.2,
    });

    if (Array.isArray(data)) {
      allResults.push(...data);
    }
  }

  return allResults;
}
