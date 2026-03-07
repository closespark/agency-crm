// Background Worker — runs as a separate Railway service
// Handles: daily autopilot, Sunday self-audit, score decay, scheduled jobs
// Keeps heavy processing off the API server so request latency stays clean.
//
// Usage: npx tsx src/worker.ts

import "dotenv/config";

// Force-load Prisma client
import { prisma } from "./lib/prisma";
import { getKey } from "./lib/integration-keys";

const TICK_INTERVAL_MS = 30_000; // Check for work every 30 seconds
const DAILY_AUTOPILOT_HOUR = 6; // Run daily autopilot at 6 AM UTC
const GMAIL_WATCH_INTERVAL_MS = 6 * 24 * 60 * 60 * 1000; // Re-register every 6 days (watches expire after 7)

let lastAutopilotDate = "";
let lastGmailWatchAt = 0;
let isShuttingDown = false;

// ============================================
// MAIN LOOP
// ============================================

async function isAutopilotPaused(): Promise<boolean> {
  try {
    const record = await prisma.systemChangelog.findFirst({
      where: { category: "autopilot", changeType: "status" },
      orderBy: { createdAt: "desc" },
    });
    return record?.description === "paused";
  } catch {
    return false; // Default to active if DB check fails
  }
}

async function tick() {
  if (isShuttingDown) return;

  try {
    // Check if autopilot has been paused via the UI
    const paused = await isAutopilotPaused();
    if (paused) {
      return; // Skip all processing when paused
    }

    // 1. Process scheduled jobs from Redis
    await processScheduledJobs();

    // 1b. Process due workflow resume tasks (from Prisma Task table)
    await processWorkflowResumeTasks();

    // 2. Process sequence queue (due enrollment steps)
    await processSequences();

    // 3. Meeting lifecycle: reminders + no-show detection
    await processMeetingLifecycle();

    // 4. Publish due content (newsletters, blog posts)
    await publishDueContent();

    // 5. Re-register Gmail push notifications (watches expire after 7 days)
    await maybeRenewGmailWatch();

    // 6. Run daily autopilot (once per day)
    await maybeDailyAutopilot();
  } catch (err) {
    console.error("[worker] tick error:", err);
  }
}

// ============================================
// SCHEDULED JOBS (Redis queue)
// ============================================

async function processScheduledJobs() {
  try {
    const { pullDueJobs, completeJob, failJob } = await import("./lib/redis");
    const jobs = await pullDueJobs();

    for (const job of jobs) {
      try {
        console.log(`[worker] processing job: ${job.type} (${job.id})`);
        await executeJob(job.type, job.payload);
        await completeJob(job.id);
      } catch (err) {
        console.error(`[worker] job ${job.type} (${job.id}) failed:`, err);
        // Re-queue with exponential backoff (up to 3 retries)
        const requeued = await failJob(job.id);
        if (!requeued) {
          // Max retries exceeded — log to dead letter for manual inspection
          console.error(`[worker] job ${job.type} (${job.id}) exceeded max retries, moving to dead letter`);
          try {
            await prisma.rawEventLog.create({
              data: {
                source: "worker_dlq",
                eventType: `job_failed:${job.type}`,
                rawPayload: JSON.stringify({ job, error: err instanceof Error ? err.message : String(err) }),
                processed: false,
                processingError: err instanceof Error ? err.message : String(err),
              },
            });
          } catch {
            // If DB write fails too, the console.error above is our fallback
          }
        } else {
          console.log(`[worker] job ${job.type} (${job.id}) re-queued for retry`);
        }
      }
    }
  } catch {
    // Redis not available — skip job processing this tick
  }
}

async function processWorkflowResumeTasks() {
  try {
    const dueTasks = await prisma.task.findMany({
      where: {
        type: "workflow_resume",
        status: "pending",
        dueDate: { lte: new Date() },
      },
    });

    for (const task of dueTasks) {
      try {
        const data = JSON.parse(task.description || "{}");
        if (data.remainingActions && data.context) {
          await executeJob("workflow_resume", {
            remainingActions: data.remainingActions,
            context: data.context,
          });
        }
        await prisma.task.update({
          where: { id: task.id },
          data: { status: "completed" },
        });
      } catch (err) {
        console.error(`[worker] workflow resume task ${task.id} failed:`, err);
      }
    }
  } catch (err) {
    console.error("[worker] workflow resume check error:", err);
  }
}

async function executeJob(type: string, payload: Record<string, unknown>) {
  switch (type) {
    case "score_contact": {
      const { scoreContact } = await import("./lib/ai/lead-scorer");
      await scoreContact(payload.contactId as string);
      break;
    }
    case "generate_meeting_brief": {
      const { generateMeetingBrief } = await import("./lib/ai/meeting-brief");
      await generateMeetingBrief(payload.meetingId as string);
      break;
    }
    case "send_email": {
      const { sendEmail } = await import("./lib/integrations/gmail");
      await sendEmail({
        to: payload.to as string,
        subject: payload.subject as string,
        body: payload.body as string,
        fromName: payload.fromName as string | undefined,
      });
      break;
    }
    case "workflow_resume": {
      // Resume workflow execution after a wait action
      const { executeAction } = await import("./lib/ai/workflow-engine");
      const context = payload.context as { contactId?: string; dealId?: string; data: Record<string, unknown> };
      const remainingActions = payload.remainingActions as Array<{ type: string; config: Record<string, unknown> }>;
      if (remainingActions) {
        for (const action of remainingActions) {
          const result = await executeAction(action as Parameters<typeof executeAction>[0], context);
          if (result === "wait") break; // Another wait — stop here
        }
      }
      break;
    }
    case "process_handoff_queue": {
      const { processHandoffQueue } = await import("./lib/ai/domain-handoff");
      await processHandoffQueue();
      break;
    }
    default:
      console.warn(`[worker] unknown job type: ${type}`);
  }
}

// ============================================
// SEQUENCE PROCESSING
// ============================================

async function processSequences() {
  try {
    const { processSequenceQueue } = await import("./lib/ai/autopilot");
    const processed = await processSequenceQueue();
    if (processed > 0) {
      console.log(`[worker] processed ${processed} sequence steps`);
    }
  } catch (err) {
    console.error("[worker] sequence processing error:", err);
  }

  // Auto-push active sequences with cold-domain contacts to Instantly
  try {
    if (!process.env.INSTANTLY_API_KEY) return;

    // Find active sequences that have cold-domain enrollments not yet pushed
    const candidates = await prisma.sequence.findMany({
      where: {
        isActive: true,
        enrollments: {
          some: {
            status: "active",
            contact: { domainTier: "cold" },
            metadata: { not: { contains: "instantlyCampaignId" } },
          },
        },
      },
      select: { id: true, name: true },
    });

    if (candidates.length > 0) {
      const { pushSequenceToInstantly } = await import("./lib/integrations/sync");
      for (const seq of candidates) {
        try {
          const result = await pushSequenceToInstantly(seq.id);
          console.log(`[worker] auto-pushed sequence "${seq.name}" to Instantly: ${result.leadsAdded} leads, campaign ${result.instantlyId}`);
        } catch (err) {
          console.error(`[worker] auto-push to Instantly failed for sequence ${seq.id}:`, err);
        }
      }
    }
  } catch (err) {
    console.error("[worker] Instantly auto-push error:", err);
  }
}

// ============================================
// CONTENT PUBLISHING (due newsletters, blog posts)
// ============================================

async function publishDueContent() {
  try {
    const { publishDueContent: publish } = await import("./lib/ai/content-engine");
    const published = await publish();
    if (published > 0) {
      console.log(`[worker] published ${published} content pieces`);
    }
  } catch (err) {
    console.error("[worker] content publish error:", err);
  }
}

// ============================================
// MEETING LIFECYCLE (reminders + no-shows)
// ============================================

async function processMeetingLifecycle() {
  try {
    const { sendMeetingReminders, detectNoShows } = await import("./lib/ai/meeting-lifecycle");

    const reminders = await sendMeetingReminders();
    if (reminders > 0) {
      console.log(`[worker] sent ${reminders} meeting reminders`);
    }

    const noShows = await detectNoShows();
    if (noShows > 0) {
      console.log(`[worker] detected ${noShows} no-shows`);
    }
  } catch (err) {
    console.error("[worker] meeting lifecycle error:", err);
  }
}

// ============================================
// GMAIL WATCH (push notification registration)
// ============================================

async function maybeRenewGmailWatch() {
  if (Date.now() - lastGmailWatchAt < GMAIL_WATCH_INTERVAL_MS) return;

  try {
    const { setupGmailWatch } = await import("./lib/integrations/gmail");
    const result = await setupGmailWatch();
    lastGmailWatchAt = Date.now();
    console.log(`[worker] Gmail watch registered (expires: ${result.expiration})`);
  } catch (err) {
    console.error("[worker] Gmail watch registration failed:", err);
  }
}

// ============================================
// DAILY AUTOPILOT (runs once per calendar day)
// ============================================

async function maybeDailyAutopilot() {
  const now = new Date();
  const today = now.toISOString().split("T")[0]; // YYYY-MM-DD
  const currentHour = now.getUTCHours();

  // Only run once per day, at or after the target hour
  if (today === lastAutopilotDate) return;
  if (currentHour < DAILY_AUTOPILOT_HOUR) return;

  console.log(`[worker] starting daily autopilot for ${today}`);

  // Distributed lock: prevent multiple workers from running autopilot simultaneously
  let lockAcquired = false;
  try {
    const { acquireDistributedLock } = await import("./lib/redis");
    lockAcquired = await acquireDistributedLock("daily_autopilot", 600); // 10 min TTL
  } catch {
    // Redis unavailable — proceed (single worker assumed)
    lockAcquired = true;
  }

  if (!lockAcquired) {
    console.log("[worker] daily autopilot already running on another worker, skipping");
    return;
  }

  // Mark autopilot date before individual steps — each step has its own try/catch
  // so a failure in one won't prevent the others from running.
  lastAutopilotDate = today;

  // ── Step 1: Daily insights ──────────────────────────────────────────
  try {
    const { generateDailyInsights } = await import("./lib/ai/autopilot");
    const insights = await generateDailyInsights();
    console.log(`[worker] daily autopilot complete: ${insights} insights generated`);

    await prisma.systemChangelog.create({
      data: {
        category: "autopilot",
        changeType: "daily_run",
        description: `Daily autopilot completed. ${insights} insights generated.`,
        dataEvidence: JSON.stringify({ date: today, insightsGenerated: insights }),
      },
    });
  } catch (err) {
    console.error("[worker] daily insights failed:", err);
  }

  // ── Step 2: Apollo prospecting cycle ────────────────────────────────
  try {
    const { runProspectingCycle } = await import("./lib/ai/icp-engine");
    const prospecting = await runProspectingCycle();
    console.log(`[worker] prospecting: ${prospecting.accepted} accepted, ${prospecting.rejected} rejected`);
  } catch (err) {
    console.error("[worker] prospecting cycle failed:", err);
  }

  // ── Step 3: Auto-enrich un-enriched prospects ───────────────────────
  try {
    const unenriched = await prisma.prospect.findMany({
      where: { status: "new", enrichedData: null },
      orderBy: { fitScore: "desc" },
    });

    if (unenriched.length > 0) {
      const { apollo } = await import("./lib/integrations/apollo");
      let enriched = 0;
      for (const prospect of unenriched) {
        try {
          let enrichedPerson = null;
          if (prospect.email) {
            const personResult = await apollo.enrichPerson(prospect.email);
            enrichedPerson = personResult.person;
          }

          let enrichedCompany = null;
          if (prospect.companyDomain) {
            const companyResult = await apollo.enrichCompany(prospect.companyDomain);
            enrichedCompany = companyResult.organization;
          }

          const enrichedData = {
            person: enrichedPerson,
            company: enrichedCompany,
            enrichedAt: new Date().toISOString(),
          };

          const updateData: Record<string, unknown> = {
            enrichedData: JSON.stringify(enrichedData),
            status: "verified",
          };

          if (enrichedPerson) {
            if (!prospect.email && enrichedPerson.email) updateData.email = enrichedPerson.email;
            if (!prospect.linkedinUrl && enrichedPerson.linkedin_url) updateData.linkedinUrl = enrichedPerson.linkedin_url;
            if (!prospect.jobTitle && enrichedPerson.title) updateData.jobTitle = enrichedPerson.title;
          }

          if (enrichedCompany) {
            if (!prospect.companySize && enrichedCompany.estimated_num_employees) {
              const emp = enrichedCompany.estimated_num_employees;
              if (emp <= 10) updateData.companySize = "1-10";
              else if (emp <= 50) updateData.companySize = "11-50";
              else if (emp <= 200) updateData.companySize = "51-200";
              else if (emp <= 500) updateData.companySize = "201-500";
              else if (emp <= 1000) updateData.companySize = "501-1000";
              else updateData.companySize = "1001+";
            }
            if (!prospect.industry && enrichedCompany.industry) updateData.industry = enrichedCompany.industry;
          }

          await prisma.prospect.update({
            where: { id: prospect.id },
            data: updateData,
          });
          enriched++;
        } catch (err) {
          console.error(`[worker] auto-enrich prospect ${prospect.id} failed:`, err);
        }
      }
      if (enriched > 0) {
        console.log(`[worker] auto-enriched ${enriched} prospects`);
      }
    }
  } catch (err) {
    console.error("[worker] auto-enrich failed:", err);
  }

  // ── Step 4: Auto-convert prospects to contacts ──────────────────────
  // (convertProspectToContact also auto-enrolls new contacts in the first active sequence)
  try {
    const { convertProspectToContact } = await import("./lib/ai/prospector");
    const readyProspects = await prisma.prospect.findMany({
      where: { status: { in: ["new", "verified"] } },
      orderBy: { fitScore: "desc" },
    });

    let converted = 0;
    for (const prospect of readyProspects) {
      try {
        await convertProspectToContact(prospect.id);
        converted++;
      } catch (err) {
        console.error(`[worker] auto-convert prospect ${prospect.id} failed:`, err);
      }
    }
    if (converted > 0) {
      console.log(`[worker] auto-converted ${converted} prospects to contacts`);
    }
  } catch (err) {
    console.error("[worker] auto-convert failed:", err);
  }

  // ── Step 5: Auto-enroll new contacts in sequences ───────────────────
  // Catches contacts that were created outside the prospecting pipeline
  // (e.g. manual import, form submission) and don't have any enrollment yet.
  try {
    const recentContacts = await prisma.contact.findMany({
      where: {
        lifecycleStage: "lead",
        leadStatus: "new",
        sequenceEnrollments: { none: {} },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    if (recentContacts.length > 0) {
      const activeSequence = await prisma.sequence.findFirst({
        where: { isActive: true },
        orderBy: { createdAt: "asc" },
      });

      if (activeSequence) {
        const { safeParseJSON } = await import("./lib/safe-json");
        const steps = safeParseJSON(activeSequence.steps, [] as Array<{ delayDays: number }>);
        const firstStepDelay = steps[0]?.delayDays || 0;
        const { enrollContactInSequence } = await import("./lib/ai/sequence-enrollment");

        let enrolled = 0;
        for (const contact of recentContacts) {
          try {
            const enrollmentId = await enrollContactInSequence({
              sequenceId: activeSequence.id,
              contactId: contact.id,
              channel: contact.domainTier === "warm" ? "email" : "multi",
              nextActionAt: new Date(Date.now() + firstStepDelay * 24 * 60 * 60 * 1000),
            });
            if (enrollmentId) enrolled++;
          } catch (err) {
            console.error(`[worker] auto-enroll contact ${contact.id} failed:`, err);
          }
        }
        if (enrolled > 0) {
          console.log(`[worker] auto-enrolled ${enrolled} new contacts in sequence "${activeSequence.name}"`);
        }
      }
    }
  } catch (err) {
    console.error("[worker] auto-enroll in sequences failed:", err);
  }

  // ── Step 6: Auto-push cold-domain contacts to Instantly ─────────────
  try {
    if (process.env.INSTANTLY_API_KEY) {
      const candidates = await prisma.sequence.findMany({
        where: {
          isActive: true,
          enrollments: {
            some: {
              status: "active",
              contact: { domainTier: "cold" },
              metadata: { not: { contains: "instantlyCampaignId" } },
            },
          },
        },
        select: { id: true, name: true },
      });

      if (candidates.length > 0) {
        const { pushSequenceToInstantly } = await import("./lib/integrations/sync");
        for (const seq of candidates) {
          try {
            const result = await pushSequenceToInstantly(seq.id);
            console.log(`[worker] auto-pushed sequence "${seq.name}" to Instantly: ${result.leadsAdded} leads, campaign ${result.instantlyId}`);
          } catch (err) {
            console.error(`[worker] auto-push to Instantly failed for sequence ${seq.id}:`, err);
          }
        }
      }
    }
  } catch (err) {
    console.error("[worker] Instantly auto-push failed:", err);
  }

  // ── Step 7: ICP self-optimization (only triggers after 10+ closed deals)
  try {
    const { optimizeICP } = await import("./lib/ai/icp-engine");
    const optimization = await optimizeICP();
    if (optimization.optimized) {
      console.log(`[worker] ICP optimized: ${optimization.reason}`);
    }
  } catch (err) {
    console.error("[worker] ICP optimization failed:", err);
  }

  // ── Step 8: Generate content drafts ─────────────────────────────────
  try {
    const { generateContentDrafts } = await import("./lib/ai/content-engine");
    const drafted = await generateContentDrafts();
    if (drafted > 0) {
      console.log(`[worker] content: generated ${drafted} drafts`);
    }
  } catch (err) {
    console.error("[worker] content generation failed:", err);
  }

  // ── Step 9: Fetch knowledge sources and extract insights ────────────
  try {
    const { fetchKnowledgeSources, extractInsights } = await import("./lib/ai/knowledge-engine");
    const fetched = await fetchKnowledgeSources();
    if (fetched > 0) {
      console.log(`[worker] knowledge: fetched ${fetched} sources`);
      const extracted = await extractInsights();
      console.log(`[worker] knowledge: extracted ${extracted} insights`);
    }
  } catch (err) {
    console.error("[worker] knowledge fetch failed:", err);
  }

  // ── Cleanup: release distributed lock ───────────────────────────────
  try {
    const { releaseDistributedLock } = await import("./lib/redis");
    await releaseDistributedLock("daily_autopilot");
  } catch {
    // Redis unavailable — lock will expire via TTL
  }
}

// ============================================
// LIFECYCLE
// ============================================

async function start() {
  console.log("[worker] AgencyCRM background worker starting...");
  console.log(`[worker] tick interval: ${TICK_INTERVAL_MS}ms`);
  console.log(`[worker] daily autopilot hour: ${DAILY_AUTOPILOT_HOUR} UTC`);

  // Load API keys from DB into process.env (keys set on /integrations page)
  try {
    await getKey("ANTHROPIC_API_KEY"); // triggers cache load for all keys
    console.log("[worker] integration keys loaded from DB");
  } catch (err) {
    console.warn("[worker] failed to load integration keys from DB:", err);
  }

  // Initialize Gmail push notifications (watch expires after 7 days, re-registered in tick loop)
  try {
    const { setupGmailWatch } = await import("./lib/integrations/gmail");
    const result = await setupGmailWatch();
    lastGmailWatchAt = Date.now();
    console.log(`[worker] Gmail watch initialized (expires: ${result.expiration})`);
  } catch (err) {
    console.warn("[worker] Gmail watch setup failed (will retry in tick loop):", err);
  }

  // Check last autopilot run to avoid re-running on restart
  try {
    const lastRun = await prisma.systemChangelog.findFirst({
      where: { category: "autopilot", changeType: "daily_run" },
      orderBy: { createdAt: "desc" },
    });
    if (lastRun) {
      lastAutopilotDate = lastRun.createdAt.toISOString().split("T")[0];
      console.log(`[worker] last autopilot run: ${lastAutopilotDate}`);
    }
  } catch (err) {
    console.error("[worker] failed to check last autopilot run:", err);
  }

  // Auto-seed templates and sequences on first boot (AI-generated)
  try {
    const { autoSeedIfEmpty } = await import("./lib/ai/auto-seed");
    await autoSeedIfEmpty();
  } catch (err) {
    console.error("[worker] auto-seed failed:", err);
  }

  // Seed ICP profile on first boot
  try {
    const { seedICPIfEmpty } = await import("./lib/ai/icp-engine");
    await seedICPIfEmpty();
  } catch (err) {
    console.error("[worker] ICP seed failed:", err);
  }

  // Seed Knowledge Engine sources on first boot
  try {
    const { seedKnowledgeSourcesIfEmpty } = await import("./lib/ai/knowledge-engine");
    await seedKnowledgeSourcesIfEmpty();
  } catch (err) {
    console.error("[worker] Knowledge source seed failed:", err);
  }

  // Seed Voice Profile on first boot
  try {
    const { seedVoiceProfileIfEmpty } = await import("./lib/ai/voice-profile");
    await seedVoiceProfileIfEmpty();
  } catch (err) {
    console.error("[worker] Voice profile seed failed:", err);
  }

  // Seed Stage Gates on first boot (lifecycle engine requires these for proper gating)
  try {
    const { seedStageGates } = await import("./lib/ai/lifecycle-engine");
    await seedStageGates();
  } catch (err) {
    console.error("[worker] Stage gate seed failed:", err);
  }

  // Main loop
  const interval = setInterval(tick, TICK_INTERVAL_MS);

  // Run immediately on startup
  await tick();

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`[worker] received ${signal}, shutting down...`);
    isShuttingDown = true;
    clearInterval(interval);
    await prisma.$disconnect();
    try {
      const { redis } = await import("./lib/redis");
      redis.disconnect();
    } catch {
      // Redis may not be configured
    }
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

start().catch((err) => {
  console.error("[worker] fatal error:", err);
  process.exit(1);
});
