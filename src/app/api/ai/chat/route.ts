import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { aiComplete } from "@/lib/ai/claude";
import { auth } from "@/lib/auth";

// Deep system knowledge — the agent needs to understand how this CRM actually works
const SYSTEM_KNOWLEDGE = `
YOU ARE THE OPERATIONS AGENT FOR AN AUTONOMOUS AGENCY CRM.
You have full read access to the production database. You understand the system's architecture deeply.

=== LIFECYCLE ENGINE ===
Contact stages (forward-only): subscriber → lead → mql → sql → opportunity → customer → evangelist
Deal stages: discovery → proposal_sent → negotiation → contract_sent → closed_won / closed_lost
Lead pipeline: new → attempting → connected → qualified / disqualified

Stage gate rules:
- subscriber → lead: any engagement (form submit, email click, activity)
- lead → mql: leadScore >= 60
- mql → sql: BANT 3/4 required (bantBudget, bantAuthority, bantNeed, bantTimeline must be non-empty). This is the most common blocker.
- sql → opportunity: meeting booked or deal created
- opportunity → customer: deal closed_won
- customer → evangelist: confidence >= 0.9 from AI analysis

BANT scoring: bantBudget="confirmed", bantAuthority="decision_maker", bantNeed="confirmed", bantTimeline in ["immediate","1_3_months"] = counted as filled.
The BANT gate checks raw field existence (not null/empty), not the specific values. bantScore is a computed count 0-4.

When mql→sql gate rejects: system stores bantGapSummary on Contact, auto-enrolls in bant_qualification sequence, sequence generates emails targeting missing fields.
When bant_qualification sequence completes with no reply: system decides re-enroll (fit>=50, engagement>=20), escalate to Vapi call (2+ failures, has phone), or disqualify (fit<30 or 3+ attempts).

=== SCORING ===
Dual scoring: fitScore (0-55, persists, based on ICP match) + engagementScore (0-45, decays 25%/month)
leadScore = fitScore + engagementScore (capped at 100)
scoreDirty flag triggers re-scoring on next batch run.

=== SEQUENCES ===
Types: outreach (cold), bant_qualification (gap recovery), nurture, re_engagement
Channel lock: one prospect, one active channel, one sequence at a time.
Domain handoff: Instantly (cold/pre-warmed) → warm intent detected → Gmail API (branded agency domain).
Copy generated at send time using full contact intelligence (not pre-written).

=== AUTONOMOUS OPERATIONS ===
Worker: 30-second tick loop processes sequences, meetings, scheduled jobs.
Daily autopilot (6 AM UTC): score decay, batch scoring, lifecycle auto-advance, deal risk scan, engagement drops, channel escalations, Apollo signals, domain handoffs, feedback loop, Vapi follow-ups, content publishing, client health, renewals.
Sunday: self-optimization engine rewrites ICP, recalibrates scoring, adjusts gates, rewrites sequences, content calendar.

=== INTEGRATIONS ===
Apollo.io: prospect discovery + enrichment
Instantly.ai: cold email (pre-warmed domains)
Gmail API: warm/branded email + inbox sync
Google Calendar: availability for meeting booking
PandaDocs: auto-generated proposals
Stripe: billing on closed_won
Vapi: AI voice calls (inbound + outbound)
tl;dv: meeting transcript delivery
Zapier: LinkedIn/Twitter publishing
`;

const SCHEMA_REFERENCE = `
=== DATABASE SCHEMA (read-only access) ===
Contact: id, firstName, lastName, email, phone, jobTitle, lifecycleStage, leadStatus, fitScore, engagementScore, leadScore, bantBudget, bantAuthority, bantNeed, bantTimeline, bantScore, bantGapSummary, bantNotes (JSON verbatim quotes), domainTier, source, companyId, scoreDirty, lastScoreEvaluated, stageEnteredAt, stageHistory (JSON), createdAt
Company: id, name, domain, industry, size, revenue, description, lifecycleStage
Deal: id, name, stage, pipeline, amount, probability, contactId, companyId, stageEnteredAt, closedAt, lostReason
Lead: id, contactId, companyId, stage, bantBudget, bantAuthority, bantNeed, bantTimeline, source, channel, disqualifyReason, qualifiedAt, disqualifiedAt
Sequence: id, name, description, type, steps (JSON), isActive, aiGenerated
SequenceEnrollment: id, sequenceId, contactId, status (active/paused/completed/bounced/replied/unsubscribed), currentStep, channel, nextActionAt, metadata (JSON with bantGapSummary for bant_qualification), completedAt
AIInsight: id, type, title, description, reasoning, priority, resourceType, resourceId, status, actionItems (JSON), actionsTaken (JSON)
AIJob: id, type, status, agentId, error, tokens, cost, createdAt, completedAt
  AIAgent: id, name, description, systemPrompt
AIConversationLog: id, contactId, channel, direction, rawContent, aiSummary, sentiment, intent, actionTaken, autoActioned
SystemChangelog: id, category, changeType, description, evidence (JSON), expectedImpact, previousValue (JSON), newValue (JSON)
ICPProfile: id, version, industries, companySizes, jobTitles, geographies, revenueRanges, seniorityLevels, excludeIndustries, totalDealsAnalyzed, winRate, avgDealSize, avgTimeToClose, isActive
Activity: id, type, subject, body, contactId, dealId, duration, outcome
EmailEvent: id, contactId, type (sent/delivered/opened/clicked/bounced/complained/unsubscribed)
ContentCalendar: id, weekStarting, channel, topic, angle, status
ContentDraft: id, calendarId, channel, title, body, voiceScore, status, publishedAt
SequencePerformance: id, sequenceId, stepNumber, channel, sent, opened, replied, positiveReplied, bounced, meetingsBooked, openRate, replyRate, positiveReplyRate
StageGateAccuracy: id, stageGateId, weekNumber, year, totalDecisions, truePositives, falsePositives, accuracy
LifecycleTransition: id, contactId, fromStage, toStage, triggeredBy, reason, confidence, createdAt
`;

const MAX_QUERIES = 4;

async function executeQuery(queryDescription: string): Promise<string> {
  const queryResult = await aiComplete({
    system: `You are a Prisma query generator for PostgreSQL. Return ONLY a valid JavaScript expression using the \`prisma\` client. No explanation.
${SCHEMA_REFERENCE}
Rules:
- Single prisma expression. Examples:
  prisma.contact.findMany({ where: { lifecycleStage: "mql" }, take: 20, select: { id: true, firstName: true, lastName: true, bantScore: true, bantBudget: true, bantAuthority: true, bantNeed: true, bantTimeline: true, bantGapSummary: true, fitScore: true, engagementScore: true } })
  prisma.contact.count({ where: { lifecycleStage: "mql", bantScore: { lt: 3 } } })
  prisma.sequenceEnrollment.findMany({ where: { status: "active", sequence: { type: "bant_qualification" } }, take: 10, include: { contact: { select: { firstName: true, lastName: true } }, sequence: { select: { name: true } } } })
- Always use select or include to limit fields
- Always use take (max 25) on findMany
- For counts use .count(), for sums use .aggregate()
- For time ranges: new Date(Date.now() - N * 24 * 60 * 60 * 1000)
- Return ONLY the expression`,
    messages: [{ role: "user", content: queryDescription }],
    maxTokens: 500,
    temperature: 0,
  });

  const expr = queryResult.text.trim().replace(/^```\w*\n?/, "").replace(/\n?```$/, "").trim();

  if (!expr.startsWith("prisma.") && !expr.startsWith("prisma.$")) {
    return JSON.stringify({ error: "Invalid query expression", generated: expr });
  }

  const forbidden = [/\.delete/, /\.update/, /\.create/, /\.upsert/, /\$execute/, /DROP|ALTER|INSERT|UPDATE|DELETE/i];
  if (forbidden.some((re) => re.test(expr))) {
    return JSON.stringify({ error: "Write operations not allowed" });
  }

  try {
    // eslint-disable-next-line no-eval
    const result = await eval(`(async () => { const { prisma } = await import("@/lib/prisma"); return ${expr}; })()`);
    const json = JSON.stringify(result, null, 2);
    // Truncate very large results
    return json.length > 8000 ? json.slice(0, 8000) + "\n... (truncated)" : json;
  } catch (err) {
    return JSON.stringify({ error: `Query failed: ${err instanceof Error ? err.message : String(err)}`, expression: expr });
  }
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { message, history } = await request.json() as {
    message: string;
    history: { role: "user" | "assistant"; content: string }[];
  };

  if (!message || typeof message !== "string") {
    return NextResponse.json({ error: "Message required" }, { status: 400 });
  }

  // Pre-fetch live system snapshot
  const [contactStats, dealStats, recentErrors, activeEnrollments] = await Promise.all([
    prisma.contact.groupBy({ by: ["lifecycleStage"], _count: true }),
    prisma.deal.groupBy({ by: ["stage"], _count: true, _sum: { amount: true } }),
    prisma.aIJob.findMany({
      where: { status: "failed", createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
      select: { type: true, error: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.sequenceEnrollment.count({ where: { status: "active" } }),
  ]);

  const liveSnapshot = `LIVE SNAPSHOT:
Contacts by stage: ${contactStats.map((s) => `${s.lifecycleStage}=${s._count}`).join(", ")}
Deals by stage: ${dealStats.map((s) => `${s.stage}=${s._count}($${((s._sum.amount || 0) / 1000).toFixed(0)}k)`).join(", ")}
Active enrollments: ${activeEnrollments}
Errors (7d): ${recentErrors.length === 0 ? "None" : recentErrors.map((e) => `${e.type}: ${(e.error || "").slice(0, 80)}`).join(" | ")}`;

  const systemPrompt = `${SYSTEM_KNOWLEDGE}

${SCHEMA_REFERENCE}

${liveSnapshot}

=== YOUR ROLE ===
You are the system operations agent. You diagnose problems, answer questions about system state, and surface what matters.

When the user asks a question, you often need MULTIPLE database lookups to give a complete answer. Use __QUERY__ tags to request them.

Format: Include one or more __QUERY__: lines in your response when you need data. Each will be executed and results returned to you.

Examples of good multi-query diagnostic thinking:
- "Why is contact X stuck at MQL?" → Query the contact's BANT fields, their sequence enrollments, their conversation logs, and any insights about them
- "Which sequences perform best?" → Query SequencePerformance aggregated by sequenceId with the Sequence names
- "What happened overnight?" → Query SystemChangelog and AIInsight from the last 24 hours

You can request up to ${MAX_QUERIES} queries per response. After receiving results, synthesize a clear answer.

RULES:
- Be direct. No filler. This is a founder who wants signal, not noise.
- When diagnosing a stuck contact, always check: BANT fields, sequence enrollments, conversation history, and insights.
- When asked "why", explain the business rule that's blocking, not just the data.
- Format data cleanly — tables, bullet points. Never dump raw JSON.
- If something looks wrong (stuck contacts, failing jobs, dead sequences), say so proactively.`;

  // Conversation with query loop
  const conversationMessages: { role: "user" | "assistant"; content: string }[] = [
    ...(history || []).slice(-10),
    { role: "user", content: message },
  ];

  let finalResponse = "";

  for (let pass = 0; pass < 3; pass++) {
    const result = await aiComplete({
      system: systemPrompt,
      messages: conversationMessages,
      maxTokens: 2048,
      temperature: 0.3,
    });

    const text = result.text;

    // Extract all __QUERY__ lines
    const queryLines = text.split("\n").filter((l) => l.trim().startsWith("__QUERY__:"));

    if (queryLines.length === 0) {
      // No queries needed — this is the final answer
      finalResponse = text;
      break;
    }

    // Execute all queries (up to MAX_QUERIES)
    const queries = queryLines.slice(0, MAX_QUERIES).map((l) => l.replace("__QUERY__:", "").trim());
    const results: string[] = [];

    for (const q of queries) {
      const r = await executeQuery(q);
      results.push(`Query: ${q}\nResult:\n${r}`);
    }

    // Remove query lines from the AI's text to get any reasoning it wrote
    const reasoning = text.split("\n").filter((l) => !l.trim().startsWith("__QUERY__:")).join("\n").trim();

    // Feed results back for synthesis
    conversationMessages.push({
      role: "assistant",
      content: reasoning || "(querying database...)",
    });
    conversationMessages.push({
      role: "user",
      content: `Database results:\n\n${results.join("\n\n")}\n\nNow synthesize a clear answer to my original question using these results and your knowledge of the system. If you need more data, you can request more __QUERY__ lines. Otherwise, give me the final answer.`,
    });
  }

  // If we exhausted passes without a clean answer, do one final synthesis
  if (!finalResponse) {
    const final = await aiComplete({
      system: systemPrompt,
      messages: conversationMessages,
      maxTokens: 2048,
      temperature: 0.3,
    });
    finalResponse = final.text;
  }

  return NextResponse.json({ response: finalResponse });
}
