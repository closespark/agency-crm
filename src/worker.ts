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

let lastAutopilotDate = "";
let isShuttingDown = false;

// ============================================
// MAIN LOOP
// ============================================

async function tick() {
  if (isShuttingDown) return;

  try {
    // 1. Process scheduled jobs from Redis
    await processScheduledJobs();

    // 2. Process sequence queue (due enrollment steps)
    await processSequences();

    // 3. Meeting lifecycle: reminders + no-show detection
    await processMeetingLifecycle();

    // 4. Publish due content (newsletters, blog posts)
    await publishDueContent();

    // 5. Run daily autopilot (once per day)
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
    const { pullDueJobs, releaseJobLock } = await import("./lib/redis");
    const jobs = await pullDueJobs();

    for (const job of jobs) {
      try {
        console.log(`[worker] processing job: ${job.type} (${job.id})`);
        await executeJob(job.type, job.payload);
        await releaseJobLock(job.id);
      } catch (err) {
        console.error(`[worker] job ${job.type} (${job.id}) failed:`, err);
        // Don't release lock — let it expire via TTL to prevent immediate re-pickup.
        // Log to dead letter for manual inspection.
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
      }
    }
  } catch {
    // Redis not available — skip job processing this tick
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
      const remainingActions = payload.actions as Array<{ type: string; config: Record<string, unknown> }>;
      if (remainingActions) {
        for (const action of remainingActions) {
          await executeAction(action as Parameters<typeof executeAction>[0], context);
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

  try {
    const { generateDailyInsights } = await import("./lib/ai/autopilot");
    const insights = await generateDailyInsights();
    console.log(`[worker] daily autopilot complete: ${insights} insights generated`);

    // Set lastAutopilotDate AFTER successful execution (not before)
    lastAutopilotDate = today;

    // Log to SystemChangelog
    await prisma.systemChangelog.create({
      data: {
        category: "autopilot",
        changeType: "daily_run",
        description: `Daily autopilot completed. ${insights} insights generated.`,
        dataEvidence: JSON.stringify({ date: today, insightsGenerated: insights }),
      },
    });

    // Run autonomous prospecting (Apollo → ICP scoring → pipeline)
    try {
      const { runProspectingCycle } = await import("./lib/ai/icp-engine");
      const prospecting = await runProspectingCycle();
      console.log(`[worker] prospecting: ${prospecting.accepted} accepted, ${prospecting.rejected} rejected`);
    } catch (err) {
      console.error("[worker] prospecting cycle failed:", err);
    }

    // Run ICP self-optimization (only triggers after 10+ closed deals)
    try {
      const { optimizeICP } = await import("./lib/ai/icp-engine");
      const optimization = await optimizeICP();
      if (optimization.optimized) {
        console.log(`[worker] ICP optimized: ${optimization.reason}`);
      }
    } catch (err) {
      console.error("[worker] ICP optimization failed:", err);
    }

    // Fetch knowledge sources and extract insights daily (not just Sunday audit)
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
  } catch (err) {
    console.error("[worker] daily autopilot failed:", err);
  } finally {
    try {
      const { releaseDistributedLock } = await import("./lib/redis");
      await releaseDistributedLock("daily_autopilot");
    } catch {
      // Redis unavailable — lock will expire via TTL
    }
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
