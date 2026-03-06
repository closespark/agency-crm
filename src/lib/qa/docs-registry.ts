import { aiJSON } from "@/lib/ai/claude";
import { prisma } from "@/lib/prisma";
import { cacheGet, cacheSet } from "@/lib/redis";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DocsSnapshot {
  apiName: string;
  url: string;
  content: string;
  version: number;
  fetchedAt: string; // ISO timestamp
}

interface DocChange {
  field: string;
  type: "added" | "removed" | "modified";
  impact: string;
}

interface DiffResult {
  hasBreakingChanges: boolean;
  changes: DocChange[];
}

// ---------------------------------------------------------------------------
// API Documentation Registry
// ---------------------------------------------------------------------------

export const API_DOCS_REGISTRY: Record<string, string> = {
  apollo: "https://apolloio.github.io/apollo-api-docs/",
  instantly: "https://developer.instantly.ai/introduction",
  meetAlfred: "https://docs.meetalfred.com/api",
  vapi: "https://docs.vapi.ai/api-reference",
  pandadoc: "https://developers.pandadoc.com/reference/about",
  railway: "https://docs.railway.app/reference/public-api",
  anthropic: "https://docs.anthropic.com/en/api",
  stripe: "https://docs.stripe.com/api",
  tldv: "https://tldv.io/api-docs",
  gmail: "https://developers.google.com/gmail/api/reference/rest",
};

const CACHE_PREFIX = "docsSnapshots";
const CACHE_TTL_SECONDS = 60 * 60 * 24; // 24 hours

// ---------------------------------------------------------------------------
// fetchDocSnapshot — Fetch and cache a single API's documentation
// ---------------------------------------------------------------------------

export async function fetchDocSnapshot(
  apiName: string
): Promise<{ content: string; fetchedAt: string }> {
  const url = API_DOCS_REGISTRY[apiName];
  if (!url) {
    throw new Error(`Unknown API "${apiName}" — not found in docs registry`);
  }

  const response = await fetch(url, {
    headers: { Accept: "text/html, application/json" },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch docs for ${apiName}: ${response.status} ${response.statusText}`
    );
  }

  const content = await response.text();
  const fetchedAt = new Date().toISOString();

  // Load existing snapshot to increment version
  const existing = await cacheGet<DocsSnapshot>(`${CACHE_PREFIX}:${apiName}`);
  const nextVersion = existing ? existing.version + 1 : 1;

  const snapshot: DocsSnapshot = {
    apiName,
    url,
    content,
    version: nextVersion,
    fetchedAt,
  };

  await cacheSet(`${CACHE_PREFIX}:${apiName}`, snapshot, CACHE_TTL_SECONDS);

  return { content, fetchedAt };
}

// ---------------------------------------------------------------------------
// diffDocs — Identify breaking changes between two doc versions
// ---------------------------------------------------------------------------

export async function diffDocs(
  apiName: string,
  oldContent: string,
  newContent: string
): Promise<DiffResult> {
  const { data } = await aiJSON<DiffResult>({
    system: [
      "You are an API documentation analyst. Compare two versions of API documentation",
      "and identify all changes, especially breaking changes.",
      "A breaking change is any removal, rename, or type change of an existing endpoint,",
      "parameter, or response field that would cause existing integrations to fail.",
    ].join(" "),
    messages: [
      {
        role: "user",
        content: [
          `API: ${apiName}`,
          "",
          "=== OLD DOCUMENTATION ===",
          oldContent.slice(0, 50_000),
          "",
          "=== NEW DOCUMENTATION ===",
          newContent.slice(0, 50_000),
          "",
          "Return a JSON object with:",
          '  "hasBreakingChanges": boolean,',
          '  "changes": [{ "field": string, "type": "added" | "removed" | "modified", "impact": string }]',
        ].join("\n"),
      },
    ],
    maxTokens: 4096,
    temperature: 0.2,
  });

  return data;
}

// ---------------------------------------------------------------------------
// refreshAllDocs — Refresh all API docs, diff against stored, log changes
// ---------------------------------------------------------------------------

export async function refreshAllDocs(): Promise<void> {
  const apiNames = Object.keys(API_DOCS_REGISTRY);

  for (const apiName of apiNames) {
    try {
      const existing = await cacheGet<DocsSnapshot>(
        `${CACHE_PREFIX}:${apiName}`
      );
      const { content: newContent, fetchedAt } =
        await fetchDocSnapshot(apiName);

      if (!existing) {
        console.log(
          `[docs-registry] First snapshot for ${apiName} at ${fetchedAt}`
        );
        continue;
      }

      // Skip diff if content is identical
      if (existing.content === newContent) {
        console.log(`[docs-registry] No changes detected for ${apiName}`);
        continue;
      }

      const diff = await diffDocs(apiName, existing.content, newContent);

      if (diff.hasBreakingChanges) {
        console.warn(
          `[docs-registry] BREAKING CHANGES detected for ${apiName}:`,
          diff.changes
        );

        await prisma.systemChangelog.create({
          data: {
            category: "api_docs",
            changeType: "breaking_change_detected",
            description: `Breaking changes detected in ${apiName} API documentation`,
            previousValue: JSON.stringify({
              version: existing.version,
              fetchedAt: existing.fetchedAt,
            }),
            newValue: JSON.stringify({
              version: existing.version + 1,
              fetchedAt,
            }),
            dataEvidence: JSON.stringify(diff.changes),
            expectedImpact: diff.changes.map((c) => c.impact).join("; "),
          },
        });
      } else if (diff.changes.length > 0) {
        console.log(
          `[docs-registry] Non-breaking changes detected for ${apiName}:`,
          diff.changes.length,
          "change(s)"
        );

        await prisma.systemChangelog.create({
          data: {
            category: "api_docs",
            changeType: "non_breaking_change",
            description: `Non-breaking changes detected in ${apiName} API documentation (${diff.changes.length} change(s))`,
            previousValue: JSON.stringify({
              version: existing.version,
              fetchedAt: existing.fetchedAt,
            }),
            newValue: JSON.stringify({
              version: existing.version + 1,
              fetchedAt,
            }),
            dataEvidence: JSON.stringify(diff.changes),
          },
        });
      }
    } catch (error) {
      console.error(`[docs-registry] Failed to refresh docs for ${apiName}:`, error);
    }
  }
}
