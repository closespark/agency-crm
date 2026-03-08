# AgencyCRM

Fully autonomous AI-powered CRM for B2B agency founders. Zero button clicking — the system prospects, scores, sequences, and closes on its own.

## Architecture

- **Next.js 16** App Router + React 19 — web dashboard
- **Worker Service** — background processor (30s tick loop + daily autopilot at 6 AM UTC)
- **Prisma 7 + PostgreSQL** — 75 models, relational data layer
- **Redis** — job queues, distributed locks, caching
- **Claude AI (Sonnet 4)** — scoring, BANT extraction, content generation, self-optimization

## Integrations (11)

| Integration | Purpose | Channel |
|---|---|---|
| **Apollo.io** | Prospect discovery & enrichment | Inbound data |
| **Instantly.ai** | Cold email campaigns (pre-warmed domains) | Cold outreach |
| **Gmail API** | Warm/branded email send + inbox sync | Warm outreach |
| **Google Calendar** | Free/busy availability for meeting booking | Scheduling |
| **PandaDocs** | Auto-generated proposals & contract signing | Deal closing |
| **Stripe** | Billing, subscriptions, invoices on closed_won | Revenue |
| **Vapi** | AI voice agents (inbound/outbound calls) | Voice |
| **tl;dv** | Meeting recording & transcript delivery | Intelligence |
| **Meet Alfred** | LinkedIn outreach campaigns | Social |
| **Zapier** | LinkedIn/Twitter publishing, generic triggers | Glue layer |
| **Anthropic Claude** | AI brain for all autonomous decisions | Intelligence |

## Contact Lifecycle

```
subscriber → lead → mql → sql → opportunity → customer → evangelist
```

- **Forward-only** — stages never move backward
- **Dual scoring**: fitScore (persists) + engagementScore (decays 25%/month)
- **BANT gate**: 3/4 required for MQL → SQL qualification
- **Domain handoff**: Instantly (cold) → warm intent detected → Gmail (branded)

## Deal Pipeline

```
discovery → proposal_sent → negotiation → contract_sent → closed_won / closed_lost
```

- PandaDocs auto-generates proposals when deals advance
- Stripe creates customers/invoices on closed_won

## AI Engine (32 files)

- **Lifecycle Engine** — stage gates, forward-only enforcement
- **ICP Engine** — ideal customer profile, Apollo search, prospect scoring
- **Lead Scorer** — AI-powered fit + engagement scoring with bounds enforcement
- **Self-Optimization** — weekly ICP rewrite, score calibration, gate drift, sequence rewrite
- **Autopilot** — daily autonomous run (17 tasks)
- **Content Engine** — AI-generated email copy with full contact intelligence
- **Signal Monitor** — intent signal detection across channels
- **Domain Handoff** — automatic cold → warm transition with flag protection

## Email Routing

| Contact Tier | Send Channel | Integration |
|---|---|---|
| Cold (new prospects) | Instantly | Pre-warmed domains, campaign-based |
| Warm (engaged/replied) | Gmail API | Branded domain, thread-aware |

Channel lock enforces one active channel per contact. Domain handoff triggers automatically on warm intent signals.

## Worker

Separate Railway service running `npx tsx src/worker.ts`:

- **Tick loop** (30s) — sequence steps, scheduled jobs, meeting lifecycle, content publishing
- **Daily autopilot** (6 AM UTC) — insights, prospecting, enrichment, conversion, scoring, deal scanning, self-optimization
- **First-boot** — auto-seeds ICP, sequences, templates; runs immediate prospecting cycle if zero contacts exist
- **Concurrency guard** — prevents overlapping ticks
- **Distributed locks** — Redis-based, prevents duplicate autopilot runs across workers

## Deployment (Railway)

Two services from the same repo:

### Web Service
```
Build: npm run build (prisma generate + next build)
Start: npm start (prisma db push + next start)
Port:  $PORT (auto-assigned)
```

### Worker Service
```
Build: npm run build
Start: npx prisma db push --accept-data-loss; npm run worker
Port:  none (background process, no healthcheck)
```

### Required Environment Variables

| Variable | Source |
|---|---|
| `DATABASE_URL` | Railway PostgreSQL (internal network) |
| `REDIS_URL` | Railway Redis/Valkey |
| `NEXTAUTH_SECRET` | Random string for session encryption |
| `NEXTAUTH_URL` | Public URL of the web service |

All integration API keys (Apollo, Instantly, Anthropic, etc.) are managed via the **Integrations** page in the app UI and stored in the database — not as environment variables.

## Local Development

```bash
# Prerequisites: Node 22.16.0, PostgreSQL, Redis

# Install dependencies
npm install

# Set up environment
cp .env.example .env  # Edit with your DATABASE_URL, REDIS_URL, etc.

# Push schema to database
npx prisma db push

# Run web server
npm run dev

# Run worker (separate terminal)
npm run worker
```

## Scale

- 75 Prisma models
- 120+ API routes
- 70+ pages
- 32 AI engine files
- 77 UI components
