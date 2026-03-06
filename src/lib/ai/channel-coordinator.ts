// Channel Coordination Layer
// Rule: one prospect, one active channel, one sequence at a time.
// When a reply comes in on any channel, everything else pauses immediately.
// When a channel gets no response, Claude escalates and logs why.

import { prisma } from "@/lib/prisma";
import { safeParseJSON } from "@/lib/safe-json";

export type Channel = "email" | "linkedin" | "phone";

const CHANNEL_ESCALATION_ORDER: Channel[] = ["linkedin", "email", "phone"];

// Lock a contact to a specific channel
export async function lockChannel(
  contactId: string,
  channel: Channel,
  sequenceId?: string
): Promise<void> {
  await prisma.channelLock.upsert({
    where: { contactId },
    create: {
      contactId,
      activeChannel: channel,
      sequenceId,
      lastOutboundAt: new Date(),
    },
    update: {
      activeChannel: channel,
      sequenceId,
      lastOutboundAt: new Date(),
    },
  });
}

// When a reply comes in: pause everything on other channels immediately
export async function onReplyReceived(
  contactId: string,
  replyChannel: Channel
): Promise<void> {
  // Pause all active sequences on other channels
  const enrollments = await prisma.sequenceEnrollment.findMany({
    where: { contactId, status: "active" },
    include: { sequence: true },
  });

  for (const enrollment of enrollments) {
    const steps = safeParseJSON(enrollment.sequence.steps, []) as Array<{ channel: string }>;
    const currentStepChannel = steps[enrollment.currentStep]?.channel;

    if (currentStepChannel && currentStepChannel !== replyChannel) {
      await prisma.sequenceEnrollment.update({
        where: { id: enrollment.id },
        data: { status: "paused" },
      });
    }
  }

  // Update channel lock to reflect where they're engaging
  await prisma.channelLock.upsert({
    where: { contactId },
    create: {
      contactId,
      activeChannel: replyChannel,
      lastResponseAt: new Date(),
    },
    update: {
      activeChannel: replyChannel,
      lastResponseAt: new Date(),
    },
  });
}

// Check for contacts that need channel escalation
export async function processChannelEscalations(): Promise<number> {
  const locks = await prisma.channelLock.findMany({
    where: {
      lastResponseAt: null, // never responded
    },
  });

  let escalated = 0;

  for (const lock of locks) {
    const daysSinceOutbound = lock.lastOutboundAt
      ? Math.floor((Date.now() - lock.lastOutboundAt.getTime()) / (1000 * 60 * 60 * 24))
      : 999;

    if (daysSinceOutbound >= lock.escalateAfterDays) {
      const currentIndex = CHANNEL_ESCALATION_ORDER.indexOf(lock.activeChannel as Channel);
      const nextChannel = CHANNEL_ESCALATION_ORDER[currentIndex + 1];

      if (nextChannel) {
        const history = safeParseJSON<Array<{ from: string; to: string; reason: string; date: string }>>(lock.escalationHistory, []);
        history.push({
          from: lock.activeChannel,
          to: nextChannel,
          reason: `No response after ${daysSinceOutbound} days on ${lock.activeChannel}`,
          date: new Date().toISOString(),
        });

        await prisma.channelLock.update({
          where: { id: lock.id },
          data: {
            activeChannel: nextChannel,
            escalationHistory: JSON.stringify(history),
            lastOutboundAt: null, // reset for new channel
          },
        });

        // Pause current sequences, the workflow engine will pick up and enroll in new channel
        await prisma.sequenceEnrollment.updateMany({
          where: { contactId: lock.contactId, status: "active" },
          data: { status: "completed" },
        });

        escalated++;
      }
    }
  }

  return escalated;
}

// Verify a contact can be messaged on a channel before sending
export async function canMessageOn(
  contactId: string,
  channel: Channel
): Promise<{ allowed: boolean; reason?: string }> {
  const lock = await prisma.channelLock.findUnique({ where: { contactId } });

  if (!lock) return { allowed: true }; // no lock yet, first touch

  if (lock.activeChannel !== channel) {
    return {
      allowed: false,
      reason: `Contact is locked to ${lock.activeChannel}. Cannot send on ${channel}.`,
    };
  }

  return { allowed: true };
}
