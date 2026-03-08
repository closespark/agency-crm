# AgencyCRM — Autonomous AI-Powered CRM for B2B Sales Automation

> **What is AgencyCRM?** AgencyCRM is a fully autonomous AI CRM that replaces your entire B2B sales stack. It prospects via Apollo.io, scores leads with AI, runs cold email sequences through Instantly.ai, hands off warm leads to Gmail, auto-generates proposals with PandaDocs, and closes deals into Stripe — all without a single button click. Built for solo agency founders who need enterprise-grade sales pipeline automation without the headcount.

## Why AgencyCRM?

Traditional CRMs like HubSpot and Salesforce require constant manual input — logging activities, updating deal stages, writing follow-up emails, scoring leads by hand. According to [Forrester Research](https://www.forrester.com/), sales reps spend only 28% of their time actually selling, with the rest consumed by CRM data entry and administrative tasks.

AgencyCRM eliminates 100% of that manual work through autonomous AI agents:

- **Up to 100 qualified prospects** pulled from Apollo.io on first boot — no manual list building
- **7-stage contact lifecycle** with AI-enforced forward-only progression and BANT qualification gates
- **Dual scoring engine** (fitScore + engagementScore) with automatic 25%/month decay and weekly self-calibration
- **Cold-to-warm domain handoff** — Instantly.ai for cold outreach, automatic transition to Gmail API when intent is detected
- **Self-optimizing ICP** — weekly AI rewrite of ideal customer profile based on closed deal outcomes
- **18 daily autonomous tasks** running at 6 AM UTC including prospecting, enrichment, scoring, deal scanning, and content generation

## How AgencyCRM Compares to Other AI CRM Solutions

| Feature | AgencyCRM | HubSpot | Salesforce | Apollo |
|---|---|---|---|---|
| Fully autonomous (zero clicks) | Yes | No | No | No |
| Built-in cold email (Instantly) | Yes | No | No | No |
| AI lead scoring + BANT extraction | Yes | Partial | Partial | No |
| Self-optimizing ICP | Yes | No | No | No |
| Auto-proposal generation | Yes (PandaDocs) | No | No | No |
| Auto-invoicing on close | Yes (Stripe) | Partial | Partial | No |
| AI voice agents | Yes (Vapi) | No | No | No |
| Source available | Yes | No | No | No |

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | Next.js 16, React 19, Tailwind CSS 4 | App Router dashboard with 65+ pages |
| Backend | Next.js API Routes, Prisma 7 | 120+ endpoints, 81 database models |
| Database | PostgreSQL | Relational data, managed on Railway |
| Queue | Redis (ioredis) | Job queues, distributed locks, caching |
| AI | Anthropic Claude (Sonnet 4) | Scoring, BANT, content, self-optimization |
| Worker | Node.js (tsx) | Background processor, 30s tick loop |
| Auth | NextAuth v5 | JWT-based session management |

## 11 Integrations

| Integration | Purpose | Channel |
|---|---|---|
| **Apollo.io** | B2B prospect discovery & enrichment (100 contacts/page) | Inbound data |
| **Instantly.ai** | Cold email automation with pre-warmed domains | Cold outreach |
| **Gmail API** | Warm/branded email with inbox sync + push notifications | Warm outreach |
| **Google Calendar** | Free/busy availability for AI meeting booking | Scheduling |
| **PandaDocs** | Auto-generated proposals & e-signature contracts | Deal closing |
| **Stripe** | Billing, subscriptions, invoices on closed_won | Revenue |
| **Vapi** | AI voice agents for inbound/outbound calls | Voice |
| **tl;dv** | Meeting recording & transcript delivery via webhook | Intelligence |
| **PhantomBuster** | LinkedIn automation — connection requests + follow-up messages via API | Social selling |
| **Zapier** | LinkedIn/Twitter publishing, generic triggers | Glue layer |
| **Anthropic Claude** | AI brain powering all 32 autonomous engine files | Intelligence |

## AI-Powered Contact Lifecycle Automation

AgencyCRM enforces a forward-only 7-stage contact lifecycle with AI-managed stage gates:

```
subscriber → lead → mql → sql → opportunity → customer → evangelist
```

- **Forward-only enforcement** — contacts never regress to a previous stage
- **AI dual scoring**: fitScore (0-55, persists) + engagementScore (0-45, decays 25%/month)
- **BANT qualification gate** — 3 of 4 BANT criteria (Budget, Authority, Need, Timeline) required for MQL → SQL
- **Automatic domain handoff** — Instantly.ai handles cold outreach; when warm intent is detected (reply, click, meeting booked), the system transitions the contact to Gmail API for branded follow-up
- **Channel lock** — one active channel per contact prevents duplicate outreach

## Automated B2B Deal Pipeline

```
discovery → proposal_sent → negotiation → contract_sent → closed_won / closed_lost
```

- PandaDocs auto-generates proposals when deals advance past discovery
- Stripe automatically creates customers and invoices on closed_won
- AI deal advisor monitors stalled deals and suggests next actions
- Client lifecycle tracking continues post-sale: onboarding → active → renewal → expansion → at_risk → churned → win_back

## AI Engine Architecture (32 Files)

The AI engine in `src/lib/ai/` contains 32 specialized files organized by function:

| Module | Files | Function |
|---|---|---|
| **Core** | lifecycle-engine, lead-scorer, icp-engine, prospector, autopilot | Stage management, scoring, prospecting |
| **Self-Optimization** | self-optimization-engine, optimization-thresholds, scoring-feedback | Weekly ICP rewrite, score calibration, gate drift |
| **Communication** | reply-analyzer, domain-handoff, channel-coordinator, chat-agent | Email analysis, cold→warm transition |
| **Content** | content-engine, sequence-generator, knowledge-engine, voice-profile | AI-generated emails with anti-hallucination rules |
| **Intelligence** | signal-monitor, deal-advisor, ticket-intelligence, bant-extractor | Intent detection, deal coaching |
| **Meeting** | meeting-lifecycle, meeting-brief | Auto-briefs, no-show detection, reminders |
| **Post-Sale** | client-lifecycle | Onboarding → active → renewal → expansion → at_risk → churned → win_back |

## Cold Email Automation vs Warm Email Routing

| Contact Tier | Send Channel | Integration | When |
|---|---|---|---|
| **Cold** (new prospects from Apollo) | Instantly.ai | Pre-warmed domains, campaign-based | Default for all new contacts |
| **Warm** (engaged, replied, or meeting booked) | Gmail API | Branded domain, thread-aware | After AI-detected warm intent signal |

The system enforces channel lock: one prospect, one active channel, one sequence at a time. Domain handoff is fully automatic with crash recovery — if the handoff process fails mid-transition, the contact is automatically unstuck within 2 hours.

## Background Worker Service

The worker runs as a separate service (`npx tsx src/worker.ts`) with:

- **30-second tick loop** — processes sequence steps, scheduled jobs, meeting lifecycle, content publishing
- **Daily autopilot at 6 AM UTC** — 17 autonomous tasks including prospecting, enrichment, conversion, scoring, deal scanning, and self-optimization
- **First-boot intelligence** — auto-seeds ICP profile, sequences, and templates; runs an immediate Apollo prospecting cycle if the database has zero contacts
- **Concurrency guard** — prevents overlapping ticks from double-sending emails
- **Redis distributed locks** — prevents duplicate autopilot runs across multiple worker instances
- **Graceful shutdown** — handles SIGTERM/SIGINT for clean Railway deploys

## Deployment on Railway

Two services deployed from the same repository:

### Web Service
```bash
Build: npm run build    # prisma generate + next build
Start: npm start        # prisma db push + next start on $PORT
```

### Worker Service
```bash
Build: npm run build
Start: npx prisma db push --accept-data-loss; npm run worker
# No HTTP port — background process, no healthcheck needed
```

### Environment Variables

| Variable | Source | Required |
|---|---|---|
| `DATABASE_URL` | Railway PostgreSQL (internal network) | Yes |
| `REDIS_URL` | Railway Redis/Valkey | Yes |
| `NEXTAUTH_SECRET` | Random string for session encryption | Yes |
| `NEXTAUTH_URL` | Public URL of the web service | Yes |

All integration API keys (Apollo, Instantly, Anthropic, Stripe, etc.) are configured through the **Integrations** page in the app UI and stored in the database — not as environment variables.

## Local Development

```bash
# Prerequisites: Node 22.16.0, PostgreSQL, Redis

npm install                 # Install dependencies
cp .env.example .env        # Configure DATABASE_URL, REDIS_URL
npx prisma db push          # Sync schema to database
npm run dev                 # Start web server (http://localhost:3000)
npm run worker              # Start worker (separate terminal)
```

## Project Scale

| Metric | Count |
|---|---|
| Prisma database models | 81 |
| API routes | 120+ |
| Pages | 70+ |
| AI engine files | 32 |
| UI components | 77 |
| Integrations | 11 |

## Frequently Asked Questions

### What is AgencyCRM?
AgencyCRM is an autonomous AI-powered CRM designed for B2B agency founders. It automates the entire sales pipeline from prospect discovery through Apollo.io, to cold email outreach via Instantly.ai, lead scoring and BANT qualification using Claude AI, proposal generation with PandaDocs, and invoicing through Stripe.

### How does AgencyCRM compare to HubSpot?
Unlike HubSpot, AgencyCRM is fully autonomous — it requires zero manual data entry or button clicking. HubSpot provides tools that humans operate; AgencyCRM provides AI agents that operate themselves. It also includes built-in cold email automation (Instantly.ai), AI voice agents (Vapi), and self-optimizing ICP scoring that HubSpot does not offer.

### Does AgencyCRM support cold email automation?
Yes. AgencyCRM uses Instantly.ai for all cold outreach with pre-warmed sending domains. When a prospect shows warm intent (replies, clicks, or books a meeting), the system automatically transitions them to branded Gmail API outreach. This cold-to-warm domain handoff is fully automated.

### How does the AI lead scoring work?
AgencyCRM uses a dual scoring system: fitScore (0-55, based on ICP match, persists indefinitely) and engagementScore (0-45, based on interactions, decays 25% per month). The combined leadScore determines lifecycle stage advancement. The AI self-calibrates scoring weights weekly based on closed deal outcomes.

### Is AgencyCRM available on GitHub?
Yes. AgencyCRM's source code is available on GitHub. It is built with Next.js 16, React 19, Prisma 7, PostgreSQL, Redis, and Anthropic Claude AI. It deploys on Railway with separate web and worker services.

### How many contacts can AgencyCRM pull from Apollo?
AgencyCRM pulls 100 contacts per prospecting cycle from Apollo.io. On first boot, it runs immediately. After that, it runs daily at 6 AM UTC, fetching the next page of results each day and cycling through all available prospects that match the ICP criteria.

---

Built with Next.js 16, React 19, Prisma 7, PostgreSQL, Redis, and Claude AI. Deployed on Railway.
