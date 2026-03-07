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
// WORKFLOW DEFINITIONS (static, no AI needed)
// ============================================

const DEFAULT_WORKFLOWS = [
  {
    name: "Welcome New Contacts",
    description: "Automatically send a welcome email when a new contact is created from a form submission",
    trigger: JSON.stringify({ type: "contact_created", conditions: {} }),
    actions: JSON.stringify([
      { type: "send_email", config: { aiGenerate: true, purpose: "Welcome the new contact, introduce Nexus Ops, and invite them to book a discovery call", tone: "warm and professional" } },
      { type: "create_task", config: { title: "Follow up with new contact", dueInDays: 2, priority: "high" } },
    ]),
    isActive: true,
  },
  {
    name: "Lead Score Alert — Hot Lead",
    description: "Notify the team and advance lifecycle when a lead score crosses 80",
    trigger: JSON.stringify({ type: "lead_score_threshold", conditions: { above: 80 } }),
    actions: JSON.stringify([
      { type: "create_task", config: { title: "Hot lead — reach out immediately", dueInDays: 0, priority: "urgent" } },
      { type: "update_lifecycle_stage", config: { stage: "mql" } },
      { type: "send_notification", config: { message: "Hot lead detected — score above 80. Review and reach out ASAP." } },
    ]),
    isActive: true,
  },
  {
    name: "Deal Won — Onboarding Kickoff",
    description: "When a deal moves to Closed Won, send an onboarding email and create setup tasks",
    trigger: JSON.stringify({ type: "deal_stage_changed", conditions: { to: "closed_won" } }),
    actions: JSON.stringify([
      { type: "send_email", config: { aiGenerate: true, purpose: "Congratulate the client on closing, outline the onboarding process, and share first steps", tone: "excited and professional" } },
      { type: "create_task", config: { title: "Schedule onboarding kickoff call", dueInDays: 1, priority: "high" } },
      { type: "create_task", config: { title: "Prepare onboarding docs and credentials", dueInDays: 2, priority: "medium" } },
    ]),
    isActive: true,
  },
  {
    name: "Re-engage Stale Leads",
    description: "When a contact has no activity for 14 days, send a re-engagement email",
    trigger: JSON.stringify({ type: "no_activity", conditions: { days: 14 } }),
    actions: JSON.stringify([
      { type: "send_email", config: { aiGenerate: true, purpose: "Gentle check-in with a stale lead. Offer new value or a reason to reconnect. Give an easy out.", tone: "casual and helpful" } },
    ]),
    isActive: true,
  },
  {
    name: "Meeting Booked — Prep Task",
    description: "Create a preparation task when a meeting is booked",
    trigger: JSON.stringify({ type: "meeting_booked", conditions: {} }),
    actions: JSON.stringify([
      { type: "create_task", config: { title: "Prepare meeting brief and research prospect", dueInDays: 0, priority: "high" } },
    ]),
    isActive: true,
  },
  {
    name: "Email Reply — Advance Stage",
    description: "When a prospect replies to an email, advance to MQL, analyze the reply, and create a follow-up task",
    trigger: JSON.stringify({ type: "email_replied", conditions: {} }),
    actions: JSON.stringify([
      { type: "ai_analyze", config: { type: "reply" } },
      { type: "update_lifecycle_stage", config: { stage: "mql" } },
      { type: "create_task", config: { title: "Respond to prospect reply", dueInDays: 0, priority: "high" } },
    ]),
    isActive: true,
  },
  {
    name: "Form Submitted — Qualify Lead",
    description: "When a website form is submitted, score the contact and create a follow-up task",
    trigger: JSON.stringify({ type: "form_submitted", conditions: {} }),
    actions: JSON.stringify([
      { type: "score_contact", config: {} },
      { type: "create_task", config: { title: "Review and qualify new form submission", dueInDays: 1, priority: "medium" } },
    ]),
    isActive: true,
  },
  {
    name: "Deal Lost — Feedback & Nurture",
    description: "When a deal is lost, send a graceful email and add to nurture sequence",
    trigger: JSON.stringify({ type: "deal_stage_changed", conditions: { to: "lost" } }),
    actions: JSON.stringify([
      { type: "send_email", config: { aiGenerate: true, purpose: "Thank the prospect for their time, ask for brief feedback on why they didn't move forward, and leave the door open for future conversations", tone: "gracious and professional" } },
      { type: "create_task", config: { title: "Add to long-term nurture list", dueInDays: 3, priority: "low" } },
    ]),
    isActive: false,
  },
  {
    name: "Sequence Completed — Advance & Notify",
    description: "When a prospect finishes a sequence, advance their stage and create a review task",
    trigger: JSON.stringify({ type: "sequence_completed", conditions: {} }),
    actions: JSON.stringify([
      { type: "score_contact", config: {} },
      { type: "update_lifecycle_stage", config: { stage: "sql" } },
      { type: "create_task", config: { title: "Sequence completed — review prospect and decide next steps", dueInDays: 1, priority: "high" } },
      { type: "send_notification", config: { message: "A prospect has completed their outreach sequence. Review for next steps." } },
    ]),
    isActive: true,
  },
  {
    name: "MQL → SQL — Create Discovery Deal",
    description: "When a contact advances to SQL, auto-create a deal at the discovery stage",
    trigger: JSON.stringify({ type: "contact_stage_changed", conditions: { to: "sql" } }),
    actions: JSON.stringify([
      { type: "create_deal", config: { stage: "discovery", pipeline: "default" } },
      { type: "create_task", config: { title: "Schedule discovery call with new SQL", dueInDays: 1, priority: "high" } },
    ]),
    isActive: true,
  },
  {
    name: "New Lead — Score & Enrich",
    description: "When a contact moves from subscriber to lead, run AI scoring and analysis",
    trigger: JSON.stringify({ type: "contact_stage_changed", conditions: { to: "lead" } }),
    actions: JSON.stringify([
      { type: "score_contact", config: {} },
      { type: "ai_analyze", config: { type: "contact" } },
    ]),
    isActive: true,
  },
  {
    name: "Deal Moved to Proposal — Prep Docs",
    description: "When a deal advances to proposal stage, create preparation tasks",
    trigger: JSON.stringify({ type: "deal_stage_changed", conditions: { to: "proposal" } }),
    actions: JSON.stringify([
      { type: "create_task", config: { title: "Draft proposal document", dueInDays: 2, priority: "high" } },
      { type: "create_task", config: { title: "Prepare pricing and scope breakdown", dueInDays: 2, priority: "high" } },
      { type: "send_notification", config: { message: "Deal moved to proposal stage — time to prepare docs." } },
    ]),
    isActive: true,
  },

  // ── Outreach & Prospecting workflows ──────────────────────────────────

  {
    name: "Auto-Enroll High-Fit Prospects in Sequence",
    description: "When a new lead enters the system, score them and auto-enroll in the cold outreach sequence",
    trigger: JSON.stringify({ type: "contact_stage_changed", conditions: { to: "lead" } }),
    actions: JSON.stringify([
      { type: "score_contact", config: {} },
      { type: "wait", config: { delayMinutes: 5 } },
    ]),
    isActive: false, // Enable after configuring target sequence ID
  },
  {
    name: "Stale Prospect — Archive Warning",
    description: "After 30 days of no activity, flag unconverted prospects for cleanup",
    trigger: JSON.stringify({ type: "no_activity", conditions: { days: 30 } }),
    actions: JSON.stringify([
      { type: "update_lead_status", config: { status: "unresponsive" } },
      { type: "create_task", config: { title: "Prospect inactive 30+ days — archive or re-engage?", dueInDays: 0, priority: "medium" } },
      { type: "send_notification", config: { message: "Stale prospect flagged for review after 30 days of inactivity." } },
    ]),
    isActive: true,
  },
  {
    name: "Meeting Booked — Confirmation & Prep Materials",
    description: "Send a confirmation email with prep materials when a meeting is booked",
    trigger: JSON.stringify({ type: "meeting_booked", conditions: {} }),
    actions: JSON.stringify([
      { type: "send_email", config: { aiGenerate: true, purpose: "Confirm the meeting, share a brief agenda, and ask what their top priorities are so we can prepare", tone: "friendly and professional" } },
      { type: "ai_analyze", config: { type: "contact" } },
      { type: "create_task", config: { title: "Prepare meeting brief and research prospect", dueInDays: 0, priority: "high" } },
    ]),
    isActive: true,
  },

  // ── Operations & Client Management workflows ──────────────────────────

  {
    name: "Client Activation — Request Referral",
    description: "When a contact becomes a customer, send a thank-you and referral request after a brief delay",
    trigger: JSON.stringify({ type: "contact_stage_changed", conditions: { to: "customer" } }),
    actions: JSON.stringify([
      { type: "wait", config: { delayDays: 14 } },
      { type: "send_email", config: { aiGenerate: true, purpose: "Thank the client for their partnership, ask if they know anyone who could benefit from similar services, and offer to make introductions easy", tone: "warm and appreciative" } },
      { type: "create_task", config: { title: "Follow up on referral request", dueInDays: 21, priority: "medium" } },
    ]),
    isActive: true,
  },
  {
    name: "Deal Moved to Negotiation — Close Prep",
    description: "When a deal enters negotiation, create contract prep tasks and alert the team",
    trigger: JSON.stringify({ type: "deal_stage_changed", conditions: { to: "negotiation" } }),
    actions: JSON.stringify([
      { type: "create_task", config: { title: "Prepare contract and pricing terms", dueInDays: 1, priority: "high" } },
      { type: "create_task", config: { title: "Review deal for any outstanding objections", dueInDays: 0, priority: "high" } },
      { type: "send_notification", config: { message: "Deal entered negotiation stage — prepare to close." } },
    ]),
    isActive: true,
  },

  // ── Marketing & Content workflows ─────────────────────────────────────

  {
    name: "Newsletter Engagement — Warm Escalation",
    description: "When a contact's score crosses 50, escalate from newsletter to active outreach",
    trigger: JSON.stringify({ type: "lead_score_threshold", conditions: { above: 50 } }),
    actions: JSON.stringify([
      { type: "update_lifecycle_stage", config: { stage: "mql" } },
      { type: "create_task", config: { title: "Engaged newsletter subscriber — review for outreach", dueInDays: 1, priority: "medium" } },
      { type: "send_notification", config: { message: "Newsletter subscriber crossed score 50 — ready for warm outreach." } },
    ]),
    isActive: true,
  },
  {
    name: "Form Submission — Smart Nurture Path",
    description: "When a form is submitted, score, segment, and route to appropriate follow-up",
    trigger: JSON.stringify({ type: "form_submitted", conditions: {} }),
    actions: JSON.stringify([
      { type: "score_contact", config: {} },
      { type: "update_lifecycle_stage", config: { stage: "lead" } },
      { type: "send_email", config: { aiGenerate: true, purpose: "Thank them for their interest, confirm we received their submission, and set expectations for next steps", tone: "warm and professional" } },
      { type: "create_task", config: { title: "Review new form submission and qualify", dueInDays: 1, priority: "high" } },
    ]),
    isActive: true,
  },
  {
    name: "MQL — Send Industry-Specific Content",
    description: "When a contact reaches MQL, send personalized content based on their profile",
    trigger: JSON.stringify({ type: "contact_stage_changed", conditions: { to: "mql" } }),
    actions: JSON.stringify([
      { type: "ai_analyze", config: { type: "contact" } },
      { type: "send_email", config: { aiGenerate: true, purpose: "Share a relevant case study or insight based on their industry and pain points. Build trust before the sales conversation.", tone: "helpful and knowledgeable" } },
    ]),
    isActive: true,
  },
  {
    name: "Deal Lost — Knowledge Feedback Loop",
    description: "When a deal is lost, analyze the loss reason and feed insights back to improve future outreach",
    trigger: JSON.stringify({ type: "deal_stage_changed", conditions: { to: "lost" } }),
    actions: JSON.stringify([
      { type: "ai_analyze", config: { type: "deal" } },
      { type: "create_task", config: { title: "Document loss reason and update ICP/objection playbook", dueInDays: 3, priority: "medium" } },
    ]),
    isActive: true,
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

async function seedWorkflows(): Promise<number> {
  const existingCount = await prisma.workflow.count();
  if (existingCount > 0) {
    console.log(`[auto-seed] ${existingCount} workflows already exist, skipping`);
    return 0;
  }

  console.log(`[auto-seed] Creating ${DEFAULT_WORKFLOWS.length} default workflows...`);
  let created = 0;

  for (const wf of DEFAULT_WORKFLOWS) {
    try {
      await prisma.workflow.create({ data: wf });
      created++;
      console.log(`[auto-seed] Created workflow: ${wf.name}`);
    } catch (err) {
      console.error(`[auto-seed] Failed to create workflow "${wf.name}":`, err);
    }
  }

  return created;
}

// ============================================
// MAIN ENTRY POINT — called by worker on startup
// ============================================

export async function autoSeedIfEmpty(): Promise<void> {
  // Seed workflows first (no API key needed)
  try {
    await seedWorkflows();
  } catch (err) {
    console.error("[auto-seed] Workflow seed failed:", err);
  }

  // Check if we've already run AI auto-seed
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
