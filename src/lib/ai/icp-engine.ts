// ICP Engine — hardcoded targeting criteria for Apollo prospecting.
// Scores Apollo results against the ICP, rejects below threshold,
// and self-optimizes weights after closed deals.
//
// The seed config below is the starting point. After 10+ closed deals,
// the self-optimization engine drifts weights based on actual close data.

import { prisma } from "@/lib/prisma";
import type { ApolloPersonResult, ApolloSearchParams } from "@/lib/integrations/apollo";
import { safeParseJSON } from "@/lib/safe-json";

// ============================================
// ICP CONFIGURATION (versioned, self-optimizing)
// ============================================

export interface ICPConfig {
  version: number;

  // Primary filters — non-negotiable gates (Apollo query params)
  requiredTechnology: string; // Tech stack filter — must have this installed (e.g., "HubSpot")
  geography: string;
  employeeRange: { min: number; max: number };
  decisionMakerTitles: string[];

  // Secondary filters — scoring signals
  jobPostingKeywords: string[];
  headcountGrowthThreshold: number; // percent
  revenueRange: { min: number; max: number };
  targetIndustries: string[];

  // Scoring weights (these drift over time)
  weights: {
    decisionMakerTitle: number;
    industryMatch: number;
    employeeRangeMatch: number;
    revenueRangeMatch: number;
    activeJobPosting: number;
    headcountGrowth: number;
    multipleDecisionMakers: number;
  };

  // Pipeline entry threshold
  minimumScore: number;
}

/** Seed ICP — the starting configuration before any self-optimization. */
export const SEED_ICP: ICPConfig = {
  version: 1,

  // Primary filters (gates, not scores)
  requiredTechnology: "HubSpot",
  geography: "United States",
  employeeRange: { min: 10, max: 500 },
  decisionMakerTitles: [
    "Founder",
    "CEO",
    "Co-Founder",
    "CRO",
    "VP Marketing",
    "CMO",
    "Head of Revenue",
    "Director of Marketing",
    "VP Sales",
    "RevOps",
    "Revenue Operations",
    "Marketing Operations",
    "Sales Operations",
    "Director of RevOps",
    "Head of RevOps",
    "VP Revenue Operations",
  ],

  // Secondary scoring signals
  jobPostingKeywords: [
    "HubSpot Administrator",
    "Marketing Operations",
    "RevOps Manager",
    "CRM Manager",
    "Sales Operations",
  ],
  headcountGrowthThreshold: 10,
  revenueRange: { min: 1_000_000, max: 50_000_000 },
  targetIndustries: [
    "B2B SaaS",
    "SaaS",
    "Software",
    "Professional Services",
    "Marketing Agency",
    "Consulting",
    "Staffing",
    "Real Estate",
    "Information Technology",
    "Marketing and Advertising",
  ],

  // Scoring weights (seed — will drift)
  // From search results alone: max = 15+15+10+15 = 55
  // With enrichment signals: max = 55+25+10 = 90
  // Job posting is the strongest buying intent signal — they have pain and budget NOW
  // Multiple DMs at 15 because multi-threaded deals close at 2-3x rate
  // Title at 15 (not higher) because ops people champion the purchase, not C-suite
  weights: {
    decisionMakerTitle: 15,
    industryMatch: 0, // Not used — HubSpot gate is the only vertical filter
    employeeRangeMatch: 10,
    revenueRangeMatch: 15,
    activeJobPosting: 25,
    headcountGrowth: 10,
    multipleDecisionMakers: 15,
  },

  // Threshold 20 — Apollo query params already gate on tech stack + title + employee range.
  // Scoring is for RANKING priority, not rejection. A single title match (15) or
  // employee range match (10) + any partial signal gets you in.
  // Enrichment signals (job posting, headcount growth, multi DMs) boost priority.
  minimumScore: 20,
};

// ============================================
// LOAD ACTIVE ICP (from DB or seed)
// ============================================

let icpCache: { config: ICPConfig; fetchedAt: number } | null = null;
const ICP_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

export async function getActiveICP(): Promise<ICPConfig> {
  if (icpCache && Date.now() - icpCache.fetchedAt < ICP_CACHE_TTL) {
    return icpCache.config;
  }

  const profile = await prisma.iCPProfile.findFirst({
    where: { isActive: true },
    orderBy: { version: "desc" },
  });

  if (profile?.apolloSearchParams) {
    const config = safeParseJSON(profile.apolloSearchParams, SEED_ICP) as ICPConfig;
    icpCache = { config, fetchedAt: Date.now() };
    return config;
  }

  icpCache = { config: SEED_ICP, fetchedAt: Date.now() };
  return SEED_ICP;
}

export function invalidateICPCache() {
  icpCache = null;
}

// ============================================
// BUILD APOLLO SEARCH PARAMS FROM ICP
// ============================================

// Apollo technology UIDs for tech stack filtering
// These are stable IDs from Apollo's technology database
const TECHNOLOGY_UIDS: Record<string, string> = {
  HubSpot: "5c1052d7f3e7bb3d4e30b356",
  Salesforce: "5c1052d7f3e7bb3d4e30b35a",
  Marketo: "5c1052d7f3e7bb3d4e30b35c",
  Pardot: "5c1052d7f3e7bb3d4e30b35d",
};

// Apollo only accepts predefined employee range buckets
const APOLLO_EMPLOYEE_BUCKETS = [
  "1,10", "11,20", "21,50", "51,100", "101,200", "201,500", "501,1000",
  "1001,2000", "2001,5000", "5001,10000", "10001,",
];

function getApolloEmployeeRanges(min: number, max: number): string[] {
  return APOLLO_EMPLOYEE_BUCKETS.filter((bucket) => {
    const [lo, hi] = bucket.split(",").map(Number);
    const bucketMax = hi || Infinity;
    return bucketMax >= min && lo <= max;
  });
}

export function buildApolloParams(icp: ICPConfig): ApolloSearchParams {
  // Resolve technology name to Apollo UID for proper tech stack filtering
  const techUid = TECHNOLOGY_UIDS[icp.requiredTechnology];

  return {
    person_titles: icp.decisionMakerTitles,
    person_locations: [icp.geography],
    organization_num_employees_ranges: getApolloEmployeeRanges(icp.employeeRange.min, icp.employeeRange.max),
    // Filter by companies that actually have this technology installed
    ...(techUid
      ? { currently_using_any_of_technology_uids: [techUid] }
      : { q_keywords: icp.requiredTechnology }),
    per_page: 100,
    page: 1,
  };
}

// ============================================
// FIT SCORE CALCULATOR
// ============================================

export interface FitScoreResult {
  score: number;
  breakdown: {
    decisionMakerTitle: number;
    industryMatch: number;
    employeeRangeMatch: number;
    revenueRangeMatch: number;
    activeJobPosting: number;
    headcountGrowth: number;
    multipleDecisionMakers: number;
  };
  passes: boolean;
  reasoning: string;
}

export function scoreProspect(
  person: ApolloPersonResult,
  icp: ICPConfig,
  extraSignals?: {
    hasJobPosting?: boolean;
    headcountGrowthPercent?: number;
    multipleDecisionMakers?: boolean;
  }
): FitScoreResult {
  const breakdown = {
    decisionMakerTitle: 0,
    industryMatch: 0,
    employeeRangeMatch: 0,
    revenueRangeMatch: 0,
    activeJobPosting: 0,
    headcountGrowth: 0,
    multipleDecisionMakers: 0,
  };

  const reasons: string[] = [];

  // HubSpot installed = already filtered by Apollo query (gate, not scored)

  // Decision maker title match
  const title = (person.title || "").toLowerCase();
  const titleMatch = icp.decisionMakerTitles.some((t) =>
    title.includes(t.toLowerCase())
  );
  if (titleMatch) {
    breakdown.decisionMakerTitle = icp.weights.decisionMakerTitle;
    reasons.push(`Title match: "${person.title}"`);
  }

  // Industry match — skipped when weight is 0 (HubSpot gate is the only vertical filter)
  if (icp.weights.industryMatch > 0) {
    const industry = (person.organization?.industry || "").toLowerCase();
    const industryMatch = icp.targetIndustries.some((i) =>
      industry.includes(i.toLowerCase())
    );
    if (industryMatch) {
      breakdown.industryMatch = icp.weights.industryMatch;
      reasons.push(`Industry match: "${person.organization?.industry}"`);
    }
  }

  // Employee range match
  const employees = person.organization?.estimated_num_employees || 0;
  if (employees >= icp.employeeRange.min && employees <= icp.employeeRange.max) {
    breakdown.employeeRangeMatch = icp.weights.employeeRangeMatch;
    reasons.push(`Employee count ${employees} in range ${icp.employeeRange.min}-${icp.employeeRange.max}`);
  }

  // Revenue range match
  const revenue = person.organization?.annual_revenue || 0;
  if (revenue >= icp.revenueRange.min && revenue <= icp.revenueRange.max) {
    breakdown.revenueRangeMatch = icp.weights.revenueRangeMatch;
    reasons.push(`Revenue $${(revenue / 1_000_000).toFixed(1)}M in range`);
  }

  // Active job posting signal
  if (extraSignals?.hasJobPosting) {
    breakdown.activeJobPosting = icp.weights.activeJobPosting;
    reasons.push("Active RevOps/HubSpot job posting detected");
  }

  // Headcount growth
  if (
    extraSignals?.headcountGrowthPercent &&
    extraSignals.headcountGrowthPercent >= icp.headcountGrowthThreshold
  ) {
    breakdown.headcountGrowth = icp.weights.headcountGrowth;
    reasons.push(`${extraSignals.headcountGrowthPercent}% headcount growth`);
  }

  // Multiple decision makers available
  if (extraSignals?.multipleDecisionMakers) {
    breakdown.multipleDecisionMakers = icp.weights.multipleDecisionMakers;
    reasons.push("Multiple decision makers at this company");
  }

  const score = Object.values(breakdown).reduce((a, b) => a + b, 0);
  const passes = score >= icp.minimumScore;

  return {
    score,
    breakdown,
    passes,
    reasoning: passes
      ? `Score ${score}/${icp.minimumScore} threshold. ${reasons.join(". ")}.`
      : `Rejected: score ${score} below ${icp.minimumScore} threshold. Matched: ${reasons.join(", ") || "none"}.`,
  };
}

// ============================================
// AUTONOMOUS PROSPECTING — run a full search cycle
// ============================================

export async function runProspectingCycle(): Promise<{
  searched: number;
  accepted: number;
  rejected: number;
}> {
  const { apollo: apolloClient } = await import("@/lib/integrations/apollo");
  const { apolloToProspect } = await import("@/lib/integrations/apollo");

  const icp = await getActiveICP();
  const params = buildApolloParams(icp);

  // Pagination: track which page to fetch next via SystemChangelog
  let nextPage = 1;
  const lastPageRecord = await prisma.systemChangelog.findFirst({
    where: { category: "prospecting", changeType: "page_tracker" },
    orderBy: { createdAt: "desc" },
  });
  if (lastPageRecord?.dataEvidence) {
    const data = safeParseJSON(lastPageRecord.dataEvidence, null) as {
      nextPage?: number;
      icpVersion?: number;
    } | null;
    // Reset to page 1 if ICP version changed (new search criteria)
    if (data?.nextPage && data.icpVersion === icp.version) {
      nextPage = data.nextPage;
    }
  }
  params.page = nextPage;

  // Create search record
  const search = await prisma.prospectSearch.create({
    data: {
      name: `Auto-prospect v${icp.version} — ${new Date().toISOString().split("T")[0]}`,
      icp: JSON.stringify(icp),
      status: "searching",
    },
  });

  let accepted = 0;
  let rejected = 0;
  let searched = 0;

  try {
    console.log("[icp-engine] Apollo search params:", JSON.stringify(params));
    const result = await apolloClient.peopleSearch(params);
    console.log("[icp-engine] Apollo raw response keys:", Object.keys(result || {}), "people count:", (result as Record<string, unknown>)?.people ? (result.people as unknown[]).length : "missing");
    const people = result.people || [];
    const pagination = result.pagination || { total_entries: 0, total_pages: 0, page: 1 };
    searched = people.length;

    if (searched === 0) {
      console.log("[icp-engine] Apollo returned 0 results — check ICP params and API key");
      await prisma.prospectSearch.update({
        where: { id: search.id },
        data: { status: "complete", resultsCount: 0 },
      });
      return { searched: 0, accepted: 0, rejected: 0 };
    }

    // Group by company to detect multiple decision makers
    const companyPeople = new Map<string, ApolloPersonResult[]>();
    for (const person of people) {
      const domain = person.organization?.website_url || "unknown";
      const existing = companyPeople.get(domain) || [];
      existing.push(person);
      companyPeople.set(domain, existing);
    }

    for (const person of people) {
      const domain = person.organization?.website_url || "unknown";
      const coworkers = companyPeople.get(domain) || [];

      const scoreResult = scoreProspect(person, icp, {
        multipleDecisionMakers: coworkers.length > 1,
        // Job posting and headcount growth would come from Apollo's company enrichment
        // or organization data if available in the response
      });

      if (scoreResult.passes) {
        // Check if we already have this prospect or contact
        const existingContact = person.email
          ? await prisma.contact.findUnique({ where: { email: person.email } })
          : null;

        if (existingContact) {
          // Already in CRM — skip
          continue;
        }

        const existingProspect = person.email
          ? await prisma.prospect.findFirst({ where: { email: person.email } })
          : null;

        if (existingProspect) {
          // Already prospected — update score
          await prisma.prospect.update({
            where: { id: existingProspect.id },
            data: {
              fitScore: scoreResult.score,
              aiAnalysis: JSON.stringify({
                icpVersion: icp.version,
                scoreBreakdown: scoreResult.breakdown,
                reasoning: scoreResult.reasoning,
              }),
            },
          });
          continue;
        }

        // New prospect — create
        const prospectData = apolloToProspect(person);
        await prisma.prospect.create({
          data: {
            searchId: search.id,
            ...prospectData,
            fitScore: scoreResult.score,
            aiAnalysis: JSON.stringify({
              icpVersion: icp.version,
              scoreBreakdown: scoreResult.breakdown,
              reasoning: scoreResult.reasoning,
            }),
            status: "new",
          },
        });
        accepted++;
      } else {
        // Below threshold — log to rejected prospects
        await prisma.rawEventLog.create({
          data: {
            source: "apollo",
            eventType: "prospect_rejected",
            rawPayload: JSON.stringify({
              person: {
                name: `${person.first_name} ${person.last_name}`,
                email: person.email,
                title: person.title,
                company: person.organization?.name,
                industry: person.organization?.industry,
                employees: person.organization?.estimated_num_employees,
                revenue: person.organization?.annual_revenue,
              },
              score: scoreResult.score,
              threshold: icp.minimumScore,
              breakdown: scoreResult.breakdown,
              reasoning: scoreResult.reasoning,
              icpVersion: icp.version,
            }),
            processed: true,
            processedAt: new Date(),
          },
        });
        rejected++;
      }
    }

    await prisma.prospectSearch.update({
      where: { id: search.id },
      data: {
        status: "complete",
        resultsCount: accepted,
      },
    });

    // Track pagination: advance to next page, or wrap to page 1 if we've exhausted results
    const fetchedPage = params.page || 1;
    const hasMorePages = pagination.total_pages > fetchedPage;
    await prisma.systemChangelog.create({
      data: {
        category: "prospecting",
        changeType: "page_tracker",
        description: `Fetched page ${fetchedPage}/${pagination.total_pages} (${pagination.total_entries} total). ${accepted} accepted, ${rejected} rejected.`,
        dataEvidence: JSON.stringify({
          nextPage: hasMorePages ? fetchedPage + 1 : 1,
          icpVersion: icp.version,
          totalPages: pagination.total_pages,
          totalEntries: pagination.total_entries,
        }),
      },
    });
  } catch (err) {
    console.error("[icp-engine] Prospecting cycle failed:", err);
    await prisma.prospectSearch.update({
      where: { id: search.id },
      data: { status: "draft" },
    });
    throw err;
  }

  console.log(
    `[icp-engine] Prospecting cycle complete: ${searched} searched, ${accepted} accepted, ${rejected} rejected (v${icp.version})`
  );

  return { searched, accepted, rejected };
}

// ============================================
// SELF-OPTIMIZATION ENGINE
// ============================================

/**
 * Analyzes closed deals to drift ICP scoring weights.
 * Only runs after 10+ closed deals. Compares signal presence in won vs lost deals.
 * Creates a new ICP version, preserves the old one, logs the change.
 */
export async function optimizeICP(): Promise<{ optimized: boolean; reason: string }> {
  const closedDeals = await prisma.deal.findMany({
    where: { stage: { in: ["closed_won", "closed_lost"] } },
    include: {
      contact: {
        include: { company: true },
      },
    },
  });

  if (closedDeals.length < 10) {
    return {
      optimized: false,
      reason: `Only ${closedDeals.length}/10 closed deals. Need more data.`,
    };
  }

  const wonDeals = closedDeals.filter((d) => d.stage === "closed_won");
  const lostDeals = closedDeals.filter((d) => d.stage === "closed_lost");

  if (wonDeals.length < 3) {
    return {
      optimized: false,
      reason: `Only ${wonDeals.length} won deals. Need at least 3 wins for optimization.`,
    };
  }

  const currentICP = await getActiveICP();

  // Analyze signal correlation with wins
  function signalRate(deals: typeof closedDeals, signal: (d: typeof closedDeals[0]) => boolean) {
    if (deals.length === 0) return 0;
    return deals.filter(signal).length / deals.length;
  }

  // Industry analysis
  const industryWinRates = new Map<string, { wins: number; total: number }>();
  for (const deal of closedDeals) {
    const industry = deal.contact?.company?.industry || "Unknown";
    const entry = industryWinRates.get(industry) || { wins: 0, total: 0 };
    entry.total++;
    if (deal.stage === "closed_won") entry.wins++;
    industryWinRates.set(industry, entry);
  }

  // Title analysis
  const titleWinRates = new Map<string, { wins: number; total: number }>();
  for (const deal of closedDeals) {
    const title = deal.contact?.jobTitle || "Unknown";
    const entry = titleWinRates.get(title) || { wins: 0, total: 0 };
    entry.total++;
    if (deal.stage === "closed_won") entry.wins++;
    titleWinRates.set(title, entry);
  }

  // Employee range analysis
  const wonEmployeeCounts = wonDeals
    .map((d) => d.contact?.company?.size)
    .filter(Boolean) as string[];
  const lostEmployeeCounts = lostDeals
    .map((d) => d.contact?.company?.size)
    .filter(Boolean) as string[];

  // Revenue analysis
  const wonRevenues = wonDeals
    .map((d) => d.contact?.company?.revenue)
    .filter((r): r is number => r !== null && r !== undefined);
  const lostRevenues = lostDeals
    .map((d) => d.contact?.company?.revenue)
    .filter((r): r is number => r !== null && r !== undefined);

  // Calculate new weights based on win correlation
  const baseWeight = currentICP.weights;
  const newWeights = { ...baseWeight };

  // Adjust industry weight based on industry diversity in wins
  const topIndustries = [...industryWinRates.entries()]
    .filter(([, v]) => v.total >= 2)
    .sort((a, b) => (b[1].wins / b[1].total) - (a[1].wins / a[1].total));

  if (topIndustries.length > 0) {
    const topWinRate = topIndustries[0][1].wins / topIndustries[0][1].total;
    if (topWinRate > 0.7) {
      // Strong industry signal — boost weight
      newWeights.industryMatch = Math.min(30, baseWeight.industryMatch + 5);
    } else if (topWinRate < 0.3) {
      // Weak industry signal — reduce weight
      newWeights.industryMatch = Math.max(5, baseWeight.industryMatch - 5);
    }
  }

  // Adjust title weight
  const decisionMakerWinRate = signalRate(wonDeals, (d) =>
    currentICP.decisionMakerTitles.some((t) =>
      (d.contact?.jobTitle || "").toLowerCase().includes(t.toLowerCase())
    )
  );
  const decisionMakerLossRate = signalRate(lostDeals, (d) =>
    currentICP.decisionMakerTitles.some((t) =>
      (d.contact?.jobTitle || "").toLowerCase().includes(t.toLowerCase())
    )
  );

  if (decisionMakerWinRate > decisionMakerLossRate + 0.2) {
    newWeights.decisionMakerTitle = Math.min(35, baseWeight.decisionMakerTitle + 5);
  }

  // Adjust revenue weight based on won deal company revenues
  if (wonRevenues.length > 0) {
    const avgWonRevenue = wonRevenues.reduce((a, b) => a + b, 0) / wonRevenues.length;
    const avgLostRevenue = lostRevenues.length > 0
      ? lostRevenues.reduce((a, b) => a + b, 0) / lostRevenues.length
      : 0;

    if (avgWonRevenue > avgLostRevenue * 1.5) {
      newWeights.revenueRangeMatch = Math.min(20, baseWeight.revenueRangeMatch + 5);
    }
  }

  // Check if weights actually changed
  const weightsChanged = Object.keys(newWeights).some(
    (k) => newWeights[k as keyof typeof newWeights] !== baseWeight[k as keyof typeof baseWeight]
  );

  if (!weightsChanged) {
    return {
      optimized: false,
      reason: "Analysis complete but weights did not change. Current config is performing well.",
    };
  }

  // Build top-performing industries from data
  const optimizedIndustries = topIndustries
    .filter(([, v]) => v.wins / v.total >= 0.4 && v.total >= 2)
    .map(([industry]) => industry);

  // Build the new ICP config
  const newICP: ICPConfig = {
    ...currentICP,
    version: currentICP.version + 1,
    weights: newWeights,
    targetIndustries: optimizedIndustries.length >= 3
      ? optimizedIndustries
      : currentICP.targetIndustries,
  };

  // Deactivate the old version
  await prisma.iCPProfile.updateMany({
    where: { isActive: true },
    data: { isActive: false },
  });

  // Create the new version
  await prisma.iCPProfile.create({
    data: {
      version: newICP.version,
      isActive: true,
      industries: JSON.stringify(
        optimizedIndustries.map((i, idx) => ({
          name: i,
          weight: industryWinRates.get(i)?.wins || 0,
          winRate: industryWinRates.get(i)
            ? (industryWinRates.get(i)!.wins / industryWinRates.get(i)!.total * 100).toFixed(0) + "%"
            : "N/A",
        }))
      ),
      jobTitles: JSON.stringify(
        [...titleWinRates.entries()]
          .filter(([, v]) => v.wins > 0)
          .sort((a, b) => b[1].wins - a[1].wins)
          .map(([title, v]) => ({
            title,
            wins: v.wins,
            total: v.total,
            winRate: ((v.wins / v.total) * 100).toFixed(0) + "%",
          }))
      ),
      companySizes: JSON.stringify({
        wonDistribution: wonEmployeeCounts,
        lostDistribution: lostEmployeeCounts,
      }),
      revenueRanges: JSON.stringify({
        wonAvg: wonRevenues.length > 0
          ? wonRevenues.reduce((a, b) => a + b, 0) / wonRevenues.length
          : null,
        lostAvg: lostRevenues.length > 0
          ? lostRevenues.reduce((a, b) => a + b, 0) / lostRevenues.length
          : null,
      }),
      apolloSearchParams: JSON.stringify(newICP),
      totalDealsAnalyzed: closedDeals.length,
      winRate: wonDeals.length / closedDeals.length,
      avgDealSize: wonDeals.reduce((a, d) => a + (d.actualAmount || d.amount || 0), 0) / wonDeals.length || null,
    },
  });

  // Log the change
  const changes: string[] = [];
  for (const [key, newVal] of Object.entries(newWeights)) {
    const oldVal = baseWeight[key as keyof typeof baseWeight];
    if (newVal !== oldVal) {
      changes.push(`${key}: ${oldVal} -> ${newVal}`);
    }
  }

  await prisma.systemChangelog.create({
    data: {
      category: "icp_optimization",
      changeType: "weight_drift",
      description: `ICP v${currentICP.version} -> v${newICP.version}. Weight changes: ${changes.join(", ")}. Based on ${closedDeals.length} closed deals (${wonDeals.length} won, ${lostDeals.length} lost).`,
      dataEvidence: JSON.stringify({
        previousVersion: currentICP.version,
        newVersion: newICP.version,
        dealsAnalyzed: closedDeals.length,
        wonDeals: wonDeals.length,
        lostDeals: lostDeals.length,
        weightChanges: changes,
        topIndustries: topIndustries.slice(0, 5).map(([name, stats]) => ({
          name,
          winRate: ((stats.wins / stats.total) * 100).toFixed(0) + "%",
        })),
        previousWeights: baseWeight,
        newWeights,
      }),
    },
  });

  // Clear cache
  invalidateICPCache();

  console.log(
    `[icp-engine] ICP optimized: v${currentICP.version} -> v${newICP.version}. Changes: ${changes.join(", ")}`
  );

  return {
    optimized: true,
    reason: `Optimized to v${newICP.version}. ${changes.join(", ")}. Based on ${closedDeals.length} deals.`,
  };
}

// ============================================
// SEED ICP PROFILE ON FIRST BOOT
// ============================================

export async function seedICPIfEmpty(): Promise<void> {
  const existing = await prisma.iCPProfile.findFirst({
    where: { isActive: true },
    orderBy: { version: "desc" },
  });

  // Update existing v1 seed config if ANY config has drifted from the seed
  if (existing && existing.version === 1) {
    const currentConfig = safeParseJSON(existing.apolloSearchParams, null) as ICPConfig | null;
    // Compare full serialized config to detect any drift: weights, threshold, titles,
    // employee range, revenue range, geography, technology, job posting keywords, etc.
    const isStale = currentConfig &&
      JSON.stringify(currentConfig) !== JSON.stringify(SEED_ICP);
    if (isStale) {
      await prisma.iCPProfile.update({
        where: { id: existing.id },
        data: { apolloSearchParams: JSON.stringify(SEED_ICP) },
      });
      invalidateICPCache();
      console.log("[icp-engine] Updated stale ICP v1 config (detected config drift from seed)");
    }
    return;
  }

  if (existing) return;

  await prisma.iCPProfile.create({
    data: {
      version: 1,
      isActive: true,
      industries: JSON.stringify(
        SEED_ICP.targetIndustries.map((i) => ({ name: i, weight: 1 }))
      ),
      jobTitles: JSON.stringify(
        SEED_ICP.decisionMakerTitles.map((t) => ({ title: t, priority: 1 }))
      ),
      companySizes: JSON.stringify({ range: "10-500" }),
      revenueRanges: JSON.stringify({ min: 1_000_000, max: 50_000_000 }),
      techStack: JSON.stringify(["HubSpot"]),
      geographies: JSON.stringify(["United States"]),
      growthSignals: JSON.stringify(SEED_ICP.jobPostingKeywords),
      apolloSearchParams: JSON.stringify(SEED_ICP),
      totalDealsAnalyzed: 0,
    },
  });

  console.log("[icp-engine] Seeded ICP profile v1");
}
