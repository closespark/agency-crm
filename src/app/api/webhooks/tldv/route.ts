// POST /api/webhooks/tldv — receives tl;dv webhook events
// Primary event: TranscriptReady — triggers the full post-meeting automation chain:
// 1. Fetch transcript from tl;dv API
// 2. Match to CRM meeting by participant email or time proximity
// 3. Store transcript
// 4. AI analyzes transcript → BANT, deal signals, follow-up email
// 5. Update CRM (contact, deal stage, engagement score)
// 6. Send follow-up email
// 7. Auto-generate PandaDocs proposal if warranted

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  fetchTranscript,
  matchTldvMeetingToCrm,
  type TldvWebhookPayload,
} from "@/lib/integrations/tldv";
import { processTranscript } from "@/lib/ai/meeting-lifecycle";

export async function POST(request: NextRequest) {
  // Verify webhook signature
  const { verifyTldvWebhook } = await import("@/lib/webhook-verify");
  if (!(await verifyTldvWebhook(request))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: TldvWebhookPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  console.log(`[tldv-webhook] Received event: ${payload.event} for meeting ${payload.data?.meetingId}`);

  // Only process TranscriptReady events
  if (payload.event !== "TranscriptReady") {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const tldvMeetingId = payload.data?.meetingId;
  if (!tldvMeetingId) {
    return NextResponse.json({ error: "Missing meetingId" }, { status: 400 });
  }

  try {
    // 1. Match tl;dv meeting to CRM meeting
    const crmMeetingId = await matchTldvMeetingToCrm(tldvMeetingId);
    if (!crmMeetingId) {
      console.warn(`[tldv-webhook] Could not match tl;dv meeting ${tldvMeetingId} to any CRM meeting`);
      // Still store the transcript as an unmatched event
      await prisma.rawEventLog.create({
        data: {
          source: "tldv",
          eventType: "transcript_unmatched",
          rawPayload: JSON.stringify(payload),
          processed: false,
        },
      });
      return NextResponse.json({ ok: true, matched: false });
    }

    // 2. Fetch full transcript from tl;dv API
    let transcriptText: string;

    // Check if transcript is in the webhook payload itself
    if (payload.data?.data?.transcript) {
      transcriptText = payload.data.data.transcript;
    } else if (payload.data?.data?.segments) {
      transcriptText = payload.data.data.segments
        .map((s) => (s.speaker ? `${s.speaker}: ${s.text}` : s.text))
        .join("\n");
    } else {
      // Fetch from API
      const transcript = await fetchTranscript(tldvMeetingId);
      transcriptText = transcript.text;
    }

    if (!transcriptText || transcriptText.trim().length < 50) {
      console.warn(`[tldv-webhook] Transcript too short for meeting ${tldvMeetingId}, skipping analysis`);
      return NextResponse.json({ ok: true, skipped: true, reason: "transcript_too_short" });
    }

    // 3. Store transcript
    await prisma.meetingTranscript.upsert({
      where: { meetingId: crmMeetingId },
      create: {
        meetingId: crmMeetingId,
        source: "tldv",
        rawTranscript: transcriptText,
      },
      update: {
        rawTranscript: transcriptText,
        source: "tldv",
      },
    });

    // 4. Trigger the full post-meeting automation chain (async — don't block webhook response)
    // Run in background so tl;dv doesn't timeout waiting for our response
    processTranscript(crmMeetingId).catch((err) => {
      console.error(`[tldv-webhook] Transcript processing failed for meeting ${crmMeetingId}:`, err);
    });

    // Log the event
    await prisma.rawEventLog.create({
      data: {
        source: "tldv",
        eventType: "transcript_received",
        rawPayload: JSON.stringify({ tldvMeetingId, crmMeetingId, transcriptLength: transcriptText.length }),
        processed: true,
        processedAt: new Date(),
      },
    });

    return NextResponse.json({ ok: true, matched: true, meetingId: crmMeetingId });
  } catch (err) {
    console.error(`[tldv-webhook] Error processing transcript:`, err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
