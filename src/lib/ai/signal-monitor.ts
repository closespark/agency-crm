// Signal Monitor — continuous signal layer for Apollo data
// Watches for job changes, hiring spikes, funding rounds, promotions
// When a signal fires, Claude acts automatically without asking

import { prisma } from "@/lib/prisma";
import { apollo } from "@/lib/integrations/apollo";
import { runAIJob } from "./job-runner";
import { safeParseJSON } from "@/lib/safe-json";

interface SignalResult {
  signalType: string;
  description: string;
  actionRecommendation: string;
  outreachAngle?: string;
  urgency: "immediate" | "this_week" | "this_month";
}

// Check Apollo for changes on watched contacts/companies
export async function checkSignals(): Promise<number> {
  const watches = await prisma.signalWatch.findMany({
    where: { status: "watching" },
    take: 50,
  });

  let triggered = 0;

  for (const watch of watches) {
    try {
      const config = safeParseJSON<{
        email?: string;
        domain?: string;
        lastKnownTitle?: string;
        lastKnownSize?: number;
        lastKnownRevenue?: number;
        reengageDays?: number;
      }>(watch.triggerConfig, {});
      let signalData: Record<string, unknown> | null = null;

      switch (watch.type) {
        case "job_change":
        case "promotion": {
          if (config.email) {
            try {
              const result = await apollo.enrichPerson(config.email);
              const person = result.person;
              if (person && person.title !== config.lastKnownTitle) {
                signalData = {
                  previousTitle: config.lastKnownTitle,
                  newTitle: person.title,
                  company: person.organization?.name,
                };
              }
            } catch { /* API not configured or person not found */ }
          }
          break;
        }

        case "hiring_spike": {
          if (config.domain) {
            try {
              const result = await apollo.enrichCompany(config.domain);
              const company = result.organization;
              if (company && config.lastKnownSize && company.estimated_num_employees > config.lastKnownSize * 1.15) {
                signalData = {
                  previousSize: config.lastKnownSize,
                  currentSize: company.estimated_num_employees,
                  growthPercent: Math.round(((company.estimated_num_employees - config.lastKnownSize) / config.lastKnownSize) * 100),
                };
              }
            } catch { /* skip */ }
          }
          break;
        }

        case "funding_round": {
          if (config.domain) {
            try {
              const result = await apollo.enrichCompany(config.domain);
              const company = result.organization;
              if (company && company.annual_revenue && config.lastKnownRevenue && company.annual_revenue > config.lastKnownRevenue * 1.3) {
                signalData = {
                  previousRevenue: config.lastKnownRevenue,
                  currentRevenue: company.annual_revenue,
                };
              }
            } catch { /* skip */ }
          }
          break;
        }

        case "engagement_window": {
          // Re-engagement windows: check if enough time has passed since last contact
          const daysSinceTriggerConfig = config.reengageDays || 90;
          if (watch.lastCheckedAt) {
            const daysSinceCheck = Math.floor(
              (Date.now() - watch.lastCheckedAt.getTime()) / (1000 * 60 * 60 * 24)
            );
            if (daysSinceCheck >= daysSinceTriggerConfig) {
              signalData = { daysElapsed: daysSinceCheck, reason: "Time-based re-engagement window opened" };
            }
          }
          break;
        }
      }

      // Update last checked
      await prisma.signalWatch.update({
        where: { id: watch.id },
        data: { lastCheckedAt: new Date() },
      });

      if (signalData) {
        // Signal fired! Get AI to determine action
        const aiResult = await runAIJob("prospector", "signal_analysis", {
          signalType: watch.type,
          signalData,
          contactId: watch.contactId,
          companyId: watch.companyId,
          instructions: "A signal just fired for this contact/company. Determine the best action: re-engage with a specific angle, update their score, or queue outreach. Be specific about the outreach angle — reference the signal directly.",
        });

        const signal = aiResult.output as SignalResult;

        // Mark as triggered
        await prisma.signalWatch.update({
          where: { id: watch.id },
          data: {
            status: "triggered",
            triggeredAt: new Date(),
            triggerData: JSON.stringify(signalData),
          },
        });

        // Create insight with reasoning
        await prisma.aIInsight.create({
          data: {
            type: "signal_detected",
            title: `Signal: ${watch.type.replace(/_/g, " ")} detected`,
            description: signal.description,
            reasoning: `${watch.type} signal fired. Data: ${JSON.stringify(signalData)}. AI recommends: ${signal.actionRecommendation}`,
            priority: signal.urgency === "immediate" ? "critical" : signal.urgency === "this_week" ? "high" : "medium",
            resourceType: watch.contactId ? "contact" : "company",
            resourceId: watch.contactId || watch.companyId || "",
            actionItems: JSON.stringify([
              { action: signal.actionRecommendation, priority: signal.urgency },
              signal.outreachAngle ? { action: `Outreach angle: ${signal.outreachAngle}`, priority: signal.urgency } : null,
            ].filter(Boolean)),
            status: "new",
          },
        });

        // Auto-execute the action if configured
        if (watch.autoAction) {
          const autoAction = safeParseJSON<{ type: string; config: Record<string, unknown> }>(watch.autoAction, { type: "none", config: {} });
          await executeSignalAction(autoAction, watch.contactId, watch.companyId, signal);
        }

        triggered++;
      }
    } catch (err) {
      console.error("Signal watch processing failed:", err);
    }
  }

  return triggered;
}

async function executeSignalAction(
  autoAction: { type: string; config: Record<string, unknown> },
  contactId: string | null,
  _companyId: string | null,
  signal: SignalResult
) {
  if (!contactId) return;

  switch (autoAction.type) {
    case "re_engage":
      // Bump lead score and create a re-engagement task
      await prisma.contact.update({
        where: { id: contactId },
        data: {
          engagementScore: { increment: 20 },
          leadScore: { increment: 20 },
          leadStatus: "new",
          scoreDirty: true,
        },
      });
      break;

    case "enroll_sequence":
      if (autoAction.config.sequenceId) {
        await prisma.sequenceEnrollment.create({
          data: {
            sequenceId: autoAction.config.sequenceId as string,
            contactId,
            status: "active",
            nextActionAt: new Date(),
            metadata: JSON.stringify({ triggeredBy: signal.signalType, outreachAngle: signal.outreachAngle }),
          },
        });
      }
      break;

    case "update_score":
      await prisma.contact.update({
        where: { id: contactId },
        data: {
          engagementScore: { increment: autoAction.config.delta as number || 15 },
          leadScore: { increment: autoAction.config.delta as number || 15 },
          scoreDirty: true,
        },
      });
      break;
  }
}

// Create signal watches for a contact (called when someone enters "interested but not now" state)
export async function watchContact(contactId: string): Promise<void> {
  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    include: { company: true },
  });
  if (!contact) return;

  const watches = [
    {
      type: "job_change",
      triggerConfig: JSON.stringify({ email: contact.email, lastKnownTitle: contact.jobTitle }),
      autoAction: JSON.stringify({ type: "re_engage", config: {} }),
    },
    {
      type: "engagement_window",
      triggerConfig: JSON.stringify({ reengageDays: 90 }),
      autoAction: JSON.stringify({ type: "re_engage", config: {} }),
    },
  ];

  if (contact.company?.domain) {
    watches.push({
      type: "hiring_spike",
      triggerConfig: JSON.stringify({ domain: contact.company.domain, lastKnownSize: parseInt(contact.company.size || "0") || null }),
      autoAction: JSON.stringify({ type: "update_score", config: { delta: 20 } }),
    });
    watches.push({
      type: "funding_round",
      triggerConfig: JSON.stringify({ domain: contact.company.domain, lastKnownRevenue: contact.company.revenue }),
      autoAction: JSON.stringify({ type: "re_engage", config: {} }),
    });
  }

  for (const w of watches) {
    await prisma.signalWatch.create({
      data: { contactId, ...w },
    });
  }
}
