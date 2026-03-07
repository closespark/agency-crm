// Single entry point for all sequence enrollments.
// Enforces: one contact, one active enrollment per sequence.
// Every enrollment path in the codebase MUST go through this function.

import { prisma } from "@/lib/prisma";

interface EnrollParams {
  sequenceId: string;
  contactId: string;
  channel?: string;
  nextActionAt?: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Enroll a contact in a sequence. Returns the enrollment ID, or null if skipped.
 * Skips silently (no throw) if:
 * - Contact already has an active enrollment in this sequence
 * - Contact has an active enrollment in ANY sequence (channel lock)
 * - Contact is opted out
 * - Contact has a handoff in progress
 */
export async function enrollContactInSequence(params: EnrollParams): Promise<string | null> {
  const { sequenceId, contactId, channel = "email", nextActionAt, metadata } = params;

  // Check contact state
  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    select: { globalOptOut: true, handoffInProgress: true },
  });
  if (!contact || contact.globalOptOut || contact.handoffInProgress) {
    return null;
  }

  // Channel lock: one contact, one active enrollment at a time (any sequence)
  const existingActive = await prisma.sequenceEnrollment.findFirst({
    where: { contactId, status: "active" },
    select: { id: true, sequenceId: true },
  });
  if (existingActive) {
    console.log(`[enrollment] Skipping: contact ${contactId} already active in sequence ${existingActive.sequenceId}`);
    return null;
  }

  // Create enrollment
  try {
    const enrollment = await prisma.sequenceEnrollment.create({
      data: {
        sequenceId,
        contactId,
        status: "active",
        currentStep: 0,
        channel,
        nextActionAt: nextActionAt ?? new Date(Date.now() + 2 * 60 * 60 * 1000),
        metadata: metadata ? JSON.stringify(metadata) : undefined,
      },
    });
    return enrollment.id;
  } catch (err) {
    // Handle race condition: if another process enrolled between our check and insert
    if (err instanceof Error && err.message.includes("Unique constraint")) {
      console.log(`[enrollment] Race condition caught: contact ${contactId} already enrolled`);
      return null;
    }
    throw err;
  }
}
