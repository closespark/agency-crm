// Prospector — Apollo-powered prospect discovery with ICP scoring.
// Queries Apollo with hardcoded ICP filters, scores every result,
// and only admits prospects above the 60-point threshold.

import { prisma } from "@/lib/prisma";
import {
  getActiveICP,
  buildApolloParams,
  scoreProspect,
} from "./icp-engine";
import {
  apollo,
  apolloToProspect,
  type ApolloSearchParams,
} from "@/lib/integrations/apollo";

/**
 * Run a named prospect search using Apollo with ICP filters.
 * Accepts optional overrides for pagination or additional Apollo params.
 */
export async function createProspectSearch(
  name: string,
  overrides?: Partial<ApolloSearchParams>
): Promise<string> {
  const icp = await getActiveICP();
  const baseParams = buildApolloParams(icp);
  const searchParams: ApolloSearchParams = {
    ...baseParams,
    ...overrides,
  };

  const search = await prisma.prospectSearch.create({
    data: {
      name,
      icp: JSON.stringify(icp),
      status: "searching",
    },
  });

  try {
    const result = await apollo.peopleSearch(searchParams);

    // Group by company for multi-DM detection
    const companyPeople = new Map<string, typeof result.people>();
    for (const person of result.people) {
      const domain = person.organization?.website_url || "unknown";
      const existing = companyPeople.get(domain) || [];
      existing.push(person);
      companyPeople.set(domain, existing);
    }

    let accepted = 0;
    let rejected = 0;

    for (const person of result.people) {
      const domain = person.organization?.website_url || "unknown";
      const coworkers = companyPeople.get(domain) || [];

      const scoreResult = scoreProspect(person, icp, {
        multipleDecisionMakers: coworkers.length > 1,
      });

      if (scoreResult.passes) {
        // Deduplicate against existing contacts and prospects
        if (person.email) {
          const existingContact = await prisma.contact.findUnique({
            where: { email: person.email },
          });
          if (existingContact) continue;

          const existingProspect = await prisma.prospect.findFirst({
            where: { email: person.email },
          });
          if (existingProspect) continue;
        }

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
        // Log rejected prospect for ICP analysis
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

    console.log(
      `[prospector] Search "${name}": ${result.people.length} found, ${accepted} accepted, ${rejected} rejected`
    );
  } catch (error) {
    await prisma.prospectSearch.update({
      where: { id: search.id },
      data: { status: "draft" },
    });
    throw error;
  }

  return search.id;
}

/**
 * Convert a prospect to a CRM contact and set them up for outreach.
 */
export async function convertProspectToContact(prospectId: string): Promise<string> {
  const prospect = await prisma.prospect.findUnique({
    where: { id: prospectId },
  });

  if (!prospect) throw new Error("Prospect not found");

  // Check if contact already exists
  if (prospect.email) {
    const existing = await prisma.contact.findUnique({
      where: { email: prospect.email },
    });
    if (existing) {
      await prisma.prospect.update({
        where: { id: prospectId },
        data: { status: "converted", contactId: existing.id },
      });
      return existing.id;
    }
  }

  // Find or create company
  let companyId: string | undefined;
  if (prospect.companyName) {
    let company = prospect.companyDomain
      ? await prisma.company.findUnique({ where: { domain: prospect.companyDomain } })
      : null;

    if (!company) {
      company = await prisma.company.create({
        data: {
          name: prospect.companyName,
          domain: prospect.companyDomain,
          industry: prospect.industry,
          size: prospect.companySize,
        },
      });
    }
    companyId = company.id;
  }

  const contact = await prisma.contact.create({
    data: {
      firstName: prospect.firstName || "Unknown",
      lastName: prospect.lastName || "",
      email: prospect.email,
      phone: prospect.phone,
      jobTitle: prospect.jobTitle,
      linkedinUrl: prospect.linkedinUrl,
      companyId,
      source: "apollo",
      lifecycleStage: "lead",
      leadStatus: "new",
      fitScore: prospect.fitScore || 0,
      leadScore: prospect.fitScore || 0,
      scoreDirty: true,
      customFields: prospect.aiAnalysis,
    },
  });

  await prisma.prospect.update({
    where: { id: prospectId },
    data: { status: "converted", contactId: contact.id },
  });

  // Auto-enroll in first active sequence so outreach starts immediately
  try {
    const existingSequence = await prisma.sequence.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: "asc" },
    });

    let activeSequence: NonNullable<typeof existingSequence>;

    // If no active sequences exist, auto-generate a default cold outreach sequence
    if (!existingSequence) {
      const { generateSequence, saveGeneratedSequence } = await import("./sequence-generator");
      const generated = await generateSequence({
        targetDescription: "Cold prospects sourced from Apollo matching our ICP",
        agencyServices: "AI-powered automation, workflow optimization, and digital transformation",
        channels: ["email", "linkedin"],
        stepCount: 5,
        tone: "professional yet conversational",
      });
      const sequenceId = await saveGeneratedSequence(generated);
      activeSequence = await prisma.sequence.findUniqueOrThrow({
        where: { id: sequenceId },
      });
      console.log(`[prospector] No active sequences found — auto-created default: "${generated.name}" (${sequenceId})`);
    } else {
      activeSequence = existingSequence;
    }

    const { safeParseJSON } = await import("@/lib/safe-json");
    const steps = safeParseJSON(activeSequence.steps, [] as Array<{ delayDays: number }>);
    // Use near-future time (2 minutes) so the sequence starts on the next worker tick
    const firstStepDelay = steps[0]?.delayDays || 0;
    const nextActionAt = firstStepDelay === 0
      ? new Date(Date.now() + 2 * 60 * 1000) // 2 minutes from now for immediate steps
      : new Date(Date.now() + firstStepDelay * 24 * 60 * 60 * 1000);

    const { enrollContactInSequence } = await import("./sequence-enrollment");
    const enrollmentId = await enrollContactInSequence({
      sequenceId: activeSequence.id,
      contactId: contact.id,
      channel: "email",
      nextActionAt,
      metadata: { source: "prospect_conversion", prospectId },
    });

    if (enrollmentId) {
      console.log(`[prospector] Auto-enrolled contact ${contact.id} in sequence "${activeSequence.name}"`);
    }

    // NOTE: Cold contacts are NOT pushed to Instantly here. The CRM's processSequenceQueue()
    // adds leads one at a time with AI-generated subject/body at send time. Pushing here
    // without content would create empty leads that Instantly can't send.
  } catch (err) {
    console.error(`[prospector] Auto-enroll in sequence failed for ${contact.id}:`, err);
  }

  // Create a Lead for pipeline tracking
  try {
    await prisma.lead.create({
      data: {
        contactId: contact.id,
        companyId: contact.companyId || undefined,
        stage: "new",
        source: "apollo",
        channel: "email",
      },
    });
  } catch (err) {
    console.error(`[prospector] Lead creation failed for ${contact.id}:`, err);
  }

  // Fire workflow events so automations trigger (welcome email, scoring, etc.)
  try {
    const { processWorkflows } = await import("./workflow-engine");
    await processWorkflows({
      type: "contact_created",
      data: { contactId: contact.id },
    });
    await processWorkflows({
      type: "contact_stage_changed",
      data: { contactId: contact.id, from: "subscriber", to: "lead" },
    });
  } catch (err) {
    console.error(`[prospector] Workflow trigger failed for ${contact.id}:`, err);
  }

  return contact.id;
}
