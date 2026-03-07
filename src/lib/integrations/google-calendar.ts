// Google Calendar integration — reads free/busy data for booking availability.
// Uses OAuth2 refresh tokens stored in the Integration model config.

import { prisma } from "@/lib/prisma";

interface CalendarConfig {
  client_id: string;
  client_secret: string;
  calendar_id: string;
  refresh_token: string;
  access_token?: string;
  token_expiry?: number;
}

interface TimeSlot {
  start: string; // ISO 8601
  end: string;
}

interface FreeBusyResponse {
  calendars: Record<string, { busy: TimeSlot[] }>;
}

// ============================================
// TOKEN MANAGEMENT
// ============================================

async function getConfig(): Promise<CalendarConfig | null> {
  const integration = await prisma.integration.findFirst({
    where: { name: "google_calendar", isActive: true },
  });
  if (!integration) return null;

  try {
    return JSON.parse(integration.config) as CalendarConfig;
  } catch {
    return null;
  }
}

async function getAccessToken(): Promise<string | null> {
  const config = await getConfig();
  if (!config?.refresh_token || !config?.client_id || !config?.client_secret) return null;

  // Check if current token is still valid
  if (config.access_token && config.token_expiry && Date.now() < config.token_expiry - 60_000) {
    return config.access_token;
  }

  // Refresh the token
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.client_id,
      client_secret: config.client_secret,
      refresh_token: config.refresh_token,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    console.error("[gcal] Token refresh failed:", await res.text());
    return null;
  }

  const data = await res.json();
  const newConfig: CalendarConfig = {
    ...config,
    access_token: data.access_token,
    token_expiry: Date.now() + (data.expires_in * 1000),
  };

  // Save the new token
  await prisma.integration.updateMany({
    where: { name: "google_calendar", isActive: true },
    data: { config: JSON.stringify(newConfig) },
  });

  return data.access_token;
}

// ============================================
// FREE/BUSY QUERY
// ============================================

async function getFreeBusy(startDate: Date, endDate: Date): Promise<TimeSlot[]> {
  const config = await getConfig();
  const token = await getAccessToken();
  if (!token || !config) return [];

  const calendarId = config.calendar_id || "primary";

  const res = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      timeMin: startDate.toISOString(),
      timeMax: endDate.toISOString(),
      items: [{ id: calendarId }],
    }),
  });

  if (!res.ok) {
    console.error("[gcal] FreeBusy query failed:", await res.text());
    return [];
  }

  const data: FreeBusyResponse = await res.json();
  return data.calendars?.[calendarId]?.busy || [];
}

// ============================================
// AVAILABLE SLOTS GENERATOR
// ============================================

interface AvailabilityOptions {
  daysAhead?: number; // How many days ahead to check (default: 14)
  slotDuration?: number; // Minutes per slot (default: 30)
  startHour?: number; // Business hours start UTC (default: 14 = 9 AM EST)
  endHour?: number; // Business hours end UTC (default: 22 = 5 PM EST)
  excludeWeekends?: boolean; // Default: true
}

export async function getAvailableSlots(options: AvailabilityOptions = {}): Promise<TimeSlot[]> {
  const {
    daysAhead = 14,
    slotDuration = 30,
    startHour = 14, // 9 AM EST in UTC
    endHour = 22, // 5 PM EST in UTC
    excludeWeekends = true,
  } = options;

  const now = new Date();
  const startDate = new Date(now);
  startDate.setUTCHours(0, 0, 0, 0);
  startDate.setUTCDate(startDate.getUTCDate() + 1); // Start tomorrow

  const endDate = new Date(startDate);
  endDate.setUTCDate(endDate.getUTCDate() + daysAhead);

  const busy = await getFreeBusy(startDate, endDate);

  // Generate all possible slots within business hours
  const slots: TimeSlot[] = [];
  const current = new Date(startDate);

  while (current < endDate) {
    const dayOfWeek = current.getUTCDay();

    // Skip weekends
    if (excludeWeekends && (dayOfWeek === 0 || dayOfWeek === 6)) {
      current.setUTCDate(current.getUTCDate() + 1);
      continue;
    }

    // Generate slots for this day
    for (let hour = startHour; hour < endHour; hour++) {
      for (let minute = 0; minute < 60; minute += slotDuration) {
        const slotStart = new Date(current);
        slotStart.setUTCHours(hour, minute, 0, 0);

        const slotEnd = new Date(slotStart);
        slotEnd.setUTCMinutes(slotEnd.getUTCMinutes() + slotDuration);

        // Don't include slots in the past
        if (slotStart <= now) continue;

        // Don't exceed business hours
        if (slotEnd.getUTCHours() > endHour || (slotEnd.getUTCHours() === endHour && slotEnd.getUTCMinutes() > 0)) {
          continue;
        }

        // Check if this slot overlaps with any busy period
        const isConflict = busy.some((b) => {
          const busyStart = new Date(b.start);
          const busyEnd = new Date(b.end);
          return slotStart < busyEnd && slotEnd > busyStart;
        });

        if (!isConflict) {
          slots.push({
            start: slotStart.toISOString(),
            end: slotEnd.toISOString(),
          });
        }
      }
    }

    current.setUTCDate(current.getUTCDate() + 1);
  }

  return slots;
}

// ============================================
// CREATE CALENDAR EVENT
// ============================================

export async function createCalendarEvent(params: {
  title: string;
  startTime: string;
  endTime: string;
  description?: string;
  attendeeEmail?: string;
}): Promise<string | null> {
  const config = await getConfig();
  const token = await getAccessToken();
  if (!token || !config) return null;

  const calendarId = config.calendar_id || "primary";

  const event: Record<string, unknown> = {
    summary: params.title,
    start: { dateTime: params.startTime },
    end: { dateTime: params.endTime },
    description: params.description,
  };

  // Always include tl;dv notetaker so it auto-joins and transcribes
  const attendees: { email: string }[] = [{ email: "notetaker@tldv.io" }];
  if (params.attendeeEmail) {
    attendees.push({ email: params.attendeeEmail });
  }
  event.attendees = attendees;
  event.sendUpdates = "all";

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
    }
  );

  if (!res.ok) {
    console.error("[gcal] Create event failed:", await res.text());
    return null;
  }

  const data = await res.json();
  return data.id;
}

// ============================================
// SYNC CALENDAR EVENTS → Meeting table
// ============================================

export async function syncCalendarEvents(): Promise<number> {
  const config = await getConfig();
  const token = await getAccessToken();
  if (!token || !config) return 0;

  const calendarId = config.calendar_id || "primary";

  const now = new Date();
  const sevenDaysOut = new Date(now);
  sevenDaysOut.setUTCDate(sevenDaysOut.getUTCDate() + 7);

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?` +
      new URLSearchParams({
        timeMin: now.toISOString(),
        timeMax: sevenDaysOut.toISOString(),
        singleEvents: "true",
        orderBy: "startTime",
        maxResults: "100",
      }),
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (!res.ok) {
    console.error("[gcal] List events failed:", await res.text());
    return 0;
  }

  const data = await res.json();
  const events: Array<{
    id: string;
    summary?: string;
    description?: string;
    start?: { dateTime?: string; date?: string };
    end?: { dateTime?: string; date?: string };
    attendees?: Array<{ email: string }>;
    hangoutLink?: string;
    location?: string;
    status?: string;
  }> = data.items || [];

  let synced = 0;

  for (const event of events) {
    // Skip cancelled events
    if (event.status === "cancelled") continue;

    const startTime = event.start?.dateTime || event.start?.date;
    const endTime = event.end?.dateTime || event.end?.date;
    if (!startTime || !endTime) continue;

    const eventStart = new Date(startTime);
    const eventEnd = new Date(endTime);
    const title = event.summary || "Untitled Event";
    const meetingLocation = event.hangoutLink || event.location || null;

    // Deduplicate: match by Google Calendar event ID stored in location/description,
    // or by exact title + startTime
    const existing = await prisma.meeting.findFirst({
      where: {
        OR: [
          // Match by gcal event ID in description metadata
          { description: { contains: `gcal:${event.id}` } },
          // Match by exact title + start time (covers manually-created duplicates)
          { title, startTime: eventStart },
        ],
      },
    });

    if (existing) continue;

    // Try to match an attendee to a CRM contact
    let contactId: string | null = null;
    if (event.attendees?.length) {
      for (const attendee of event.attendees) {
        const contact = await prisma.contact.findFirst({
          where: { email: attendee.email },
          select: { id: true },
        });
        if (contact) {
          contactId = contact.id;
          break;
        }
      }
    }

    await prisma.meeting.create({
      data: {
        title,
        description: `${event.description || ""}\n\ngcal:${event.id}`.trim(),
        startTime: eventStart,
        endTime: eventEnd,
        location: meetingLocation,
        type: "one_on_one",
        contactId,
        status: "scheduled",
      },
    });

    synced++;
  }

  return synced;
}

// ============================================
// CHECK IF INTEGRATION IS CONFIGURED
// ============================================

export async function isGoogleCalendarConfigured(): Promise<boolean> {
  const config = await getConfig();
  return !!(config?.client_id && config?.client_secret && config?.refresh_token);
}
