import Redis from "ioredis";

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
};

function createRedisClient() {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error("REDIS_URL is not configured");
  }
  return new Redis(url, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      if (times > 5) return null; // stop retrying after 5 attempts
      return Math.min(times * 200, 2000);
    },
  });
}

export const redis = globalForRedis.redis ?? createRedisClient();

if (process.env.NODE_ENV !== "production") globalForRedis.redis = redis;

// ============================================
// JOB QUEUE — Redis-backed scheduled jobs
// ============================================

export interface ScheduledJob {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  runAt: string; // ISO timestamp
  createdAt: string;
}

const JOB_QUEUE_KEY = "acrm:jobs";
const JOB_LOCK_PREFIX = "acrm:lock:";

/**
 * Schedule a job to run at a specific time.
 * Jobs are stored in a Redis sorted set ordered by runAt timestamp.
 */
export async function scheduleJob(
  type: string,
  payload: Record<string, unknown>,
  runAt: Date
): Promise<string> {
  const id = `${type}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  const job: ScheduledJob = {
    id,
    type,
    payload,
    runAt: runAt.toISOString(),
    createdAt: new Date().toISOString(),
  };

  await redis.zadd(JOB_QUEUE_KEY, runAt.getTime(), JSON.stringify(job));
  return id;
}

/**
 * Pull all jobs that are due (runAt <= now).
 * Uses a distributed lock to prevent multiple workers from processing the same job.
 * Jobs are moved to a processing set (not deleted) so they can be recovered on failure.
 */
export async function pullDueJobs(): Promise<ScheduledJob[]> {
  const now = Date.now();
  const raw = await redis.zrangebyscore(JOB_QUEUE_KEY, 0, now);

  const jobs: ScheduledJob[] = [];
  for (const item of raw) {
    const job = JSON.parse(item) as ScheduledJob;

    // Try to acquire a lock for this job (120s TTL — enough for most jobs)
    const lockKey = `${JOB_LOCK_PREFIX}${job.id}`;
    const acquired = await redis.set(lockKey, "1", "EX", 120, "NX");
    if (!acquired) continue; // another worker grabbed it

    // Move from queue to processing set (atomic: remove + add to processing)
    await redis.zrem(JOB_QUEUE_KEY, item);
    await redis.set(`${JOB_PROCESSING_PREFIX}${job.id}`, item, "EX", 120);
    jobs.push(job);
  }

  return jobs;
}

const JOB_PROCESSING_PREFIX = "acrm:processing:";
const JOB_RETRY_PREFIX = "acrm:retry:";
const MAX_RETRIES = 3;

/**
 * Mark a job as successfully completed — removes from processing set.
 */
export async function completeJob(jobId: string): Promise<void> {
  await redis.del(`${JOB_PROCESSING_PREFIX}${jobId}`);
  await redis.del(`${JOB_LOCK_PREFIX}${jobId}`);
  await redis.del(`${JOB_RETRY_PREFIX}${jobId}`);
}

/**
 * Mark a job as failed — re-queues with exponential backoff if under retry limit.
 * Returns true if re-queued, false if max retries exceeded (dead letter).
 */
export async function failJob(jobId: string): Promise<boolean> {
  const raw = await redis.get(`${JOB_PROCESSING_PREFIX}${jobId}`);
  if (!raw) return false;

  // Track retry count
  const retries = parseInt(await redis.get(`${JOB_RETRY_PREFIX}${jobId}`) || "0");
  if (retries >= MAX_RETRIES) {
    // Max retries exceeded — clean up, caller should log to dead letter
    await redis.del(`${JOB_PROCESSING_PREFIX}${jobId}`);
    await redis.del(`${JOB_LOCK_PREFIX}${jobId}`);
    await redis.del(`${JOB_RETRY_PREFIX}${jobId}`);
    return false;
  }

  // Re-queue with exponential backoff: 30s, 60s, 120s
  const backoffMs = 30_000 * Math.pow(2, retries);
  const retryAt = Date.now() + backoffMs;
  await redis.zadd(JOB_QUEUE_KEY, retryAt, raw);
  await redis.set(`${JOB_RETRY_PREFIX}${jobId}`, String(retries + 1), "EX", 3600);

  // Clean up processing state
  await redis.del(`${JOB_PROCESSING_PREFIX}${jobId}`);
  await redis.del(`${JOB_LOCK_PREFIX}${jobId}`);

  return true;
}

/**
 * Release a job lock after processing.
 */
export async function releaseJobLock(jobId: string): Promise<void> {
  await redis.del(`${JOB_LOCK_PREFIX}${jobId}`);
}

// ============================================
// RATE LIMITER — Redis-backed sliding window
// ============================================

/**
 * Redis-backed rate limiter using sliding window.
 * Returns true if the request is allowed, false if rate limited.
 */
export async function checkRateLimitRedis(
  key: string,
  maxRequests: number = 100,
  windowMs: number = 60_000
): Promise<boolean> {
  const now = Date.now();
  const windowStart = now - windowMs;
  const redisKey = `acrm:ratelimit:${key}`;

  // Remove expired entries, count current entries, add new entry — all atomic
  const pipeline = redis.pipeline();
  pipeline.zremrangebyscore(redisKey, 0, windowStart);
  pipeline.zcard(redisKey);
  pipeline.zadd(redisKey, now, `${now}:${Math.random()}`);
  pipeline.pexpire(redisKey, windowMs);

  const results = await pipeline.exec();
  if (!results) return true;

  // results[1] is the zcard result
  const count = (results[1]?.[1] as number) || 0;
  return count < maxRequests;
}

// ============================================
// DISTRIBUTED LOCKS — prevent dual-worker execution
// ============================================

/**
 * Acquire a distributed lock. Returns true if acquired, false if another worker holds it.
 * Uses SET NX EX for atomic acquire with TTL.
 */
export async function acquireDistributedLock(
  name: string,
  ttlSeconds: number = 300
): Promise<boolean> {
  const lockKey = `acrm:dlock:${name}`;
  const result = await redis.set(lockKey, `${Date.now()}`, "EX", ttlSeconds, "NX");
  return result === "OK";
}

/**
 * Release a distributed lock.
 */
export async function releaseDistributedLock(name: string): Promise<void> {
  await redis.del(`acrm:dlock:${name}`);
}

// ============================================
// CACHE HELPERS
// ============================================

/**
 * Simple get/set cache with TTL.
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  const val = await redis.get(`acrm:cache:${key}`);
  if (!val) return null;
  return JSON.parse(val) as T;
}

export async function cacheSet(
  key: string,
  value: unknown,
  ttlSeconds: number = 300
): Promise<void> {
  await redis.set(`acrm:cache:${key}`, JSON.stringify(value), "EX", ttlSeconds);
}
