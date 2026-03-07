// Score capping utility — ensures leadScore and engagementScore never exceed 100
// Used by all webhook handlers and automation paths that increment scores.
// Uses Redis distributed lock to prevent concurrent read-increment-write races (Issue 12).

import { prisma } from "./prisma";
import { acquireDistributedLock, releaseDistributedLock } from "./redis";

const SCORE_LOCK_PREFIX = "score:";
const SCORE_LOCK_TTL = 5; // 5 seconds — scoring is fast

/**
 * Safely increment a contact's engagement and/or lead score, capped at 100.
 * Uses a Redis lock per contact to prevent concurrent read-increment-write races.
 */
export async function incrementContactScore(
  contactId: string,
  delta: number,
  opts?: { engagementOnly?: boolean }
): Promise<void> {
  const lockName = `${SCORE_LOCK_PREFIX}${contactId}`;
  const acquired = await acquireDistributedLock(lockName, SCORE_LOCK_TTL);

  if (!acquired) {
    // Another process is scoring this contact — wait briefly and retry once
    await new Promise((r) => setTimeout(r, 200));
    const retryAcquired = await acquireDistributedLock(lockName, SCORE_LOCK_TTL);
    if (!retryAcquired) {
      console.warn(`[score-utils] Could not acquire lock for ${contactId} — skipping increment`);
      return;
    }
  }

  try {
    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
      select: { engagementScore: true, leadScore: true },
    });
    if (!contact) return;

    const data: Record<string, unknown> = {
      engagementScore: Math.min(100, contact.engagementScore + delta),
      scoreDirty: true,
    };

    if (!opts?.engagementOnly) {
      data.leadScore = Math.min(100, contact.leadScore + delta);
    }

    await prisma.contact.update({ where: { id: contactId }, data });
  } finally {
    await releaseDistributedLock(lockName);
  }
}
