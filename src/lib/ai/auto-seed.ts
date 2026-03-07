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
// KNOWLEDGE BASE ARTICLES (no API key needed)
// ============================================

const DEFAULT_KNOWLEDGE_ARTICLES = [
  {
    title: "Getting Started with Nexus Ops",
    slug: "getting-started",
    category: "getting-started",
    status: "published",
    body: `# Getting Started with Nexus Ops

Welcome to your RevOps command center. Here's how to get the most out of the platform from day one.

## 1. Connect Your Integrations
Head to **Settings → Integrations** and connect:
- **Google Workspace** — for email sending and calendar sync
- **Apollo.io** — for prospecting and contact enrichment
- **Anthropic AI** — powers lead scoring, email generation, and insights

## 2. Review Your ICP (Ideal Customer Profile)
Go to **AI Hub → ICP Profile** to review and customize who you're targeting. The system uses this to score every prospect automatically.

## 3. Check Your Sequences
Visit **Sequences** to see your pre-built outreach sequences. These are AI-generated and ready to use. You can edit steps, timing, and messaging.

## 4. Import or Prospect Contacts
Use **Prospecting** to find contacts matching your ICP via Apollo.io, or import contacts manually through the **Contacts** page.

## 5. Monitor the Dashboard
Your **Dashboard** shows pipeline health, active sequences, and AI-generated insights. Check it daily for actionable recommendations.

## Autonomous Features
The platform runs a background worker that handles:
- Daily lead scoring and enrichment
- Sequence step execution on schedule
- Prospecting cycles (find → score → enroll)
- Content generation and publishing
- Weekly self-optimization audits

Most features work automatically once integrations are connected.`,
  },
  {
    title: "Understanding Lead Scoring",
    slug: "lead-scoring",
    category: "technical",
    status: "published",
    body: `# Understanding Lead Scoring

Nexus Ops uses AI-powered lead scoring to prioritize your pipeline automatically.

## How Scores Work
Every contact receives a score from 0-100 based on:
- **ICP Fit** (up to 60 points) — how well they match your Ideal Customer Profile
- **Engagement signals** (up to 25 points) — email opens, replies, meeting bookings
- **Behavioral indicators** (up to 15 points) — website visits, form submissions, content downloads

## Score Thresholds
| Score Range | Classification | What Happens |
|-------------|---------------|--------------|
| 80-100 | Hot Lead | Priority notification, fast-track to SQL |
| 60-79 | Warm Lead | Auto-enrolled in nurture sequence |
| 40-59 | Cool Lead | Standard outreach continues |
| 0-39 | Low Priority | Deprioritized, periodic re-check |

## Automatic Actions
When a contact crosses a threshold, workflows trigger automatically:
- Score above 80 → Creates a task for immediate follow-up
- Score above 60 → Advances lifecycle stage to MQL
- Score drops below 30 → Pauses active sequences

## Score Decay
Scores decay over time if there's no engagement. This keeps your pipeline fresh and prevents stale leads from clogging the funnel.

## Self-Optimization
After 10+ closed deals, the scoring model self-optimizes by analyzing what traits your actual customers share. This happens automatically during the weekly audit cycle.`,
  },
  {
    title: "Email Sequences Guide",
    slug: "sequences-guide",
    category: "getting-started",
    status: "published",
    body: `# Email Sequences Guide

Sequences automate your outreach by sending a series of emails on a schedule.

## How Sequences Work
1. A contact is **enrolled** in a sequence (manually or by a workflow)
2. The system sends each step's email at the configured delay
3. If the contact **replies**, the sequence pauses automatically
4. If they don't engage, the sequence completes after the final step

## Sequence Statuses
- **Active** — currently sending steps
- **Paused** — temporarily stopped (manual or auto-pause on reply)
- **Completed** — all steps sent
- **Replied** — contact responded, sequence stopped
- **Bounced** — email delivery failed
- **Unsubscribed** — contact opted out

## AI-Generated Sequences
The platform comes with pre-built sequences for common scenarios:
- Cold outreach to ICP-matching prospects
- Inbound lead nurturing
- Re-engagement for stale contacts
- Post-meeting follow-up

You can also generate new sequences using AI by clicking **Generate with AI** on the Sequences page.

## Best Practices
- Keep sequences to 3-5 steps
- Space emails 2-3 business days apart
- Vary the angle in each step (don't repeat the same pitch)
- Always include a clear call-to-action
- Let the AI personalize based on contact data`,
  },
  {
    title: "Workflow Automation",
    slug: "workflow-automation",
    category: "technical",
    status: "published",
    body: `# Workflow Automation

Workflows are event-driven automations that execute actions when specific triggers fire.

## Trigger Types
| Trigger | Fires When |
|---------|-----------|
| contact_created | A new contact is added |
| contact_stage_changed | Lifecycle stage advances |
| deal_stage_changed | Deal moves to a new stage |
| email_replied | Contact replies to an email |
| lead_score_threshold | Score crosses a threshold |
| form_submitted | Website form is submitted |
| meeting_booked | Calendar meeting is scheduled |
| no_activity | Contact has been inactive for X days |
| sequence_completed | Outreach sequence finishes |

## Action Types
| Action | What It Does |
|--------|-------------|
| send_email | Sends an email (template or AI-generated) |
| enroll_in_sequence | Adds contact to a sequence |
| update_lifecycle_stage | Advances the contact's stage |
| update_lead_status | Changes lead status |
| create_task | Creates a follow-up task |
| create_deal | Opens a new deal |
| score_contact | Triggers AI lead scoring |
| send_notification | Sends an in-app notification |
| add_to_list | Adds contact to a list |
| ai_analyze | Runs AI analysis |
| webhook | Calls an external URL |
| wait | Delays before the next action |

## Pre-Built Workflows
The platform ships with 20+ workflows covering the full lifecycle:
- Welcome sequences for new contacts
- Lead score alerts for hot prospects
- Deal stage notifications
- Re-engagement for stale leads
- Auto-enrollment in sequences based on ICP fit

All workflows can be customized or disabled from the **Workflows** page.`,
  },
  {
    title: "Integrations Setup",
    slug: "integrations-setup",
    category: "integrations",
    status: "published",
    body: `# Integrations Setup

Nexus Ops connects to external services to power prospecting, email, and AI features.

## Apollo.io (Prospecting & Enrichment)
**What it does:** Finds prospects matching your ICP, enriches contact data with job titles, company info, and social profiles.

**Setup:**
1. Go to Settings → Integrations
2. Click Apollo.io → Add API Key
3. Get your API key from app.apollo.io → Settings → API Keys

**Features unlocked:**
- Autonomous prospecting cycles
- Contact enrichment (job title, company size, industry)
- Company enrichment (revenue, tech stack, funding)

## Google Workspace (Email & Calendar)
**What it does:** Sends emails through your Gmail account, syncs calendar for meeting detection.

**Setup:**
1. Go to Settings → Integrations
2. Click Google → Connect Account
3. Authorize Gmail and Calendar access

**Features unlocked:**
- Send sequence emails from your domain
- Meeting booking detection
- Email reply tracking

## Anthropic AI (Intelligence)
**What it does:** Powers lead scoring, email composition, reply analysis, content generation, and self-optimization.

**Setup:**
1. Go to Settings → Integrations
2. Click Anthropic → Add API Key
3. Get your key from console.anthropic.com

**Features unlocked:**
- AI lead scoring
- Smart email generation
- Reply sentiment analysis
- Daily insights
- Content calendar generation
- Weekly self-optimization audits

## Integration Health
The system checks integration availability before executing actions. If an integration is missing, the action is skipped gracefully with a warning log — nothing breaks.`,
  },
  {
    title: "Understanding the AI Hub",
    slug: "ai-hub",
    category: "technical",
    status: "published",
    body: `# Understanding the AI Hub

The AI Hub is your window into the platform's autonomous intelligence layer.

## Daily Insights
Every day at 6 AM UTC, the system generates actionable insights about your pipeline:
- Which leads are heating up
- Deals at risk of stalling
- Sequence performance trends
- Recommended next actions

## ICP Profile
Your Ideal Customer Profile defines who the system targets during prospecting. It includes:
- Industry and company size filters
- Job title patterns
- Geographic preferences
- Technology stack signals
- Pain point indicators

The ICP self-optimizes after you close 10+ deals, learning from your actual customer patterns.

## Knowledge Engine
The intelligence layer continuously gathers external data:
- **Tier 1:** Your own pipeline data (highest confidence)
- **Tier 2:** Industry-specific sources (G2 reviews, HubSpot community, Reddit r/revops)
- **Tier 3:** General sales methodology and thought leadership

Insights are extracted, validated against your internal data, and fed into content generation.

## Self-Optimization
Every Sunday, the system runs a comprehensive audit:
1. Analyzes what's working and what isn't
2. Adjusts ICP scoring weights
3. Optimizes email send times
4. Updates content strategy
5. Refreshes knowledge sources
6. Generates next week's content calendar

All changes are logged in the System Changelog for full transparency.`,
  },
  {
    title: "Troubleshooting Common Issues",
    slug: "troubleshooting",
    category: "troubleshooting",
    status: "published",
    body: `# Troubleshooting Common Issues

## Emails Not Sending
1. Check that Google Workspace is connected (Settings → Integrations)
2. Verify the contact has a valid email address
3. Check the worker service is running (Settings → System)
4. Review sequence enrollment status — paused enrollments won't send

## Lead Scores Not Updating
1. Ensure Anthropic API key is set (Settings → Integrations)
2. Scores update during daily autopilot (6 AM UTC) or when triggered by workflows
3. New contacts are scored automatically on creation if the API key is available

## Prospecting Not Finding Contacts
1. Verify Apollo.io API key is configured
2. Check your ICP profile has valid criteria (AI Hub → ICP)
3. The prospecting cycle runs daily — check the System Changelog for results

## Sequences Stuck
1. Check enrollment status on the Sequences → Enrollments page
2. "Paused" enrollments need manual resume or workflow trigger
3. "Bounced" means the email address is invalid
4. Verify the worker service is running and processing the queue

## Knowledge Base Empty
The Knowledge Base auto-populates with starter articles on first boot. If articles aren't showing:
1. Check that the worker service has started successfully
2. The knowledge engine seeds sources automatically
3. External intelligence is fetched daily and processed into insights

## Workflows Not Firing
1. Verify the workflow is set to Active
2. Check that the trigger conditions match your event
3. Some actions require integrations (email needs Google, AI needs Anthropic)
4. Review worker logs for skipped actions due to missing integrations`,
  },
  {
    title: "Frequently Asked Questions",
    slug: "faq",
    category: "faq",
    status: "published",
    body: `# Frequently Asked Questions

## How does autonomous mode work?
Once integrations are connected, the platform runs independently:
- The background worker processes sequences, scores leads, and runs prospecting every 30 seconds
- Daily autopilot generates insights and runs prospecting cycles at 6 AM UTC
- Weekly self-optimization audits run every Sunday
- Workflows trigger automatically based on events

You only need to intervene for high-value actions like closing deals and reviewing AI-generated content.

## Can I use this without AI?
Yes. Core CRM features (contacts, deals, tasks, sequences) work without an Anthropic API key. AI-powered features (scoring, email generation, insights, content) will be skipped gracefully.

## How many emails can I send?
Email sending goes through your connected Google Workspace account. Gmail limits:
- 500 emails/day for regular accounts
- 2,000 emails/day for Google Workspace accounts

For high-volume cold outreach, use a dedicated sending tool like Instantly.ai with a separate domain.

## Is my data secure?
- All data is stored in your own PostgreSQL database
- API keys are encrypted in the database, never exposed to the frontend
- Authentication uses NextAuth with session-based security
- The platform runs on your own Railway infrastructure

## How do I add team members?
Currently the platform supports single-user operation. Multi-user support with role-based access is on the roadmap.

## What happens if the worker stops?
Sequences pause, daily autopilot skips, and prospecting stops. Once restarted, the worker resumes from where it left off. No data is lost — the system is designed for graceful recovery.`,
  },
];

async function seedKnowledgeArticles(): Promise<number> {
  const existingCount = await prisma.knowledgeArticle.count();
  if (existingCount > 0) {
    console.log(`[auto-seed] ${existingCount} knowledge articles already exist, skipping`);
    return 0;
  }

  console.log(`[auto-seed] Creating ${DEFAULT_KNOWLEDGE_ARTICLES.length} knowledge articles...`);
  let created = 0;

  for (const article of DEFAULT_KNOWLEDGE_ARTICLES) {
    try {
      await prisma.knowledgeArticle.create({ data: article });
      created++;
      console.log(`[auto-seed] Created article: ${article.title}`);
    } catch (err) {
      console.error(`[auto-seed] Failed to create article "${article.title}":`, err);
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

  // Seed knowledge base articles (no API key needed)
  try {
    await seedKnowledgeArticles();
  } catch (err) {
    console.error("[auto-seed] Knowledge article seed failed:", err);
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
