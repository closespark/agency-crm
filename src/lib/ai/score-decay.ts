// Score Decay Engine
// Behavioral/engagement scores lose 25% per month of inactivity.
// Full reset at 90 days of no engagement.
// Demographic/firmographic (fitScore) NEVER decays.
// This prevents stale leads from cluttering the pipeline.

import { prisma } from "@/lib/prisma";

const DECAY_RATE = 0.25; // 25% per month
const FULL_RESET_DAYS = 90;
const DECAY_INTERVAL_DAYS = 30;

export async function processScoreDecay(): Promise<{ decayed: number; reset: number }> {
  const now = new Date();
  let decayed = 0;
  let reset = 0;

  // Find contacts due for decay check
  // Either: never had decay applied, or last decay was 30+ days ago
  const contacts = await prisma.contact.findMany({
    where: {
      engagementScore: { gt: 0 },
      OR: [
        { engagementScoreLastDecay: null },
        { engagementScoreLastDecay: { lte: new Date(now.getTime() - DECAY_INTERVAL_DAYS * 24 * 60 * 60 * 1000) } },
      ],
    },
    select: {
      id: true,
      engagementScore: true,
      fitScore: true,
      leadScore: true,
      engagementScoreLastDecay: true,
    },
    take: 200,
  });

  for (const contact of contacts) {
    // Check last activity date
    const lastActivity = await prisma.activity.findFirst({
      where: { contactId: contact.id },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });

    const lastEmail = await prisma.emailEvent.findFirst({
      where: { contactId: contact.id },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });

    const lastConversation = await prisma.aIConversationLog.findFirst({
      where: { contactId: contact.id, direction: "inbound" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });

    // Find the most recent engagement
    const dates = [
      lastActivity?.createdAt,
      lastEmail?.createdAt,
      lastConversation?.createdAt,
    ].filter(Boolean) as Date[];

    const lastEngagement = dates.length > 0
      ? new Date(Math.max(...dates.map((d) => d.getTime())))
      : null;

    if (!lastEngagement) {
      // No engagement ever recorded — full reset
      await prisma.contact.update({
        where: { id: contact.id },
        data: {
          engagementScore: 0,
          leadScore: contact.fitScore, // composite = fit only
          engagementScoreLastDecay: now,
        },
      });
      reset++;
      continue;
    }

    const daysSinceEngagement = Math.floor(
      (now.getTime() - lastEngagement.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysSinceEngagement >= FULL_RESET_DAYS) {
      // 90+ days of inactivity: full reset of behavioral score
      await prisma.contact.update({
        where: { id: contact.id },
        data: {
          engagementScore: 0,
          leadScore: contact.fitScore,
          engagementScoreLastDecay: now,
        },
      });
      reset++;
    } else if (daysSinceEngagement >= DECAY_INTERVAL_DAYS) {
      // 30+ days: apply 25% decay
      const monthsInactive = Math.floor(daysSinceEngagement / DECAY_INTERVAL_DAYS);
      const decayFactor = Math.pow(1 - DECAY_RATE, monthsInactive);
      const newEngagementScore = Math.round(contact.engagementScore * decayFactor);
      const newLeadScore = contact.fitScore + newEngagementScore;

      await prisma.contact.update({
        where: { id: contact.id },
        data: {
          engagementScore: newEngagementScore,
          leadScore: Math.min(100, newLeadScore),
          engagementScoreLastDecay: now,
        },
      });
      decayed++;
    }
  }

  return { decayed, reset };
}
