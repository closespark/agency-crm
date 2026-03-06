// Knowledge Engine — external intelligence layer
// Fetches external sources, extracts insights, validates against internal data.
// Feeds the Content Engine with validated, high-confidence intelligence.
//
// Source tiers:
//   Tier 1: Internal data (pipeline conversations, deal outcomes, ICP patterns)
//   Tier 2: Industry-specific (G2 reviews, HubSpot community, competitor content)
//   Tier 3: General (sales methodology blogs, LinkedIn thought leadership)
//
// Every insight gets a confidence score. Only validated insights feed content.

import { prisma } from "@/lib/prisma";
import { runAIJob } from "./job-runner";
import { safeParseJSON } from "@/lib/safe-json";

// ============================================
// SOURCE FETCHING
// ============================================

/**
 * Fetch all active knowledge sources on their configured schedule.
 */
export async function fetchKnowledgeSources(): Promise<number> {
  const now = new Date();
  let fetched = 0;

  const sources = await prisma.knowledgeSource.findMany({
    where: { isActive: true },
  });

  for (const source of sources) {
    if (!shouldFetch(source.fetchFrequency, source.lastFetchedAt)) continue;

    try {
      const content = await fetchSource(source.url, source.type);
      if (!content) continue;

      await prisma.knowledgeRaw.create({
        data: {
          sourceId: source.id,
          content,
          url: source.url,
        },
      });

      await prisma.knowledgeSource.update({
        where: { id: source.id },
        data: { lastFetchedAt: now },
      });

      fetched++;
    } catch (err) {
      console.error(`[knowledge] Failed to fetch source ${source.url}:`, err);
    }
  }

  return fetched;
}

function shouldFetch(frequency: string, lastFetched: Date | null): boolean {
  if (!lastFetched) return true;
  const elapsed = Date.now() - lastFetched.getTime();
  const day = 24 * 60 * 60 * 1000;
  switch (frequency) {
    case "daily": return elapsed > day;
    case "weekly": return elapsed > 7 * day;
    case "monthly": return elapsed > 30 * day;
    default: return elapsed > 7 * day;
  }
}

async function fetchSource(url: string, type: string): Promise<string | null> {
  switch (type) {
    case "rss": return fetchRSS(url);
    case "scrape": return fetchPage(url);
    case "g2_reviews":
    case "product_updates":
    case "industry_news":
      return fetchPage(url);
    default:
      return fetchPage(url);
  }
}

async function fetchRSS(url: string): Promise<string | null> {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) return null;
  return res.text();
}

async function fetchPage(url: string): Promise<string | null> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    headers: { "User-Agent": "NexusOps-KnowledgeEngine/1.0" },
  });
  if (!res.ok) return null;
  const html = await res.text();
  // Strip HTML to get readable text (basic extraction)
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, 50000); // Cap at 50k chars
}

// ============================================
// INSIGHT EXTRACTION
// ============================================

/**
 * Process unprocessed raw entries through AI to extract actionable insights.
 */
export async function extractInsights(): Promise<number> {
  const unprocessed = await prisma.knowledgeRaw.findMany({
    where: { processed: false },
    include: { source: true },
    take: 10,
  });

  let extracted = 0;

  for (const raw of unprocessed) {
    try {
      const result = await runAIJob("lifecycle_manager", "extract_insights", {
        content: raw.content.substring(0, 20000),
        sourceType: raw.source.type,
        sourceTier: raw.source.tier,
        sourceUrl: raw.url,
        instructions: `Extract actionable insights from this content that are relevant to a RevOps consultancy targeting frustrated HubSpot users at B2B SaaS companies (50-500 employees).

For each insight, determine:
1. The specific tactic or observation
2. What result is claimed
3. Which channel it applies to (email, linkedin, blog, newsletter, general)
4. Who the audience is
5. Confidence level (0-1) based on how specific and evidence-backed it is
6. Topic tags

Only extract insights that could directly improve our outreach, content, or client work.
Skip generic advice, obvious statements, and promotional content.

Return JSON: {
  insights: [{
    tactic: string,
    claimedResult: string,
    channel: string,
    audience: string,
    confidence: number,
    tags: string[]
  }]
}`,
      });

      const output = result.output as {
        insights: {
          tactic: string;
          claimedResult: string;
          channel: string;
          audience: string;
          confidence: number;
          tags: string[];
        }[];
      };

      for (const insight of output.insights || []) {
        await prisma.knowledgeInsight.create({
          data: {
            rawId: raw.id,
            tactic: insight.tactic,
            claimedResult: insight.claimedResult,
            channel: insight.channel,
            audience: insight.audience,
            confidence: insight.confidence,
            tags: JSON.stringify(insight.tags),
          },
        });
        extracted++;
      }

      await prisma.knowledgeRaw.update({
        where: { id: raw.id },
        data: { processed: true, processedAt: new Date() },
      });
    } catch (err) {
      console.error(`[knowledge] Insight extraction failed for raw ${raw.id}:`, err);
    }
  }

  return extracted;
}

// ============================================
// INTERNAL INTELLIGENCE (Tier 1)
// ============================================

/**
 * Extract insights from internal pipeline data — the highest-tier intelligence.
 * This runs as part of the Sunday audit cycle.
 */
export async function extractPipelineInsights(): Promise<number> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // Gather this week's pipeline intelligence
  const [
    positiveReplies,
    objections,
    wonDeals,
    lostDeals,
    hotTopics,
  ] = await Promise.all([
    // Positive replies — what angles got traction
    prisma.aIConversationLog.findMany({
      where: {
        direction: "inbound",
        sentiment: "positive",
        createdAt: { gte: weekAgo },
      },
      include: { contact: { include: { company: true } } },
      take: 50,
    }),
    // Objections raised this week
    prisma.aIConversationLog.findMany({
      where: {
        objectionType: { not: null },
        createdAt: { gte: weekAgo },
      },
      take: 30,
    }),
    // Deals won this week
    prisma.deal.findMany({
      where: { stage: "closed_won", updatedAt: { gte: weekAgo } },
      include: { contact: { include: { company: true } } },
    }),
    // Deals lost this week
    prisma.deal.findMany({
      where: { stage: "closed_lost", updatedAt: { gte: weekAgo } },
      include: { contact: { include: { company: true } } },
    }),
    // Most mentioned pain points in conversations
    prisma.aIConversationLog.findMany({
      where: {
        direction: "inbound",
        createdAt: { gte: weekAgo },
        rawContent: { not: "" },
      },
      select: { rawContent: true, aiSummary: true },
      take: 100,
    }),
  ]);

  const result = await runAIJob("lifecycle_manager", "pipeline_insights", {
    positiveReplies: positiveReplies.map((r) => ({
      content: r.rawContent?.substring(0, 500),
      industry: r.contact?.company?.industry,
      jobTitle: r.contact?.jobTitle,
      angle: r.aiSummary,
    })),
    objections: objections.map((o) => ({
      type: o.objectionType,
      verbatim: o.objectionVerbatim?.substring(0, 300),
    })),
    wonDeals: wonDeals.map((d) => ({
      value: d.amount,
      industry: d.contact?.company?.industry,
      size: d.contact?.company?.size,
    })),
    lostDeals: lostDeals.map((d) => ({
      reason: d.lostReason,
      competitor: d.lostToCompetitor,
      industry: d.contact?.company?.industry,
    })),
    conversationTopics: hotTopics.map((t) => t.aiSummary).filter(Boolean),
    instructions: `Analyze this week's pipeline data and extract content-worthy insights.

These insights will drive next week's newsletter, blog posts, and LinkedIn content.
Focus on:
1. What angles/pain points got the most positive responses
2. What objections keep coming up (these become content topics)
3. What patterns exist in won vs lost deals (these become case study angles)
4. What HubSpot-specific frustrations were mentioned

Each insight should be specific enough to generate a piece of content.
Not "HubSpot users are frustrated" but "Marketing Directors at 100-300 person SaaS companies are losing 6 hours/week to HubSpot workflow debugging."

Return JSON: {
  insights: [{
    tactic: string,
    claimedResult: string,
    channel: "newsletter" | "blog" | "linkedin" | "general",
    audience: string,
    confidence: number,
    tags: string[]
  }],
  topAngle: string,
  topPainPoint: string,
  topObjection: string
}`,
  });

  const output = result.output as {
    insights: {
      tactic: string;
      claimedResult: string;
      channel: string;
      audience: string;
      confidence: number;
      tags: string[];
    }[];
  };

  let created = 0;
  for (const insight of output.insights || []) {
    await prisma.knowledgeInsight.create({
      data: {
        tactic: insight.tactic,
        claimedResult: insight.claimedResult,
        channel: insight.channel,
        audience: insight.audience,
        confidence: Math.min(1, insight.confidence + 0.2), // Tier 1 gets confidence boost
        tags: JSON.stringify([...insight.tags, "tier1", "pipeline"]),
        isValidated: true, // Internal data is pre-validated
      },
    });
    created++;
  }

  return created;
}

// ============================================
// INSIGHT VALIDATION
// ============================================

/**
 * Cross-reference external insights against internal performance data.
 * An insight about "subject lines under 5 words get 40% more opens" gets checked
 * against our actual email event data.
 */
export async function validateInsights(): Promise<number> {
  const unvalidated = await prisma.knowledgeInsight.findMany({
    where: { isValidated: false, validationPoints: { lt: 3 } },
    take: 20,
  });

  if (unvalidated.length === 0) return 0;

  // Get our internal performance data for comparison
  const [emailPerf, sequencePerf, recentReplies] = await Promise.all([
    prisma.emailEvent.groupBy({
      by: ["type"],
      _count: true,
      where: { createdAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) } },
    }),
    prisma.sequencePerformance.findMany({
      where: { sent: { gte: 10 } },
      orderBy: { positiveReplyRate: "desc" },
      take: 20,
    }),
    prisma.aIConversationLog.findMany({
      where: { direction: "inbound", sentiment: "positive" },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { aiSummary: true, channel: true },
    }),
  ]);

  let validated = 0;

  for (const insight of unvalidated) {
    const result = await runAIJob("lifecycle_manager", "validate_insight", {
      insight: {
        tactic: insight.tactic,
        claimedResult: insight.claimedResult,
        channel: insight.channel,
      },
      internalData: {
        emailEvents: emailPerf,
        topSequences: sequencePerf.slice(0, 5).map((s) => ({
          replyRate: s.positiveReplyRate,
          angle: s.messageAngle,
        })),
        recentSuccessfulAngles: recentReplies.map((r) => r.aiSummary).filter(Boolean),
      },
      instructions: `Does our internal data support or contradict this insight?

Insight: "${insight.tactic}"
Claimed result: "${insight.claimedResult}"

Score 0-1:
- 0.8-1.0: Strong internal evidence supports this
- 0.5-0.7: Plausible but no strong evidence either way
- 0.2-0.4: Our data suggests this may not apply to our ICP
- 0.0-0.1: Our data directly contradicts this

Return JSON: { score: number, reasoning: string }`,
    });

    const validation = result.output as { score: number; reasoning: string };

    await prisma.knowledgeInsight.update({
      where: { id: insight.id },
      data: {
        internalValidationScore: validation.score,
        validationPoints: insight.validationPoints + 1,
        isValidated: validation.score >= 0.6,
      },
    });

    validated++;
  }

  return validated;
}

// ============================================
// QUERY INTERFACE (used by Content Engine)
// ============================================

/**
 * Query the Knowledge Engine for insights relevant to a specific content topic.
 */
export async function queryInsights(params: {
  channel?: string;
  tags?: string[];
  minConfidence?: number;
  limit?: number;
  validatedOnly?: boolean;
}): Promise<{
  tactic: string;
  claimedResult: string | null;
  confidence: number;
  validationScore: number | null;
  channel: string | null;
}[]> {
  const where: Record<string, unknown> = {};

  if (params.channel) where.channel = params.channel;
  if (params.minConfidence) where.confidence = { gte: params.minConfidence };
  if (params.validatedOnly) where.isValidated = true;

  const insights = await prisma.knowledgeInsight.findMany({
    where,
    orderBy: [
      { internalValidationScore: "desc" },
      { confidence: "desc" },
    ],
    take: params.limit || 10,
  });

  // Filter by tags if specified
  if (params.tags && params.tags.length > 0) {
    return insights
      .filter((i) => {
        const insightTags = safeParseJSON(i.tags, [] as string[]);
        return params.tags!.some((t) => insightTags.includes(t));
      })
      .map((i) => ({
        tactic: i.tactic,
        claimedResult: i.claimedResult,
        confidence: i.confidence,
        validationScore: i.internalValidationScore,
        channel: i.channel,
      }));
  }

  return insights.map((i) => ({
    tactic: i.tactic,
    claimedResult: i.claimedResult,
    confidence: i.confidence,
    validationScore: i.internalValidationScore,
    channel: i.channel,
  }));
}

/**
 * Record that an insight was used in content and track its outcome.
 */
export async function recordInsightUsage(
  insightId: string,
  contentDraftId: string,
  context: string
): Promise<void> {
  await prisma.insightUsage.create({
    data: {
      insightId,
      contentDraftId,
      usageContext: context,
    },
  });
}

/**
 * Update source reliability scores based on how well their insights perform.
 */
export async function updateSourceReliability(): Promise<void> {
  const sources = await prisma.knowledgeSource.findMany({
    where: { isActive: true },
    include: {
      rawEntries: {
        include: {
          insights: true,
        },
      },
    },
  });

  for (const source of sources) {
    const allInsights = source.rawEntries.flatMap((r) => r.insights);
    if (allInsights.length === 0) continue;

    const validatedInsights = allInsights.filter((i) => i.isValidated);
    const avgValidation = allInsights.reduce(
      (sum, i) => sum + (i.internalValidationScore || 0),
      0
    ) / allInsights.length;

    const reliability = allInsights.length >= 5
      ? (validatedInsights.length / allInsights.length) * 0.6 + avgValidation * 0.4
      : 0.5; // Not enough data yet

    await prisma.knowledgeSource.update({
      where: { id: source.id },
      data: { reliabilityScore: reliability },
    });
  }
}

/**
 * Seed default knowledge sources on first boot.
 */
export async function seedKnowledgeSourcesIfEmpty(): Promise<void> {
  const count = await prisma.knowledgeSource.count();
  if (count > 0) return;

  const defaultSources = [
    {
      url: "https://www.g2.com/products/hubspot-crm/reviews.rss",
      type: "g2_reviews",
      tier: "tier2",
      fetchFrequency: "weekly",
    },
    {
      url: "https://community.hubspot.com/t5/CRM/ct-p/crm",
      type: "scrape",
      tier: "tier2",
      fetchFrequency: "weekly",
    },
    {
      url: "https://blog.hubspot.com/rss.xml",
      type: "rss",
      tier: "tier3",
      fetchFrequency: "weekly",
    },
    // Reddit practitioner communities
    {
      url: "https://www.reddit.com/r/revops/.rss",
      type: "rss",
      tier: "tier2",
      fetchFrequency: "weekly",
    },
    {
      url: "https://www.reddit.com/r/sales/.rss",
      type: "rss",
      tier: "tier3",
      fetchFrequency: "weekly",
    },
    {
      url: "https://www.reddit.com/r/hubspot/.rss",
      type: "rss",
      tier: "tier2",
      fetchFrequency: "weekly",
    },
    {
      url: "https://www.reddit.com/r/b2bmarketing/.rss",
      type: "rss",
      tier: "tier3",
      fetchFrequency: "weekly",
    },
  ];

  for (const source of defaultSources) {
    await prisma.knowledgeSource.create({ data: source });
  }

  console.log("[knowledge] Seeded default knowledge sources");
}
