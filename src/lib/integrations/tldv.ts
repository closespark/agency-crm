// tl;dv integration — receives meeting transcripts via webhook and fetches them via API.
// tl;dv auto-joins meetings when notetaker@tldv.io is added as a calendar guest.
// API docs: https://doc.tldv.io
// Base URL: https://pasta.tldv.io

const TLDV_BASE_URL = "https://pasta.tldv.io";

function getApiKey(): string {
  const key = process.env.TLDV_API_KEY;
  if (!key) throw new Error("TLDV_API_KEY not configured");
  return key;
}

interface TldvTranscriptSegment {
  startTime: number;
  endTime: number;
  text: string;
  speaker?: string;
}

interface TldvMeeting {
  id: string;
  title?: string;
  startedAt?: string;
  endedAt?: string;
  participants?: { name: string; email?: string }[];
}

// ============================================
// FETCH TRANSCRIPT
// ============================================

export async function fetchTranscript(tldvMeetingId: string): Promise<{
  text: string;
  segments: TldvTranscriptSegment[];
}> {
  const res = await fetch(`${TLDV_BASE_URL}/v1alpha1/meetings/${tldvMeetingId}/transcript`, {
    headers: { "x-api-key": getApiKey() },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`tl;dv transcript fetch failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  const segments: TldvTranscriptSegment[] = data.segments || data.data?.segments || [];

  // Build full text from segments
  const fullText = segments
    .map((s) => (s.speaker ? `${s.speaker}: ${s.text}` : s.text))
    .join("\n");

  return { text: fullText, segments };
}

// ============================================
// FETCH MEETING DETAILS
// ============================================

export async function fetchMeeting(tldvMeetingId: string): Promise<TldvMeeting> {
  const res = await fetch(`${TLDV_BASE_URL}/v1alpha1/meetings/${tldvMeetingId}`, {
    headers: { "x-api-key": getApiKey() },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`tl;dv meeting fetch failed (${res.status}): ${text}`);
  }

  return res.json();
}

// ============================================
// WEBHOOK PAYLOAD TYPES
// ============================================

export interface TldvWebhookPayload {
  id: string;
  event: "TranscriptReady" | "MeetingReady";
  data: {
    id: string;
    meetingId: string;
    data?: {
      transcript?: string;
      segments?: TldvTranscriptSegment[];
    };
  };
  executedAt: string;
}

/**
 * Match a tl;dv meeting to a CRM meeting by looking at:
 * 1. Calendar event ID stored in meeting.location (gcal:eventId)
 * 2. Participant email matching a contact email
 * 3. Title fuzzy match + time overlap
 */
export async function matchTldvMeetingToCrm(
  tldvMeetingId: string
): Promise<string | null> {
  const { prisma } = await import("@/lib/prisma");

  // Try to get tl;dv meeting details for participant matching
  let tldvMeeting: TldvMeeting | null = null;
  try {
    tldvMeeting = await fetchMeeting(tldvMeetingId);
  } catch {
    // Can't fetch details — fall back to time-based matching
  }

  // Strategy 1: Match by participant email
  if (tldvMeeting?.participants) {
    const emails = tldvMeeting.participants
      .map((p) => p.email)
      .filter((e): e is string => !!e && e !== "notetaker@tldv.io");

    if (emails.length > 0) {
      const contacts = await prisma.contact.findMany({
        where: { email: { in: emails } },
        select: { id: true },
      });

      if (contacts.length > 0) {
        const contactIds = contacts.map((c) => c.id);
        const meeting = await prisma.meeting.findFirst({
          where: {
            contactId: { in: contactIds },
            status: { in: ["scheduled", "requested"] },
            startTime: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // last 24h
          },
          orderBy: { startTime: "desc" },
        });
        if (meeting) return meeting.id;
      }
    }
  }

  // Strategy 2: Match by time proximity (most recent scheduled meeting that ended recently)
  const recentMeeting = await prisma.meeting.findFirst({
    where: {
      status: { in: ["scheduled", "requested"] },
      endTime: {
        gte: new Date(Date.now() - 2 * 60 * 60 * 1000), // ended within last 2 hours
        lte: new Date(Date.now() + 30 * 60 * 1000), // or ending in next 30 min
      },
    },
    orderBy: { endTime: "desc" },
  });

  return recentMeeting?.id || null;
}
