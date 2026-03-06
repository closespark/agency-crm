import { prisma } from "@/lib/prisma";
import { instantly } from "@/lib/integrations/instantly";
import { meetAlfred } from "@/lib/integrations/meet-alfred";

/**
 * Pull fresh metrics from Instantly for a single campaign and update the local record.
 */
export async function syncInstantlyMetrics(campaignId: string) {
  const campaign = await prisma.instantlyCampaign.findUnique({
    where: { id: campaignId },
  });

  if (!campaign) {
    throw new Error(`InstantlyCampaign not found: ${campaignId}`);
  }

  if (!campaign.instantlyId) {
    throw new Error(
      `Campaign ${campaignId} has no Instantly ID - cannot sync metrics`
    );
  }

  if (!process.env.INSTANTLY_API_KEY) {
    throw new Error(
      "Instantly integration not configured. Set INSTANTLY_API_KEY."
    );
  }

  const metrics = await instantly.campaigns.analytics(campaign.instantlyId);

  await prisma.instantlyCampaign.update({
    where: { id: campaignId },
    data: {
      metrics: JSON.stringify(metrics),
      syncedAt: new Date(),
    },
  });

  return metrics;
}

/**
 * Sync all Instantly campaigns: pull the campaign list from Instantly API,
 * create/update local records, and refresh metrics for active campaigns.
 */
export async function syncInstantlyCampaigns() {
  if (!process.env.INSTANTLY_API_KEY) {
    throw new Error(
      "Instantly integration not configured. Set INSTANTLY_API_KEY."
    );
  }

  const apiResult = await instantly.campaigns.list();
  const synced: string[] = [];

  for (const raw of apiResult.items) {
    const campaign = raw as { id: string; name: string; status?: string };

    const existing = await prisma.instantlyCampaign.findFirst({
      where: { instantlyId: campaign.id },
    });

    let localId: string;

    if (existing) {
      await prisma.instantlyCampaign.update({
        where: { id: existing.id },
        data: {
          name: campaign.name,
          status: campaign.status || existing.status,
          syncedAt: new Date(),
        },
      });
      localId = existing.id;
    } else {
      const created = await prisma.instantlyCampaign.create({
        data: {
          instantlyId: campaign.id,
          name: campaign.name,
          status: campaign.status || "draft",
          sequences: "[]",
          syncedAt: new Date(),
        },
      });
      localId = created.id;
    }

    // Sync metrics for active campaigns
    if (campaign.status === "active") {
      try {
        await syncInstantlyMetrics(localId);
      } catch (err) {
        console.error(
          `Failed to sync metrics for campaign ${localId}:`,
          err
        );
      }
    }

    synced.push(localId);
  }

  return { syncedCount: synced.length, campaignIds: synced };
}

/**
 * Create an Instantly campaign from a CRM Sequence, then add all enrolled contacts as leads.
 */
export async function pushSequenceToInstantly(sequenceId: string) {
  if (!process.env.INSTANTLY_API_KEY) {
    throw new Error(
      "Instantly integration not configured. Set INSTANTLY_API_KEY."
    );
  }

  const sequence = await prisma.sequence.findUnique({
    where: { id: sequenceId },
    include: {
      enrollments: {
        where: { status: "active", channel: { in: ["email", "multi"] } },
        include: { contact: true },
      },
    },
  });

  if (!sequence) {
    throw new Error(`Sequence not found: ${sequenceId}`);
  }

  // Parse sequence steps
  let steps: { subject?: string; body?: string; delay_days?: number }[] = [];
  try {
    steps = JSON.parse(sequence.steps);
  } catch {
    throw new Error("Failed to parse sequence steps");
  }

  // Filter to email steps only
  const emailSteps = steps.filter(
    (s: Record<string, unknown>) =>
      !s.type || s.type === "email"
  );

  if (emailSteps.length === 0) {
    throw new Error("Sequence has no email steps to push to Instantly");
  }

  // Create campaign in Instantly
  const apiResult = await instantly.campaigns.create({
    name: `[CRM] ${sequence.name}`,
  });

  // Create local record
  const campaign = await prisma.instantlyCampaign.create({
    data: {
      instantlyId: apiResult.id,
      name: `[CRM] ${sequence.name}`,
      status: "draft",
      sequences: JSON.stringify(emailSteps),
      syncedAt: new Date(),
    },
  });

  // Add enrolled contacts as leads
  const leads = sequence.enrollments
    .filter((e) => e.contact.email)
    .map((e) => ({
      email: e.contact.email!,
      first_name: e.contact.firstName,
      last_name: e.contact.lastName,
      custom_variables: {
        crm_contact_id: e.contact.id,
        crm_enrollment_id: e.id,
      },
    }));

  if (leads.length > 0) {
    await instantly.leads.add(apiResult.id, leads);

    // Update local campaign with lead summary
    await prisma.instantlyCampaign.update({
      where: { id: campaign.id },
      data: {
        leads: JSON.stringify({
          count: leads.length,
          addedAt: new Date().toISOString(),
        }),
      },
    });

    // Update enrollments with campaign reference
    for (const enrollment of sequence.enrollments) {
      await prisma.sequenceEnrollment.update({
        where: { id: enrollment.id },
        data: {
          metadata: JSON.stringify({
            ...(enrollment.metadata ? JSON.parse(enrollment.metadata) : {}),
            instantlyCampaignId: campaign.id,
            instantlyApiId: apiResult.id,
            pushedAt: new Date().toISOString(),
          }),
        },
      });
    }
  }

  return {
    campaign,
    leadsAdded: leads.length,
    instantlyId: apiResult.id,
  };
}

/**
 * Add leads from a CRM Sequence to an existing Meet Alfred campaign.
 *
 * IMPORTANT: Meet Alfred does NOT support campaign creation via API.
 * Campaigns must be created manually in the Alfred web UI. This function
 * only adds leads to an existing Alfred campaign specified by `alfredCampaignId`.
 */
export async function pushSequenceToAlfred(
  sequenceId: string,
  alfredCampaignId: string
) {
  if (!process.env.MEET_ALFRED_API_KEY) {
    throw new Error(
      "Meet Alfred integration not configured. Set MEET_ALFRED_API_KEY."
    );
  }

  const sequence = await prisma.sequence.findUnique({
    where: { id: sequenceId },
    include: {
      enrollments: {
        where: { status: "active", channel: { in: ["linkedin", "multi"] } },
        include: { contact: true },
      },
    },
  });

  if (!sequence) {
    throw new Error(`Sequence not found: ${sequenceId}`);
  }

  // Verify the Alfred campaign exists
  const alfredCampaign = await meetAlfred.campaigns.get(alfredCampaignId);
  if (!alfredCampaign) {
    throw new Error(
      `Meet Alfred campaign ${alfredCampaignId} not found. ` +
        "Create the campaign in Alfred's web UI first, then provide its ID."
    );
  }

  // Collect leads with LinkedIn URLs from contacts' customFields
  const leads: {
    linkedin_url: string;
    first_name?: string;
    last_name?: string;
    company?: string;
    title?: string;
  }[] = [];

  for (const enrollment of sequence.enrollments) {
    const contact = enrollment.contact;
    let linkedinUrl: string | null = null;

    // Try to get LinkedIn URL from customFields
    if (contact.customFields) {
      try {
        const custom = JSON.parse(contact.customFields);
        linkedinUrl = custom.linkedinUrl || custom.linkedin_url || null;
      } catch {
        // ignore parse errors
      }
    }

    if (linkedinUrl) {
      leads.push({
        linkedin_url: linkedinUrl,
        first_name: contact.firstName,
        last_name: contact.lastName,
        title: contact.jobTitle || undefined,
      });
    }
  }

  if (leads.length > 0) {
    await meetAlfred.leads.add(alfredCampaignId, leads);
  }

  // Update enrollments with Alfred campaign reference
  for (const enrollment of sequence.enrollments) {
    await prisma.sequenceEnrollment.update({
      where: { id: enrollment.id },
      data: {
        metadata: JSON.stringify({
          ...(enrollment.metadata ? JSON.parse(enrollment.metadata) : {}),
          alfredCampaignId,
          pushedAt: new Date().toISOString(),
        }),
      },
    });
  }

  return {
    alfredCampaignId,
    leadsAdded: leads.length,
    leadsSkipped: sequence.enrollments.length - leads.length,
  };
}
