// Auto-Seed — AI generates initial email templates and sequences on first boot.
// Runs once: checks if templates/sequences exist, generates them if empty.
// Called by the background worker on startup.

import { prisma } from "@/lib/prisma";
import { runAIJob } from "./job-runner";
import { saveGeneratedSequence, generateSequence } from "./sequence-generator";

const AGENCY_CONTEXT = {
  name: "Nexus Ops",
  services: "RevOps consulting, HubSpot implementation, AI agent deployment, ERP/ATS integrations, outbound infrastructure, AEO strategy",
  icp: "B2B companies with 10-200 employees, Series A-C funded startups, revenue teams using HubSpot or evaluating CRM tools",
  tone: "Professional yet conversational. Confident but not pushy. Data-driven.",
  website: "nexusop.lovable.app",
};

// ============================================
// EMAIL TEMPLATE DEFINITIONS (AI fills the body)
// ============================================

const TEMPLATE_SPECS = [
  {
    name: "Inbound Lead Welcome",
    category: "inbound",
    purpose: "First email after someone fills a form on our website. Thank them, set expectations, invite them to book a call.",
    subject: "Thanks for reaching out — here's what happens next",
  },
  {
    name: "Consultation Booking Confirmation",
    category: "booking",
    purpose: "Sent after someone books a consultation. Confirm the request, explain what to expect on the call, ask them to prepare key questions.",
    subject: "Your consultation is confirmed — here's how to prepare",
  },
  {
    name: "Post-Discovery Follow-Up",
    category: "nurture",
    purpose: "Follow-up email after a discovery call. Recap what we discussed, outline next steps, attach relevant case study.",
    subject: "Recap from our call + next steps",
  },
  {
    name: "Proposal Sent",
    category: "deal",
    purpose: "Email sent alongside a proposal. Summarize the scope, highlight key value points, set a deadline for review.",
    subject: "Your proposal is ready — {{companyName}} x Nexus Ops",
  },
  {
    name: "Contract Sent",
    category: "deal",
    purpose: "Email sent alongside the contract. Brief and action-oriented. Link to sign, note timeline.",
    subject: "Contract ready for signature — let's get started",
  },
  {
    name: "Closed Won Welcome",
    category: "onboarding",
    purpose: "Welcome email after deal closes. Set expectations for onboarding, introduce the team, share first steps.",
    subject: "Welcome to Nexus Ops — here's your onboarding plan",
  },
  {
    name: "Cold Outreach — Problem Awareness",
    category: "outbound",
    purpose: "Cold email targeting pain points. Lead with a specific problem the ICP faces, hint at how we solve it, soft CTA.",
    subject: "Quick question about {{companyName}}'s revenue ops",
  },
  {
    name: "Cold Outreach — Social Proof",
    category: "outbound",
    purpose: "Second touch with a case study angle. Reference a similar company we helped, share a specific result, invite to learn more.",
    subject: "How we helped a company like {{companyName}} fix their pipeline",
  },
  {
    name: "Re-Engagement — Gone Cold",
    category: "nurture",
    purpose: "Email for leads who went silent after initial interest. Gentle check-in, offer new value, give an easy out.",
    subject: "Still thinking about it?",
  },
  {
    name: "Meeting No-Show Follow-Up",
    category: "nurture",
    purpose: "Sent when someone misses a scheduled meeting. No guilt, just easy reschedule. Brief.",
    subject: "Missed you today — want to reschedule?",
  },
];

// ============================================
// SEQUENCE DEFINITIONS
// ============================================

const SEQUENCE_SPECS = [
  {
    targetDescription: "Cold prospects from Apollo — VP/Director-level at B2B SaaS companies with 20-200 employees using HubSpot",
    industry: "B2B SaaS",
    painPoints: ["Pipeline leakage", "Low rep productivity", "Poor CRM adoption", "Manual data entry"],
    channels: ["email", "linkedin"] as ("email" | "linkedin")[],
    stepCount: 7,
  },
  {
    targetDescription: "Inbound leads who filled a form but haven't booked a meeting — nurture to booking",
    industry: "Various",
    painPoints: ["Not sure what they need", "Evaluating options", "Need social proof"],
    channels: ["email"] as ("email")[],
    stepCount: 5,
  },
  {
    targetDescription: "Post-discovery prospects who had a call but went silent — re-engage and advance to proposal",
    industry: "Various",
    painPoints: ["Internal decision delays", "Budget concerns", "Competing priorities"],
    channels: ["email", "linkedin"] as ("email" | "linkedin")[],
    stepCount: 5,
  },
];

// ============================================
// SEED FUNCTIONS
// ============================================

async function seedTemplates(): Promise<number> {
  const existingCount = await prisma.emailTemplate.count();
  if (existingCount > 0) {
    console.log(`[auto-seed] ${existingCount} templates already exist, skipping`);
    return 0;
  }

  console.log(`[auto-seed] Generating ${TEMPLATE_SPECS.length} email templates...`);
  let created = 0;

  for (const spec of TEMPLATE_SPECS) {
    try {
      const result = await runAIJob("email_composer", "generate_template", {
        task: "Generate an email template body in HTML",
        templateName: spec.name,
        category: spec.category,
        purpose: spec.purpose,
        subject: spec.subject,
        agencyName: AGENCY_CONTEXT.name,
        agencyServices: AGENCY_CONTEXT.services,
        tone: AGENCY_CONTEXT.tone,
        instructions: `Write the email body as clean HTML (no <html>/<head>/<body> tags, just the content).
Use these merge fields where appropriate: {{firstName}}, {{lastName}}, {{companyName}}, {{jobTitle}}, {{meetingDate}}, {{meetingTime}}.
Keep it concise (under 200 words). Make it feel human-written, not corporate.
The email should serve this purpose: ${spec.purpose}`,
      });

      const body = (result.output as { body?: string; html?: string })?.body
        || (result.output as { body?: string; html?: string })?.html
        || JSON.stringify(result.output);

      await prisma.emailTemplate.create({
        data: {
          name: spec.name,
          subject: spec.subject,
          body: typeof body === "string" ? body : JSON.stringify(body),
          category: spec.category,
          isActive: true,
        },
      });

      created++;
      console.log(`[auto-seed] Created template: ${spec.name}`);
    } catch (err) {
      console.error(`[auto-seed] Failed to generate template "${spec.name}":`, err);
    }
  }

  return created;
}

async function seedSequences(): Promise<number> {
  const existingCount = await prisma.sequence.count();
  if (existingCount > 0) {
    console.log(`[auto-seed] ${existingCount} sequences already exist, skipping`);
    return 0;
  }

  console.log(`[auto-seed] Generating ${SEQUENCE_SPECS.length} sequences...`);
  let created = 0;

  for (const spec of SEQUENCE_SPECS) {
    try {
      const generated = await generateSequence({
        ...spec,
        agencyServices: AGENCY_CONTEXT.services,
        tone: AGENCY_CONTEXT.tone,
      });

      await saveGeneratedSequence(generated);
      created++;
      console.log(`[auto-seed] Created sequence: ${generated.name}`);
    } catch (err) {
      console.error(`[auto-seed] Failed to generate sequence:`, err);
    }
  }

  return created;
}

// ============================================
// MAIN ENTRY POINT — called by worker on startup
// ============================================

export async function autoSeedIfEmpty(): Promise<void> {
  // Check if we've already run auto-seed
  const seedLog = await prisma.systemChangelog.findFirst({
    where: { category: "auto_seed", changeType: "completed" },
  });

  if (seedLog) {
    return; // Already seeded
  }

  // Only run if Anthropic API key is configured
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("[auto-seed] ANTHROPIC_API_KEY not set, skipping auto-seed");
    return;
  }

  console.log("[auto-seed] First boot detected — generating initial templates and sequences...");

  const templates = await seedTemplates();
  const sequences = await seedSequences();

  // Log completion so we don't re-run
  await prisma.systemChangelog.create({
    data: {
      category: "auto_seed",
      changeType: "completed",
      description: `Auto-seed complete: ${templates} templates, ${sequences} sequences generated by AI.`,
      dataEvidence: JSON.stringify({ templates, sequences, timestamp: new Date().toISOString() }),
    },
  });

  console.log(`[auto-seed] Complete: ${templates} templates, ${sequences} sequences`);
}
