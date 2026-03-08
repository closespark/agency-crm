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
 * Ensure a fully configured, active Instantly campaign exists for the CRM to send through.
 *
 * Architecture: Instantly is the sending infrastructure. The CRM's processSequenceQueue()
 * generates AI-personalized copy per contact per step, then adds the contact as a lead
 * with custom_variables { subject, body }. The Instantly campaign has a single passthrough
 * email template that renders {{subject}} and {{body}} — Instantly handles deliverability,
 * account rotation, and sending schedule.
 *
 * On creation, this function:
 * 1. Fetches all connected sending accounts from Instantly
 * 2. Creates a campaign with those accounts assigned
 * 3. Adds a passthrough email template that uses {{subject}} and {{body}} merge fields
 * 4. Sets a business-hours sending schedule
 * 5. Activates the campaign
 *
 * Returns the existing active campaign if one already exists.
 */
export async function ensureInstantlyCampaign(campaignName?: string): Promise<{
  campaignId: string;
  instantlyId: string;
  created: boolean;
}> {
  if (!process.env.INSTANTLY_API_KEY) {
    throw new Error("Instantly integration not configured. Set INSTANTLY_API_KEY.");
  }

  // Check if an active campaign already exists locally
  const existing = await prisma.instantlyCampaign.findFirst({
    where: { status: "active", instantlyId: { not: null } },
    orderBy: { createdAt: "desc" },
  });

  if (existing?.instantlyId) {
    return { campaignId: existing.id, instantlyId: existing.instantlyId, created: false };
  }

  // Step 1: Fetch connected sending accounts from Instantly
  const accountsResult = await instantly.accounts.list();
  const accounts = accountsResult.items;

  if (accounts.length === 0) {
    throw new Error(
      "No sending accounts found in Instantly. " +
      "Connect and warm at least one email account in your Instantly dashboard before the CRM can send."
    );
  }

  const sendingEmails = accounts.map((a) => a.email);

  // Log the actual accounts discovered — sender names, emails, warmup status
  for (const acct of accounts) {
    const senderName = [acct.first_name, acct.last_name].filter(Boolean).join(" ") || "(no name)";
    console.log(`[sync] Instantly account: ${senderName} <${acct.email}> (warmup: ${acct.warmup_status}, daily limit: ${acct.daily_limit})`);
  }

  // Step 2: Create campaign with full configuration
  const name = campaignName || `[CRM] Cold Outreach — ${new Date().toISOString().split("T")[0]}`;

  const apiResult = await instantly.campaigns.create({
    name,

    // Assign all connected sending accounts — Instantly rotates between them
    // Each account uses the sender name + signature configured in Instantly's dashboard
    email_list: sendingEmails,

    // Single passthrough template — the CRM passes AI-generated subject/body per lead
    // via custom_variables. Instantly renders these merge fields and sends.
    sequences: [{
      steps: [{
        type: "email",
        delay: 0,
        variants: [{
          subject: "{{subject}}",
          body: "{{body}}",
        }],
      }],
    }],

    // Business hours schedule (M-F, 9am-5pm, US Eastern)
    campaign_schedule: {
      schedules: [{
        name: "Business Hours",
        timezone: "America/New_York",
        timing: { from: "09:00", to: "17:00" },
        days: {
          "0": false, // Sunday
          "1": true,
          "2": true,
          "3": true,
          "4": true,
          "5": true,
          "6": false, // Saturday
        },
      }],
    },

    // Send settings
    stop_on_reply: true,
    stop_on_auto_reply: true,
    open_tracking: true,
    link_tracking: true,
    daily_limit: 40, // Conservative limit per account
  });

  // Step 3: Activate the campaign
  try {
    await instantly.campaigns.activate(apiResult.id);
  } catch (err) {
    console.warn(`[sync] Failed to activate Instantly campaign ${apiResult.id}:`, err);
  }

  // Step 4: Create local record
  const campaign = await prisma.instantlyCampaign.create({
    data: {
      instantlyId: apiResult.id,
      name,
      status: "active",
      sequences: JSON.stringify([{ template: "passthrough", fields: ["subject", "body"] }]),
      syncedAt: new Date(),
    },
  });

  console.log(`[sync] Created Instantly campaign: ${name} (${apiResult.id}) with ${sendingEmails.length} sending accounts`);
  return { campaignId: campaign.id, instantlyId: apiResult.id, created: true };
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
