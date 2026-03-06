// Ticket Intelligence Engine
// Turns support tickets into revenue signals:
// 1. High ticket volume + negative sentiment → churn prevention
// 2. Capability requests outside scope → upsell opportunity
// 3. Fast resolution + high CSAT → referral/testimonial trigger
// 4. Scope creep patterns → upgrade conversation
// 5. Pre-renewal ticket analysis → renewal health

import { prisma } from "@/lib/prisma";
import { runAIJob } from "./job-runner";
import { safeParseJSON } from "@/lib/safe-json";
import { advanceClientStage } from "./lifecycle-engine";

export async function analyzeTicketSignals(): Promise<number> {
  let signals = 0;

  // 1. CHURN SIGNALS: 3+ tickets in 30 days with negative sentiment
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const contactsWithTickets = await prisma.ticket.groupBy({
    by: ["contactId"],
    where: {
      createdAt: { gte: thirtyDaysAgo },
      contactId: { not: null },
    },
    _count: true,
  });

  for (const group of contactsWithTickets) {
    if (!group.contactId || group._count < 3) continue;

    const negativeTickets = await prisma.ticket.count({
      where: {
        contactId: group.contactId,
        createdAt: { gte: thirtyDaysAgo },
        sentiment: "negative",
      },
    });

    if (negativeTickets >= 2) {
      // Check if already flagged recently
      const existing = await prisma.aIInsight.findFirst({
        where: {
          resourceType: "contact",
          resourceId: group.contactId,
          type: "churn_warning",
          createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
      });
      if (existing) continue;

      const contact = await prisma.contact.findUnique({
        where: { id: group.contactId },
        select: { firstName: true, lastName: true },
      });

      await prisma.aIInsight.create({
        data: {
          type: "churn_warning",
          title: `Churn risk: ${contact?.firstName} ${contact?.lastName} — ${group._count} tickets in 30 days`,
          description: `${negativeTickets} of ${group._count} recent tickets have negative sentiment. Trigger retention workflow immediately.`,
          reasoning: `3+ tickets in 30 days with ${negativeTickets} negative sentiment tickets exceeds churn threshold.`,
          priority: "critical",
          resourceType: "contact",
          resourceId: group.contactId,
          actionItems: JSON.stringify([
            { action: "Schedule retention call", priority: "immediate" },
            { action: "Review all recent tickets for patterns", priority: "today" },
            { action: "Prepare service recovery plan", priority: "today" },
          ]),
          status: "new",
        },
      });

      // Update client lifecycle to at_risk
      const cl = await prisma.clientLifecycle.findFirst({
        where: { contactId: group.contactId, stage: { notIn: ["churned", "win_back"] } },
      });
      if (cl) {
        await advanceClientStage(cl.id, "at_risk", "ticket_signal", `${group._count} tickets in 30 days, ${negativeTickets} negative`);
        await prisma.clientLifecycle.update({
          where: { id: cl.id },
          data: {
            churnRiskLevel: "critical",
            churnSignals: JSON.stringify([
              ...safeParseJSON(cl.churnSignals, [] as Record<string, unknown>[]),
              { signal: "high_ticket_volume_negative", date: new Date().toISOString(), severity: "critical" },
            ]),
          },
        });
      }

      signals++;
    }
  }

  // 2. UPSELL SIGNALS: tickets flagged as scope creep or capability requests
  const scopeTickets = await prisma.ticket.findMany({
    where: {
      scopeCreep: true,
      createdAt: { gte: thirtyDaysAgo },
      contactId: { not: null },
    },
    include: { contact: true },
  });

  // Group by contact
  const scopeByContact: Record<string, typeof scopeTickets> = {};
  for (const ticket of scopeTickets) {
    if (!ticket.contactId) continue;
    if (!scopeByContact[ticket.contactId]) scopeByContact[ticket.contactId] = [];
    scopeByContact[ticket.contactId].push(ticket);
  }

  for (const [contactId, tickets] of Object.entries(scopeByContact)) {
    if (tickets.length < 2) continue;

    const existing = await prisma.aIInsight.findFirst({
      where: {
        resourceType: "contact",
        resourceId: contactId,
        type: "upsell_opportunity",
        createdAt: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) },
      },
    });
    if (existing) continue;

    const contact = tickets[0].contact;

    // Use AI to analyze the scope creep pattern and suggest upsell
    const analysis = await runAIJob("deal_advisor", "upsell_analysis", {
      contact: { name: `${contact?.firstName} ${contact?.lastName}`, company: contact?.companyId },
      tickets: tickets.map((t) => ({ subject: t.subject, description: t.description, category: t.category })),
      instructions: "Analyze these scope creep tickets. What additional service/capability is this client asking for? Draft an upsell proposal angle. Be specific about what to offer and estimated value.",
    }, { contactId });

    const upsellAnalysis = analysis.output as { service: string; estimatedValue: number; angle: string };

    await prisma.aIInsight.create({
      data: {
        type: "upsell_opportunity",
        title: `Upsell: ${contact?.firstName} ${contact?.lastName} — ${tickets.length} scope expansion requests`,
        description: upsellAnalysis.angle || `Client has made ${tickets.length} requests outside current scope. Natural upsell opportunity.`,
        reasoning: `${tickets.length} tickets flagged as scope creep in 30 days. Pattern suggests need for expanded services.`,
        priority: "high",
        resourceType: "contact",
        resourceId: contactId,
        actionItems: JSON.stringify([
          { action: `Propose ${upsellAnalysis.service || "expanded services"}`, estimatedValue: upsellAnalysis.estimatedValue },
          { action: "Schedule upgrade discussion call", priority: "this_week" },
        ]),
        actionsTaken: JSON.stringify(["Upsell opportunity flagged"]),
        status: "new",
      },
    });

    // Update client lifecycle
    const cl = await prisma.clientLifecycle.findFirst({
      where: { contactId, stage: { notIn: ["churned", "win_back"] } },
    });
    if (cl) {
      const upsellSignals = safeParseJSON(cl.upsellSignals, [] as Record<string, unknown>[]);
      upsellSignals.push({
        signal: "scope_creep_pattern",
        date: new Date().toISOString(),
        description: `${tickets.length} scope expansion requests`,
        estimatedValue: upsellAnalysis.estimatedValue,
      });
      await prisma.clientLifecycle.update({
        where: { id: cl.id },
        data: {
          upsellSignals: JSON.stringify(upsellSignals),
          scopeCreepCount: { increment: tickets.length },
          expansionOpportunity: JSON.stringify(upsellAnalysis),
        },
      });
    }

    signals++;
  }

  // 3. REFERRAL SIGNALS: resolved tickets with positive sentiment + high CSAT/NPS
  const happyClients = await prisma.clientLifecycle.findMany({
    where: {
      stage: "active",
      healthScore: { gte: 80 },
    },
    include: { contact: true },
  });

  for (const cl of happyClients) {
    // Check for recent positive resolution
    const recentResolved = await prisma.ticket.count({
      where: {
        contactId: cl.contactId,
        status: "closed",
        sentiment: "positive",
        resolvedAt: { gte: thirtyDaysAgo },
      },
    });

    // Check for high NPS
    const nps = await prisma.feedbackSurvey.findFirst({
      where: { contactId: cl.contactId, type: "nps", score: { gte: 9 } },
      orderBy: { createdAt: "desc" },
    });

    // Check client tenure (> 6 months)
    const tenureMonths = cl.contractStartDate
      ? Math.floor((Date.now() - cl.contractStartDate.getTime()) / (1000 * 60 * 60 * 24 * 30))
      : 0;

    if (recentResolved > 0 && nps && tenureMonths >= 6) {
      const existing = await prisma.aIInsight.findFirst({
        where: {
          resourceType: "contact",
          resourceId: cl.contactId,
          type: "referral_opportunity",
          createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
      });
      if (existing) continue;

      await prisma.aIInsight.create({
        data: {
          type: "referral_opportunity",
          title: `Referral opportunity: ${cl.contact.firstName} ${cl.contact.lastName} (NPS ${nps.score}, ${tenureMonths}mo tenure)`,
          description: `Happy client with high NPS, positive ticket resolutions, and ${tenureMonths} months tenure. Prime candidate for referral request, testimonial, or case study.`,
          priority: "medium",
          resourceType: "contact",
          resourceId: cl.contactId,
          actionItems: JSON.stringify([
            { action: "Send referral program invitation", priority: "this_week" },
            { action: "Request testimonial or case study participation", priority: "this_month" },
          ]),
          status: "new",
        },
      });

      signals++;
    }
  }

  // 4. PRE-RENEWAL ANALYSIS: 30 days before renewal + ticket health check
  const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const upForRenewal = await prisma.clientLifecycle.findMany({
    where: {
      renewalDate: { lte: thirtyDaysFromNow, gte: new Date() },
      stage: { notIn: ["churned", "win_back"] },
    },
    include: { contact: true },
  });

  for (const cl of upForRenewal) {
    const ticketCount = await prisma.ticket.count({
      where: { contactId: cl.contactId, createdAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) } },
    });
    const negativeCount = await prisma.ticket.count({
      where: { contactId: cl.contactId, sentiment: "negative", createdAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) } },
    });

    const renewalRisk = negativeCount > 2 ? "high" : negativeCount > 0 ? "medium" : "low";

    const existing = await prisma.aIInsight.findFirst({
      where: {
        resourceType: "client_lifecycle",
        resourceId: cl.id,
        type: { in: ["churn_warning", "deal_risk"] },
        createdAt: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) },
      },
    });
    if (existing) continue;

    if (cl.stage !== "renewal") {
      await advanceClientStage(cl.id, "renewal", "ai_auto", "30 days before contract renewal");
    }

    await prisma.aIInsight.create({
      data: {
        type: renewalRisk === "high" ? "churn_warning" : "deal_risk",
        title: `Renewal in ${Math.floor((cl.renewalDate!.getTime() - Date.now()) / (1000 * 60 * 60 * 24))} days: ${cl.contact.firstName} ${cl.contact.lastName}`,
        description: `${ticketCount} tickets in last 90 days (${negativeCount} negative). Renewal risk: ${renewalRisk}. ${cl.contractValue ? `Contract value: $${cl.contractValue.toLocaleString()}` : ""}`,
        priority: renewalRisk === "high" ? "critical" : "high",
        resourceType: "client_lifecycle",
        resourceId: cl.id,
        actionItems: JSON.stringify([
          { action: "Schedule renewal check-in call", priority: "this_week" },
          renewalRisk !== "low" ? { action: "Prepare retention offer", priority: "this_week" } : null,
          { action: "Review service delivery quality", priority: "today" },
        ].filter(Boolean)),
        status: "new",
      },
    });

    signals++;
  }

  return signals;
}

// Classify a single ticket for revenue signals (called on ticket create/update)
export async function classifyTicket(ticketId: string): Promise<void> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: { contact: true },
  });
  if (!ticket) return;

  const result = await runAIJob("reply_analyzer", "ticket_classification", {
    ticket: {
      subject: ticket.subject,
      description: ticket.description,
      category: ticket.category,
      priority: ticket.priority,
    },
    contact: ticket.contact
      ? { name: `${ticket.contact.firstName} ${ticket.contact.lastName}`, jobTitle: ticket.contact.jobTitle }
      : null,
    instructions: `Classify this support ticket for revenue signals:
1. sentiment: positive, neutral, or negative
2. scopeCreep: true if this requests something outside typical service scope (new feature, additional service, capability expansion)
3. churnSignal: true if this indicates frustration, dissatisfaction, or mentions leaving/canceling
4. upsellSignal: true if they're asking about capabilities they don't have (upgrade opportunity)
Return JSON: { sentiment, scopeCreep, churnSignal, upsellSignal }`,
  });

  const classification = result.output as {
    sentiment: string;
    scopeCreep: boolean;
    churnSignal: boolean;
    upsellSignal: boolean;
  };

  await prisma.ticket.update({
    where: { id: ticketId },
    data: {
      sentiment: classification.sentiment,
      scopeCreep: classification.scopeCreep,
      churnSignal: classification.churnSignal,
      upsellSignal: classification.upsellSignal,
    },
  });
}
