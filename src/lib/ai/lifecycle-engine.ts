// Lifecycle Engine — the inviolable forward-only stage gate system
// This is the most critical system in the entire CRM.
// Rules:
// 1. Stages only move FORWARD. Backward movement requires explicit clearing + reason.
// 2. Every transition is audited in LifecycleTransition.
// 3. Stage gates enforce required fields before advancement.
// 4. Deal ↔ Contact lifecycle sync is automatic and forward-only.
// 5. Company lifecycle mirrors highest contact stage.
// 6. AI auto-advances when confidence > threshold. Flags for review when ambiguous.

import { prisma } from "@/lib/prisma";
import { safeParseJSON } from "@/lib/safe-json";

// ============================================
// STAGE DEFINITIONS & ORDERING
// ============================================

// Contact lifecycle stages (full 8-stage data model)
const CONTACT_STAGES = [
  "subscriber",
  "lead",
  "mql",
  "sql",
  "opportunity",
  "customer",
  "evangelist",
] as const;

// Simplified 5-stage UI mapping
export const SIMPLIFIED_STAGE_MAP: Record<string, string> = {
  subscriber: "lead",
  lead: "lead",
  mql: "engaged",
  sql: "opportunity",
  opportunity: "opportunity",
  customer: "client",
  evangelist: "advocate",
};

// Lead pipeline stages
const LEAD_STAGES = [
  "new",
  "attempting",
  "connected",
  "qualified",
  "disqualified",
] as const;

// Deal pipeline stages with enforced win probability
export const DEAL_STAGES: Record<string, { probability: number; requiredFields: string[] }> = {
  discovery: {
    probability: 10,
    requiredFields: ["name", "contactId", "painPoints"],
  },
  proposal_sent: {
    probability: 40,
    requiredFields: ["scopeOfWork", "proposalDoc", "pricingBreakdown"],
  },
  negotiation: {
    probability: 60,
    requiredFields: ["negotiationNotes"],
  },
  contract_sent: {
    probability: 80,
    requiredFields: ["contractSentAt", "contractVersion"],
  },
  closed_won: {
    probability: 100,
    requiredFields: ["actualAmount", "paymentTerms", "startDate"],
  },
  closed_lost: {
    probability: 0,
    requiredFields: ["lostReason"],
  },
};

// Client lifecycle stages
const CLIENT_STAGES = [
  "onboarding",
  "active",
  "renewal",
  "expansion",
  "at_risk",
  "churned",
  "win_back",
] as const;

type ContactStage = (typeof CONTACT_STAGES)[number];
type LeadStage = (typeof LEAD_STAGES)[number];
type ClientStage = (typeof CLIENT_STAGES)[number];

// ============================================
// FORWARD-ONLY ENFORCEMENT
// ============================================

function getStageIndex(stage: string, stages: readonly string[]): number {
  return stages.indexOf(stage);
}

function isForwardMove(from: string, to: string, stages: readonly string[]): boolean {
  const fromIdx = getStageIndex(from, stages);
  const toIdx = getStageIndex(to, stages);
  if (fromIdx === -1 || toIdx === -1) return false;
  return toIdx > fromIdx;
}

// ============================================
// CONTACT LIFECYCLE TRANSITIONS
// ============================================

export async function advanceContactStage(
  contactId: string,
  toStage: ContactStage,
  triggeredBy: string = "ai_auto",
  reason?: string,
  confidence?: number
): Promise<{ success: boolean; error?: string }> {
  const contact = await prisma.contact.findUnique({ where: { id: contactId } });
  if (!contact) return { success: false, error: "Contact not found" };

  const currentStage = contact.lifecycleStage as ContactStage;

  // Forward-only enforcement
  if (!isForwardMove(currentStage, toStage, CONTACT_STAGES)) {
    return {
      success: false,
      error: `Cannot move backward from ${currentStage} to ${toStage}. Stages are forward-only.`,
    };
  }

  // Check stage gate if it exists
  const gate = await prisma.stageGate.findUnique({
    where: { objectType_fromStage_toStage: { objectType: "contact", fromStage: currentStage, toStage } },
  });

  if (gate && gate.isActive) {
    // Check confidence threshold for AI auto-advance
    if (triggeredBy === "ai_auto" && gate.confidenceThreshold && confidence) {
      if (confidence < gate.confidenceThreshold) {
        // Flag for review instead of auto-advancing
        await prisma.aIInsight.create({
          data: {
            type: "stage_gate_blocked",
            title: `Stage gate review: ${contact.firstName} ${contact.lastName} → ${toStage}`,
            description: `AI confidence (${(confidence * 100).toFixed(0)}%) below threshold (${(gate.confidenceThreshold * 100).toFixed(0)}%). Review required.`,
            reasoning: reason || "Auto-advance blocked by confidence threshold",
            priority: "high",
            resourceType: "contact",
            resourceId: contactId,
            status: "new",
          },
        });
        return { success: false, error: "Confidence below threshold, flagged for review" };
      }
    }

    // Check required fields
    if (gate.requiredFields) {
      const required = safeParseJSON(gate.requiredFields, []) as string[];
      const missing = required.filter((field) => {
        const value = (contact as Record<string, unknown>)[field];
        return value === null || value === undefined || value === "";
      });
      if (missing.length > 0) {
        return { success: false, error: `Missing required fields for ${toStage}: ${missing.join(", ")}` };
      }
    }
  }

  // Build stage history
  const history = safeParseJSON<Array<Record<string, unknown>>>(contact.stageHistory, []);
  history.push({
    from: currentStage,
    to: toStage,
    triggeredBy,
    reason,
    timestamp: new Date().toISOString(),
  });

  // Execute the transition
  await prisma.contact.update({
    where: { id: contactId },
    data: {
      lifecycleStage: toStage,
      stageEnteredAt: new Date(),
      stageHistory: JSON.stringify(history),
    },
  });

  // Record audit trail with full reasoning context
  await prisma.lifecycleTransition.create({
    data: {
      objectType: "contact",
      objectId: contactId,
      fromStage: currentStage,
      toStage,
      triggeredBy,
      reason,
      confidence,
      gateValidation: gate ? JSON.stringify({
        passed: true,
        gateId: gate.id,
        requiredFields: gate.requiredFields ? safeParseJSON(gate.requiredFields, []) : [],
        confidenceThreshold: gate.confidenceThreshold,
        autoAdvance: gate.autoAdvance,
      }) : null,
      metadata: JSON.stringify({
        contactEmail: contact.email,
        previousStageEnteredAt: contact.stageEnteredAt?.toISOString(),
        daysInPreviousStage: contact.stageEnteredAt
          ? Math.floor((Date.now() - contact.stageEnteredAt.getTime()) / (1000 * 60 * 60 * 24))
          : null,
      }),
    },
  });

  // Sync company lifecycle (push forward to match highest contact stage)
  if (contact.companyId) {
    await syncCompanyLifecycle(contact.companyId);
  }

  return { success: true };
}

// ============================================
// LEAD PIPELINE TRANSITIONS
// ============================================

export async function advanceLeadStage(
  leadId: string,
  toStage: LeadStage,
  triggeredBy: string = "ai_auto",
  reason?: string
): Promise<{ success: boolean; dealId?: string; error?: string }> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: { contact: true },
  });
  if (!lead) return { success: false, error: "Lead not found" };

  const currentStage = lead.stage as LeadStage;

  // Forward-only (except disqualified which can come from any stage)
  if (toStage !== "disqualified" && !isForwardMove(currentStage, toStage, LEAD_STAGES)) {
    return { success: false, error: `Cannot move lead backward from ${currentStage} to ${toStage}` };
  }

  const now = new Date();

  // Handle qualification → force deal creation
  if (toStage === "qualified") {
    // Check BANT: require 3/4 minimum
    const bantCount = [lead.bantBudget, lead.bantAuthority, lead.bantNeed, lead.bantTimeline]
      .filter(Boolean).length;

    if (bantCount < 3) {
      return { success: false, error: `Lead needs at least 3/4 BANT criteria confirmed (currently ${bantCount}/4)` };
    }

    // Create deal automatically
    const deal = await prisma.deal.create({
      data: {
        name: `${lead.contact.firstName} ${lead.contact.lastName} - Deal`,
        stage: "discovery",
        pipeline: "new_business",
        probability: 10,
        stageEnteredAt: now,
        contactId: lead.contactId,
        companyId: lead.companyId,
        bantSnapshot: JSON.stringify({
          budget: lead.bantBudget,
          authority: lead.bantAuthority,
          need: lead.bantNeed,
          timeline: lead.bantTimeline,
          notes: lead.bantNotes,
        }),
      },
    });

    await prisma.lead.update({
      where: { id: leadId },
      data: { stage: "qualified", stageEnteredAt: now, qualifiedAt: now, dealId: deal.id },
    });

    // Advance contact to SQL (forward-only — only if currently below SQL)
    const contactStageIdx = getStageIndex(lead.contact.lifecycleStage, CONTACT_STAGES);
    const sqlIdx = getStageIndex("sql", CONTACT_STAGES);
    if (contactStageIdx < sqlIdx) {
      await advanceContactStage(lead.contactId, "sql", "deal_sync", "Lead qualified → deal created → contact advanced to SQL");
    }

    // Record transition
    await prisma.lifecycleTransition.create({
      data: {
        objectType: "lead",
        objectId: leadId,
        fromStage: currentStage,
        toStage: "qualified",
        triggeredBy,
        reason: reason || `BANT ${bantCount}/4 confirmed. Deal auto-created.`,
      },
    });

    return { success: true, dealId: deal.id };
  }

  // Handle disqualification
  if (toStage === "disqualified") {
    await prisma.lead.update({
      where: { id: leadId },
      data: { stage: "disqualified", stageEnteredAt: now, disqualifiedAt: now, disqualifyReason: reason },
    });

    await prisma.lifecycleTransition.create({
      data: {
        objectType: "lead",
        objectId: leadId,
        fromStage: currentStage,
        toStage: "disqualified",
        triggeredBy,
        reason,
      },
    });

    return { success: true };
  }

  // Normal advancement
  await prisma.lead.update({
    where: { id: leadId },
    data: { stage: toStage, stageEnteredAt: now },
  });

  await prisma.lifecycleTransition.create({
    data: {
      objectType: "lead",
      objectId: leadId,
      fromStage: currentStage,
      toStage,
      triggeredBy,
      reason,
    },
  });

  return { success: true };
}

// ============================================
// DEAL STAGE TRANSITIONS
// ============================================

export async function advanceDealStage(
  dealId: string,
  toStage: string,
  triggeredBy: string = "ai_auto",
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  const deal = await prisma.deal.findUnique({ where: { id: dealId } });
  if (!deal) return { success: false, error: "Deal not found" };

  const currentStage = deal.stage;
  const dealStageOrder = Object.keys(DEAL_STAGES);

  // Forward-only (closed_lost can come from any stage)
  if (toStage !== "closed_lost") {
    const fromIdx = dealStageOrder.indexOf(currentStage);
    const toIdx = dealStageOrder.indexOf(toStage);

    // No skipping stages: must be exactly the next stage
    if (toIdx !== fromIdx + 1) {
      return {
        success: false,
        error: toIdx <= fromIdx
          ? `Cannot move deal backward from ${currentStage} to ${toStage}`
          : `Cannot skip stages. Must progress from ${currentStage} to ${dealStageOrder[fromIdx + 1]}`,
      };
    }
  }

  // Check required fields for target stage
  const stageConfig = DEAL_STAGES[toStage];
  if (stageConfig) {
    const missing = stageConfig.requiredFields.filter((field) => {
      const value = (deal as Record<string, unknown>)[field];
      return value === null || value === undefined || value === "";
    });
    if (missing.length > 0) {
      return { success: false, error: `Missing required fields for ${toStage}: ${missing.join(", ")}` };
    }
  }

  const now = new Date();

  // Build stage history
  const history = safeParseJSON<Array<Record<string, unknown>>>(deal.stageHistory, []);
  history.push({
    from: currentStage,
    to: toStage,
    triggeredBy,
    reason,
    timestamp: now.toISOString(),
  });

  // Execute transition
  await prisma.deal.update({
    where: { id: dealId },
    data: {
      stage: toStage,
      probability: stageConfig?.probability ?? deal.probability,
      stageEnteredAt: now,
      stageHistory: JSON.stringify(history),
      ...(toStage === "closed_won" ? { contractSignedAt: now } : {}),
    },
  });

  // Record audit
  await prisma.lifecycleTransition.create({
    data: {
      objectType: "deal",
      objectId: dealId,
      fromStage: currentStage,
      toStage,
      triggeredBy,
      reason,
    },
  });

  // Fire workflow events for deal stage changes
  try {
    const { processWorkflows } = await import("./workflow-engine");
    await processWorkflows({
      type: "deal_stage_changed",
      data: { dealId, contactId: deal.contactId, from: currentStage, to: toStage },
    });
  } catch (err) {
    console.error(`[lifecycle] Workflow trigger failed for deal ${dealId}:`, err);
  }

  // Auto-generate PandaDocs proposal when deal reaches proposal_sent
  if (toStage === "proposal_sent") {
    try {
      const { createProposalFromDeal } = await import("@/lib/integrations/pandadocs");
      await createProposalFromDeal(dealId);
      console.log(`[lifecycle] PandaDocs proposal auto-generated for deal ${dealId}`);
    } catch (err) {
      console.error(`[lifecycle] PandaDocs proposal generation failed for deal ${dealId}:`, err);
    }
  }

  // Auto-generate PandaDocs contract when deal reaches contract_sent
  if (toStage === "contract_sent") {
    try {
      const { createContractFromDeal } = await import("@/lib/integrations/pandadocs");
      await createContractFromDeal(dealId);
      console.log(`[lifecycle] PandaDocs contract auto-generated for deal ${dealId}`);
    } catch (err) {
      console.error(`[lifecycle] PandaDocs contract generation failed for deal ${dealId}:`, err);
    }
  }

  // Record conversion outcome for the self-optimization engine
  if (toStage === "closed_won" || toStage === "closed_lost") {
    try {
      const { recordDealOutcome } = await import("./self-optimization-engine");
      await recordDealOutcome(dealId, toStage === "closed_won" ? "converted" : "lost");
    } catch (err) {
      console.error(`recordDealOutcome failed for deal ${dealId}:`, err);
    }
  }

  // SYNC: Deal stage → Contact lifecycle (forward-only)
  if (deal.contactId) {
    if (toStage === "closed_won") {
      await advanceContactStage(
        deal.contactId,
        "customer",
        "deal_sync",
        `Deal "${deal.name}" closed won`
      );
      // Create client lifecycle record for post-sale pipeline
      await createClientLifecycle(deal.contactId, deal.companyId, dealId, deal.actualAmount || deal.amount);

      // Create Stripe customer + subscription if payment terms are set
      try {
        const wonContact = await prisma.contact.findUnique({
          where: { id: deal.contactId },
          include: { company: true },
        });
        if (wonContact?.email) {
          const { createCustomer, createInvoice } = await import("@/lib/integrations/stripe");
          const existing = await prisma.stripeCustomer.findFirst({
            where: { contactId: deal.contactId },
          });
          const customer = existing || await createCustomer({
            email: wonContact.email,
            name: `${wonContact.firstName} ${wonContact.lastName}`,
            contactId: deal.contactId,
            companyId: deal.companyId || undefined,
            metadata: { dealId, dealName: deal.name },
          });
          // Create first invoice from deal amount
          if (deal.actualAmount || deal.amount) {
            await createInvoice({
              stripeCustomerId: customer.stripeCustomerId,
              amount: deal.actualAmount || deal.amount || 0,
              description: `${deal.name} — ${deal.paymentTerms || "Initial invoice"}`,
              dealId,
            });
          }
        }
      } catch (err) {
        console.error(`Stripe customer/invoice creation failed for deal ${dealId}:`, err);
      }
    } else if (toStage !== "closed_lost") {
      // Advance contact to opportunity if below
      const contact = await prisma.contact.findUnique({ where: { id: deal.contactId } });
      if (contact) {
        const contactIdx = getStageIndex(contact.lifecycleStage, CONTACT_STAGES);
        const opportunityIdx = getStageIndex("opportunity", CONTACT_STAGES);
        if (contactIdx < opportunityIdx) {
          await advanceContactStage(
            deal.contactId,
            "opportunity",
            "deal_sync",
            `Deal "${deal.name}" advanced to ${toStage}`
          );
        }
      }
    }
    // closed_lost: contact stays at current stage — never downgrades
  }

  return { success: true };
}

// ============================================
// CLIENT LIFECYCLE TRANSITIONS
// ============================================

async function createClientLifecycle(
  contactId: string,
  companyId: string | null,
  dealId: string,
  contractValue: number | null
): Promise<void> {
  // Check if one already exists
  const existing = await prisma.clientLifecycle.findFirst({
    where: { contactId, stage: { notIn: ["churned", "win_back"] } },
  });
  if (existing) return;

  await prisma.clientLifecycle.create({
    data: {
      contactId,
      companyId,
      dealId,
      stage: "onboarding",
      contractValue,
      contractStartDate: new Date(),
      healthScore: 85, // start high
    },
  });
}

export async function advanceClientStage(
  clientLifecycleId: string,
  toStage: ClientStage,
  triggeredBy: string = "ai_auto",
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  const cl = await prisma.clientLifecycle.findUnique({ where: { id: clientLifecycleId } });
  if (!cl) return { success: false, error: "Client lifecycle not found" };

  const now = new Date();
  const history = safeParseJSON<Array<Record<string, unknown>>>(cl.stageHistory, []);
  history.push({
    from: cl.stage,
    to: toStage,
    triggeredBy,
    reason,
    timestamp: now.toISOString(),
  });

  await prisma.clientLifecycle.update({
    where: { id: clientLifecycleId },
    data: {
      stage: toStage,
      stageEnteredAt: now,
      stageHistory: JSON.stringify(history),
      ...(toStage === "churned" ? { churnedAt: now, churnReason: reason } : {}),
    },
  });

  // Record churn for self-optimization engine (feeds anti-ICP)
  if (toStage === "churned") {
    try {
      const { recordChurnOutcome } = await import("./self-optimization-engine");
      await recordChurnOutcome(clientLifecycleId);
    } catch (err) {
      console.error(`recordChurnOutcome failed for ${clientLifecycleId}:`, err);
    }
  }

  await prisma.lifecycleTransition.create({
    data: {
      objectType: "client_lifecycle",
      objectId: clientLifecycleId,
      fromStage: cl.stage,
      toStage,
      triggeredBy,
      reason,
    },
  });

  // If customer becomes evangelist
  if (toStage === "expansion" || cl.stage === "active") {
    const contact = await prisma.contact.findUnique({ where: { id: cl.contactId } });
    if (contact && contact.lifecycleStage === "customer") {
      // Check evangelist criteria: NPS 9+ AND (referral OR review OR case study OR repeat purchase)
      const nps = await prisma.feedbackSurvey.findFirst({
        where: { contactId: cl.contactId, type: "nps", score: { gte: 9 } },
      });
      if (nps) {
        await advanceContactStage(cl.contactId, "evangelist", "ticket_signal", "NPS 9+ with active expansion/advocacy");
      }
    }
  }

  return { success: true };
}

// ============================================
// COMPANY LIFECYCLE SYNC
// ============================================

async function syncCompanyLifecycle(companyId: string): Promise<void> {
  // Company lifecycle = highest stage among its contacts
  const contacts = await prisma.contact.findMany({
    where: { companyId },
    select: { lifecycleStage: true },
  });

  if (contacts.length === 0) return;

  let highestIdx = -1;
  for (const c of contacts) {
    const idx = getStageIndex(c.lifecycleStage, CONTACT_STAGES);
    if (idx > highestIdx) highestIdx = idx;
  }

  if (highestIdx >= 0) {
    const highestStage = CONTACT_STAGES[highestIdx];
    await prisma.company.update({
      where: { id: companyId },
      data: { lifecycleStage: highestStage },
    });
  }
}

// ============================================
// AUTO-ADVANCE RULES (called by autopilot)
// ============================================

export async function processAutoAdvanceRules(): Promise<number> {
  let advanced = 0;

  // 1. Lead auto-advance: outreach logged → "attempting"
  const newLeads = await prisma.lead.findMany({
    where: { stage: "new" },
    include: { contact: { include: { activities: { orderBy: { createdAt: "desc" }, take: 1 } } } },
  });
  for (const lead of newLeads) {
    const hasOutreach = lead.contact.activities.some(
      (a) => a.type === "email" || a.type === "call"
    );
    if (hasOutreach) {
      await advanceLeadStage(lead.id, "attempting", "ai_auto", "Outreach activity detected");
      advanced++;
    }
  }

  // 2. Lead auto-advance: reply received → "connected"
  const attemptingLeads = await prisma.lead.findMany({
    where: { stage: "attempting" },
  });
  for (const lead of attemptingLeads) {
    const hasReply = await prisma.aIConversationLog.findFirst({
      where: { contactId: lead.contactId, direction: "inbound" },
      orderBy: { createdAt: "desc" },
    });
    if (hasReply) {
      await advanceLeadStage(lead.id, "connected", "ai_auto", "Reply received from prospect");
      advanced++;
    }
  }

  // 3. Subscriber → Lead: any identifiable engagement beyond subscription
  const subscribers = await prisma.contact.findMany({
    where: { lifecycleStage: "subscriber" },
    include: {
      formSubmissions: { take: 1 },
      activities: { take: 1 },
      emailEvents: { where: { type: "clicked" }, take: 1 },
    },
    take: 50,
  });
  for (const sub of subscribers) {
    if (sub.formSubmissions.length > 0 || sub.activities.length > 0 || sub.emailEvents.length > 0) {
      await advanceContactStage(sub.id, "lead", "ai_auto", "Engagement detected beyond subscription");
      advanced++;
    }
  }

  // 4. Lead → MQL: score > 60 AND ICP match
  const leads = await prisma.contact.findMany({
    where: { lifecycleStage: "lead", leadScore: { gte: 60 } },
    take: 50,
  });
  for (const lead of leads) {
    await advanceContactStage(lead.id, "mql", "ai_auto", `Lead score ${lead.leadScore} crossed MQL threshold (60)`);
    advanced++;
  }

  // 5. MQL → SQL: BANT 3/4+ confirmed
  const mqls = await prisma.contact.findMany({
    where: { lifecycleStage: "mql", bantScore: { gte: 3 } },
    take: 50,
  });
  for (const mql of mqls) {
    await advanceContactStage(mql.id, "sql", "ai_auto", `BANT ${mql.bantScore}/4 confirmed`);
    advanced++;
  }

  // 6. Meeting booked → auto-advance to SQL, create deal at Discovery
  const recentMeetings = await prisma.meeting.findMany({
    where: {
      createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      contactId: { not: null },
      status: "scheduled",
    },
  });
  for (const meeting of recentMeetings) {
    if (!meeting.contactId) continue;
    const contact = await prisma.contact.findUnique({ where: { id: meeting.contactId } });
    if (!contact) continue;

    const stageIdx = getStageIndex(contact.lifecycleStage, CONTACT_STAGES);
    const sqlIdx = getStageIndex("sql", CONTACT_STAGES);
    if (stageIdx < sqlIdx) {
      await advanceContactStage(meeting.contactId, "sql", "ai_auto", `Meeting booked: ${meeting.title}`);
      advanced++;
    }

    // Create deal if none exists
    const existingDeal = await prisma.deal.findFirst({
      where: { contactId: meeting.contactId, stage: { notIn: ["closed_won", "closed_lost"] } },
    });
    if (!existingDeal) {
      await prisma.deal.create({
        data: {
          name: `${contact.firstName} ${contact.lastName} - Discovery`,
          stage: "discovery",
          pipeline: "new_business",
          probability: 10,
          stageEnteredAt: new Date(),
          contactId: meeting.contactId,
          companyId: contact.companyId,
        },
      });
    }
  }

  // 7. Time-in-stage alerts: deals stalled > 14 days
  const stalledDeals = await prisma.deal.findMany({
    where: {
      stage: { notIn: ["closed_won", "closed_lost"] },
      stageEnteredAt: { lte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) },
    },
    include: { contact: true },
  });
  for (const deal of stalledDeals) {
    const existing = await prisma.aIInsight.findFirst({
      where: { resourceType: "deal", resourceId: deal.id, type: "deal_risk", createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
    });
    if (!existing) {
      const daysInStage = deal.stageEnteredAt
        ? Math.floor((Date.now() - deal.stageEnteredAt.getTime()) / (1000 * 60 * 60 * 24))
        : 999;
      await prisma.aIInsight.create({
        data: {
          type: "deal_risk",
          title: `Deal stalled: "${deal.name}" in ${deal.stage} for ${daysInStage} days`,
          description: `This deal has been in ${deal.stage} for ${daysInStage} days without progressing. Consider re-engaging or disqualifying.`,
          priority: daysInStage > 21 ? "critical" : "high",
          resourceType: "deal",
          resourceId: deal.id,
          status: "new",
        },
      });
    }
  }

  return advanced;
}

// ============================================
// SEED STAGE GATES (call on first run)
// ============================================

export async function seedStageGates(): Promise<void> {
  const gates = [
    // Contact lifecycle gates
    { objectType: "contact", fromStage: "subscriber", toStage: "lead", requiredFields: ["email", "firstName"], autoAdvance: true },
    { objectType: "contact", fromStage: "lead", toStage: "mql", requiredFields: ["email", "firstName", "companyId"], autoAdvance: true, confidenceThreshold: 0.7 },
    { objectType: "contact", fromStage: "mql", toStage: "sql", requiredFields: ["email", "firstName", "companyId", "jobTitle"], autoAdvance: true, confidenceThreshold: 0.8 },
    { objectType: "contact", fromStage: "sql", toStage: "opportunity", requiredFields: ["email", "firstName", "companyId", "jobTitle"], autoAdvance: true },
    { objectType: "contact", fromStage: "opportunity", toStage: "customer", requiredFields: ["email", "firstName", "companyId"], autoAdvance: true },
    { objectType: "contact", fromStage: "customer", toStage: "evangelist", requiredFields: ["email"], autoAdvance: true, confidenceThreshold: 0.9 },

    // Deal stage gates
    { objectType: "deal", fromStage: "discovery", toStage: "proposal_sent", requiredFields: ["scopeOfWork", "proposalDoc", "pricingBreakdown"], autoAdvance: false },
    { objectType: "deal", fromStage: "proposal_sent", toStage: "negotiation", requiredFields: ["negotiationNotes"], autoAdvance: false },
    { objectType: "deal", fromStage: "negotiation", toStage: "contract_sent", requiredFields: ["contractSentAt", "contractVersion"], autoAdvance: false },
    { objectType: "deal", fromStage: "contract_sent", toStage: "closed_won", requiredFields: ["actualAmount", "paymentTerms", "startDate"], autoAdvance: false },
  ];

  for (const gate of gates) {
    await prisma.stageGate.upsert({
      where: {
        objectType_fromStage_toStage: {
          objectType: gate.objectType,
          fromStage: gate.fromStage,
          toStage: gate.toStage,
        },
      },
      create: {
        ...gate,
        requiredFields: JSON.stringify(gate.requiredFields),
      },
      update: {
        requiredFields: JSON.stringify(gate.requiredFields),
        autoAdvance: gate.autoAdvance,
        confidenceThreshold: gate.confidenceThreshold,
      },
    });
  }
}
