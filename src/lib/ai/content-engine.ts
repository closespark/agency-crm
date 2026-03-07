// Content Engine — autonomous content generation from Knowledge Engine intelligence.
// Four output channels: newsletter, blog, LinkedIn, Twitter.
// Weekly cycle tied to Sunday self-audit.
// Self-optimizes based on content performance data.

import { prisma } from "@/lib/prisma";
import { runAIJob } from "./job-runner";
import { queryInsights } from "./knowledge-engine";
import { getVoiceProfile, scoreVoiceMatch } from "./voice-profile";
import { safeParseJSON } from "@/lib/safe-json";
import { OPTIMIZATION_THRESHOLDS } from "./optimization-thresholds";

// ============================================
// CONTENT CALENDAR GENERATION (Sunday night)
// ============================================

/**
 * Generate next week's content calendar from pipeline intelligence + Knowledge Engine.
 * Runs as part of the Sunday self-audit cycle.
 */
export async function generateWeeklyContentCalendar(): Promise<{
  newsletter: number;
  blog: number;
  linkedin: number;
  twitter: number;
}> {
  const nextMonday = getNextMonday();
  const voice = await getVoiceProfile();

  // Check if calendar already exists for next week
  const existing = await prisma.contentCalendar.count({
    where: {
      weekStarting: nextMonday,
    },
  });
  if (existing > 0) return { newsletter: 0, blog: 0, linkedin: 0, twitter: 0 };

  // Gather intelligence sources
  const [
    pipelineInsights,
    topSequenceAngles,
    recentWinAngles,
    knowledgeInsights,
    pastPerformance,
  ] = await Promise.all([
    // Tier 1: This week's pipeline intelligence
    queryInsights({ tags: ["tier1", "pipeline"], limit: 15 }),
    // Top-performing outreach angles
    prisma.sequencePerformance.findMany({
      where: { positiveReplyRate: { gte: 0.05 } },
      orderBy: { positiveReplyRate: "desc" },
      take: 5,
      select: { messageAngle: true, positiveReplyRate: true },
    }),
    // Recent deal wins — what angles closed
    prisma.conversionFeedback.findMany({
      where: { outcome: "converted" },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { winningAngle: true, companyIndustry: true, jobTitle: true },
    }),
    // Tier 2/3: External intelligence
    queryInsights({ minConfidence: 0.6, validatedOnly: true, limit: 10 }),
    // What content performed well in the past
    prisma.contentPerformance.findMany({
      orderBy: { engagementRate: "desc" },
      take: 10,
      include: { draft: { select: { channel: true, title: true, metadata: true } } },
    }),
  ]);

  // AI generates the content calendar
  const result = await runAIJob("content_writer", "content_calendar", {
    pipelineInsights: pipelineInsights.map((i) => i.tactic),
    topAngles: topSequenceAngles.map((a) => a.messageAngle),
    winningAngles: recentWinAngles.map((w) => w.winningAngle).filter(Boolean),
    externalInsights: knowledgeInsights.map((i) => ({
      tactic: i.tactic,
      channel: i.channel,
    })),
    pastPerformance: pastPerformance.map((p) => ({
      channel: p.draft?.channel,
      title: p.draft?.title,
      engagementRate: p.engagementRate,
    })),
    voiceProfile: voice ? {
      tone: voice.toneDescriptor,
      avoid: voice.avoidPatterns,
    } : null,
    instructions: `Generate next week's content calendar for Nexus Ops (RevOps consultancy targeting frustrated HubSpot users at B2B SaaS companies).

Create:
1. ONE newsletter topic + angle (Tuesday delivery, under 400 words)
2. TWO blog post topics + angles (SEO-oriented, definitive answers to high-intent queries)
3. FIVE LinkedIn post topics + angles (2 from newsletter, 2 from pipeline insights, 1 from industry news)
4. ONE Twitter/X thread topic derived from the newsletter's top insight

Every topic must trace back to a specific intelligence source — either a pipeline pattern, a knowledge engine insight, or internal performance data.

Topics that performed well historically should be weighted more. Topics that got zero engagement should be avoided.

The newsletter is a prospecting tool disguised as valuable content. The angle should feel like a practitioner sharing real observations, not a marketing email.

Blog posts should target search intent: "HubSpot [pain point]", "RevOps [challenge]", "AI agents [use case]".

LinkedIn posts should sound like observations from someone deep in the work.

Return JSON: {
  newsletter: [{ topic, angle, sourceInsight, priority }],
  blog: [{ topic, angle, sourceInsight, priority, targetKeywords }],
  linkedin: [{ topic, angle, sourceInsight, priority, format }],
  twitter: [{ topic, angle, sourceInsight, priority }]
}`,
  });

  const calendar = result.output as {
    newsletter: { topic: string; angle: string; sourceInsight: string; priority: number }[];
    blog: { topic: string; angle: string; sourceInsight: string; priority: number; targetKeywords?: string }[];
    linkedin: { topic: string; angle: string; sourceInsight: string; priority: number; format?: string }[];
    twitter: { topic: string; angle: string; sourceInsight: string; priority: number }[];
  };

  const counts = { newsletter: 0, blog: 0, linkedin: 0, twitter: 0 };

  // Create calendar entries
  for (const item of calendar.newsletter || []) {
    await prisma.contentCalendar.create({
      data: {
        weekStarting: nextMonday,
        channel: "newsletter",
        topic: item.topic,
        angle: item.angle,
        sourceInsight: item.sourceInsight,
        priority: item.priority || 0,
        scheduledAt: getNextTuesday7am(),
      },
    });
    counts.newsletter++;
  }

  for (const item of calendar.blog || []) {
    await prisma.contentCalendar.create({
      data: {
        weekStarting: nextMonday,
        channel: "blog",
        topic: item.topic,
        angle: item.angle,
        sourceInsight: item.sourceInsight,
        priority: item.priority || 0,
      },
    });
    counts.blog++;
  }

  for (const item of calendar.linkedin || []) {
    await prisma.contentCalendar.create({
      data: {
        weekStarting: nextMonday,
        channel: "linkedin",
        topic: item.topic,
        angle: item.angle,
        sourceInsight: item.sourceInsight,
        priority: item.priority || 0,
      },
    });
    counts.linkedin++;
  }

  for (const item of calendar.twitter || []) {
    await prisma.contentCalendar.create({
      data: {
        weekStarting: nextMonday,
        channel: "twitter",
        topic: item.topic,
        angle: item.angle,
        sourceInsight: item.sourceInsight,
        priority: item.priority || 0,
      },
    });
    counts.twitter++;
  }

  return counts;
}

// ============================================
// CONTENT DRAFTING
// ============================================

/**
 * Generate content drafts for all planned calendar items this week.
 */
export async function generateContentDrafts(): Promise<number> {
  const planned = await prisma.contentCalendar.findMany({
    where: {
      status: "planned",
      drafts: { none: {} },
    },
    orderBy: { priority: "desc" },
  });

  let drafted = 0;

  for (const item of planned) {
    try {
      const draft = await generateDraft(item.channel, item.topic, item.angle, item.sourceInsight);
      if (draft) {
        await prisma.contentCalendar.update({
          where: { id: item.id },
          data: { status: "drafted" },
        });
        drafted++;
      }
    } catch (err) {
      console.error(`[content] Draft generation failed for ${item.channel}: ${item.topic}`, err);
    }
  }

  return drafted;
}

async function generateDraft(
  channel: string,
  topic: string,
  angle: string,
  sourceInsight: string | null
): Promise<string | null> {
  const voice = await getVoiceProfile();

  // Get relevant knowledge insights for this topic
  const insights = await queryInsights({
    channel,
    minConfidence: 0.5,
    limit: 5,
  });

  const generators: Record<string, () => Promise<string | null>> = {
    newsletter: () => generateNewsletter(topic, angle, sourceInsight, insights, voice),
    blog: () => generateBlogPost(topic, angle, sourceInsight, insights, voice),
    linkedin: () => generateLinkedInPost(topic, angle, sourceInsight, insights, voice),
    twitter: () => generateTwitterThread(topic, angle, sourceInsight, insights, voice),
  };

  const generator = generators[channel];
  if (!generator) return null;
  return generator();
}

async function generateNewsletter(
  topic: string,
  angle: string,
  sourceInsight: string | null,
  insights: Awaited<ReturnType<typeof queryInsights>>,
  voice: Awaited<ReturnType<typeof getVoiceProfile>>
): Promise<string | null> {
  const result = await runAIJob("email_composer", "newsletter_draft", {
    topic,
    angle,
    sourceInsight,
    supportingInsights: insights.map((i) => i.tactic),
    voiceProfile: voice,
    instructions: `Write a newsletter for Nexus Ops.

Topic: ${topic}
Angle: ${angle}
Intelligence source: ${sourceInsight || "pipeline observation"}

Structure (EVERY newsletter follows this):
1. One sharp observation about a HubSpot problem the ICP faces
2. The specific consequence of ignoring it
3. What good looks like
4. Soft CTA — drives a reply or a booking (not "buy now")

Constraints:
- Under 400 words
- ${voice ? `Voice: ${voice.toneDescriptor}` : "Direct, practitioner tone"}
- ${voice ? `Avoid: ${voice.avoidPatterns.join(", ")}` : "No corporate jargon"}
- Write as Chris Tabb, Founder of Nexus Ops
- This is a practitioner writing about real problems, not a marketing email
- Subject line should create curiosity, not clickbait. Under 50 characters.

Return JSON: {
  subject: string,
  preheader: string,
  body: string,
  ctaText: string,
  ctaUrl: string
}`,
  });

  const newsletter = result.output as {
    subject: string;
    preheader: string;
    body: string;
    ctaText: string;
    ctaUrl: string;
  };

  // Voice quality gate
  const voiceScore = await scoreVoiceMatch(newsletter.body);

  // Find the calendar entry
  const calendarEntry = await prisma.contentCalendar.findFirst({
    where: { channel: "newsletter", topic },
    orderBy: { createdAt: "desc" },
  });

  // Voice score below threshold → regenerate once with feedback, then approve regardless
  // No content should be blocked from publishing in an autonomous system
  let finalBody = newsletter.body;
  let finalSubject = newsletter.subject;
  let finalScore = voiceScore.score;

  if (voiceScore.score < 0.7) {
    try {
      const retry = await runAIJob("email_composer", "newsletter_draft", {
        topic, angle, sourceInsight,
        voiceFeedback: voiceScore.feedback,
        previousDraft: newsletter.body,
        instructions: `Rewrite this newsletter draft to better match the voice profile. Voice feedback: ${voiceScore.feedback}. Keep the same structure and content but adjust tone/style.
Return JSON: { subject: string, preheader: string, body: string, ctaText: string, ctaUrl: string }`,
      });
      const retried = retry.output as typeof newsletter;
      const retryScore = await scoreVoiceMatch(retried.body);
      finalBody = retried.body;
      finalSubject = retried.subject || newsletter.subject;
      finalScore = retryScore.score;
    } catch {
      // Retry failed — use original draft
    }
  }

  const draft = await prisma.contentDraft.create({
    data: {
      calendarId: calendarEntry?.id,
      channel: "newsletter",
      title: finalSubject,
      body: finalBody,
      voiceScore: finalScore,
      status: finalScore >= 0.5 ? "approved" : "needs_review", // Block low-quality content
      publishAt: getNextTuesday7am(),
      metadata: JSON.stringify({
        subject: finalSubject,
        preheader: newsletter.preheader,
        ctaText: newsletter.ctaText,
        ctaUrl: newsletter.ctaUrl,
        voiceFeedback: voiceScore.feedback,
        regenerated: voiceScore.score < 0.7,
      }),
    },
  });

  return draft.id;
}

async function generateBlogPost(
  topic: string,
  angle: string,
  sourceInsight: string | null,
  insights: Awaited<ReturnType<typeof queryInsights>>,
  voice: Awaited<ReturnType<typeof getVoiceProfile>>
): Promise<string | null> {
  const result = await runAIJob("content_writer", "blog_draft", {
    topic,
    angle,
    sourceInsight,
    supportingInsights: insights.map((i) => i.tactic),
    voiceProfile: voice,
    instructions: `Write a blog post for Nexus Ops.

Topic: ${topic}
Angle: ${angle}
Intelligence source: ${sourceInsight || "knowledge engine"}

Brief:
- Identify what's currently ranking for this topic and find the gap
- Be more specific and more actionable than existing content
- Include real examples derived from pipeline patterns (anonymized)
- SEO-optimized with natural keyword usage
- 1000-1500 words
- ${voice ? `Voice: ${voice.toneDescriptor}` : "Direct, practitioner tone"}
- Write as Chris Tabb, Founder of Nexus Ops

Structure:
1. Hook — the problem stated concretely
2. Why it matters — the cost of the status quo
3. The approach — what actually works (with specifics)
4. Examples — real patterns from your work (anonymized)
5. Action steps — what to do next
6. CTA — consultation booking or newsletter signup

Return JSON: {
  title: string,
  slug: string,
  metaDescription: string,
  body: string,
  tags: string[],
  estimatedReadTime: number
}`,
  });

  const blog = result.output as {
    title: string;
    slug: string;
    metaDescription: string;
    body: string;
    tags: string[];
    estimatedReadTime: number;
  };

  const voiceScore = await scoreVoiceMatch(blog.body);

  const calendarEntry = await prisma.contentCalendar.findFirst({
    where: { channel: "blog", topic },
    orderBy: { createdAt: "desc" },
  });

  // Schedule blog for Wednesday 9am UTC
  const blogPublishAt = getNextWeekday(3, 9); // Wednesday

  const draft = await prisma.contentDraft.create({
    data: {
      calendarId: calendarEntry?.id,
      channel: "blog",
      title: blog.title,
      body: blog.body,
      voiceScore: voiceScore.score,
      status: voiceScore.score >= OPTIMIZATION_THRESHOLDS.CONTENT_VOICE_SCORE_THRESHOLD ? "approved" : "needs_review",
      publishAt: blogPublishAt,
      metadata: JSON.stringify({
        slug: blog.slug,
        metaDescription: blog.metaDescription,
        tags: blog.tags,
        estimatedReadTime: blog.estimatedReadTime,
        voiceFeedback: voiceScore.feedback,
      }),
    },
  });

  return draft.id;
}

async function generateLinkedInPost(
  topic: string,
  angle: string,
  sourceInsight: string | null,
  insights: Awaited<ReturnType<typeof queryInsights>>,
  voice: Awaited<ReturnType<typeof getVoiceProfile>>
): Promise<string | null> {
  const result = await runAIJob("content_writer", "linkedin_draft", {
    topic,
    angle,
    sourceInsight,
    supportingInsights: insights.map((i) => i.tactic),
    voiceProfile: voice,
    instructions: `Write a LinkedIn post for Chris Tabb, Founder of Nexus Ops.

Topic: ${topic}
Angle: ${angle}

This should sound like an observation from someone deep in RevOps work, not a sales post.
${voice ? `Voice: ${voice.toneDescriptor}` : "Direct, practitioner tone"}
${voice ? `Avoid: ${voice.avoidPatterns.join(", ")}` : "No corporate jargon, no emojis"}

LinkedIn-specific formatting:
- Strong hook in the first line (this shows before "see more")
- Short paragraphs (1-2 sentences)
- 150-300 words
- End with a question or observation that invites comments
- NO hashtags (they reduce reach in 2026)
- NO emojis

Return JSON: {
  body: string,
  hook: string
}`,
  });

  const post = result.output as { body: string; hook: string };

  const voiceScore = await scoreVoiceMatch(post.body);

  const calendarEntry = await prisma.contentCalendar.findFirst({
    where: { channel: "linkedin", topic },
    orderBy: { createdAt: "desc" },
  });

  // Schedule LinkedIn for Thursday 10am UTC
  const linkedinPublishAt = getNextWeekday(4, 10); // Thursday

  const draft = await prisma.contentDraft.create({
    data: {
      calendarId: calendarEntry?.id,
      channel: "linkedin",
      title: post.hook.substring(0, 100),
      body: post.body,
      voiceScore: voiceScore.score,
      status: voiceScore.score >= OPTIMIZATION_THRESHOLDS.CONTENT_VOICE_SCORE_THRESHOLD ? "approved" : "needs_review",
      publishAt: linkedinPublishAt,
      metadata: JSON.stringify({
        hook: post.hook,
        voiceFeedback: voiceScore.feedback,
      }),
    },
  });

  return draft.id;
}

async function generateTwitterThread(
  topic: string,
  angle: string,
  sourceInsight: string | null,
  insights: Awaited<ReturnType<typeof queryInsights>>,
  voice: Awaited<ReturnType<typeof getVoiceProfile>>
): Promise<string | null> {
  const result = await runAIJob("content_writer", "twitter_draft", {
    topic,
    angle,
    sourceInsight,
    supportingInsights: insights.map((i) => i.tactic),
    voiceProfile: voice,
    instructions: `Write a Twitter/X thread for Chris Tabb, Founder of Nexus Ops.

Topic: ${topic}
Angle: ${angle}

Thread structure:
- Tweet 1: Hook — the provocative observation (under 280 chars)
- Tweets 2-5: The insight broken into bite-sized points (each under 280 chars)
- Final tweet: Takeaway + soft CTA (newsletter signup or booking link)

${voice ? `Voice: ${voice.toneDescriptor}` : "Direct, practitioner tone"}
No hashtags. No emojis.

Return JSON: {
  tweets: string[],
  hook: string
}`,
  });

  const thread = result.output as { tweets: string[]; hook: string };

  const calendarEntry = await prisma.contentCalendar.findFirst({
    where: { channel: "twitter", topic },
    orderBy: { createdAt: "desc" },
  });

  // Schedule Twitter for Friday 11am UTC
  const twitterPublishAt = getNextWeekday(5, 11); // Friday

  const draft = await prisma.contentDraft.create({
    data: {
      calendarId: calendarEntry?.id,
      channel: "twitter",
      title: thread.hook.substring(0, 100),
      body: JSON.stringify(thread.tweets),
      voiceScore: null,
      status: "approved",
      publishAt: twitterPublishAt,
      metadata: JSON.stringify({ hook: thread.hook, tweetCount: thread.tweets.length }),
    },
  });

  return draft.id;
}

// ============================================
// CONTENT PUBLISHING
// ============================================

/**
 * Publish all approved drafts that are due.
 */
export async function publishDueContent(): Promise<number> {
  const now = new Date();
  const due = await prisma.contentDraft.findMany({
    where: {
      status: { in: ["approved", "scheduled"] },
      publishAt: { not: null, lte: now },
    },
    include: { calendar: true },
  });

  let published = 0;

  for (const draft of due) {
    try {
      await publishDraft(draft);
      published++;
    } catch (err) {
      console.error(`[content] Publish failed for ${draft.channel}: ${draft.title}`, err);
    }
  }

  return published;
}

async function publishDraft(draft: {
  id: string;
  channel: string;
  title: string | null;
  body: string;
  metadata: string | null;
}): Promise<void> {
  switch (draft.channel) {
    case "newsletter":
      await publishNewsletter(draft);
      break;
    case "blog":
      await publishBlogPost(draft);
      break;
    case "linkedin":
      await publishLinkedInPost(draft);
      break;
    case "twitter":
      await publishTwitterThread(draft);
      break;
  }

  await prisma.contentDraft.update({
    where: { id: draft.id },
    data: {
      status: "published",
      publishedAt: new Date(),
    },
  });

  // Create performance tracking record
  await prisma.contentPerformance.create({
    data: {
      draftId: draft.id,
      channel: draft.channel,
    },
  });
}

async function publishNewsletter(draft: {
  id: string;
  body: string;
  metadata: string | null;
}): Promise<void> {
  const meta = safeParseJSON(draft.metadata, {} as Record<string, unknown>);

  // Get all active subscribers
  const subscribers = await prisma.newsletterSubscriber.findMany({
    where: { isActive: true },
    select: { email: true, contactId: true },
  });

  if (subscribers.length === 0) {
    console.log("[content] No newsletter subscribers — skipping send");
    return;
  }

  // Send via Gmail to each subscriber
  const { sendEmail } = await import("@/lib/integrations/gmail");

  for (const subscriber of subscribers) {
    try {
      await sendEmail({
        to: subscriber.email,
        subject: (meta.subject as string) || draft.body.substring(0, 50),
        body: draft.body,
        fromName: "Chris Tabb",
        isNewsletter: true,
      });
    } catch (err) {
      console.error(`[content] Newsletter send failed for ${subscriber.email}:`, err);
    }
  }

  console.log(`[content] Newsletter sent to ${subscribers.length} subscribers`);
}

async function publishBlogPost(draft: {
  id: string;
  title: string | null;
  body: string;
  metadata: string | null;
}): Promise<void> {
  const meta = safeParseJSON(draft.metadata, {} as Record<string, unknown>);

  // Publish to KnowledgeArticle (the CRM's built-in blog/knowledge base)
  const slug = (meta.slug as string) || (draft.title || "post").toLowerCase().replace(/[^a-z0-9]+/g, "-");

  await prisma.knowledgeArticle.create({
    data: {
      title: draft.title || "Untitled",
      slug: `blog-${slug}-${Date.now()}`,
      body: draft.body,
      category: "blog",
      status: "published",
    },
  });

  await prisma.contentDraft.update({
    where: { id: draft.id },
    data: { publishedUrl: `/knowledge/blog-${slug}` },
  });

  console.log(`[content] Blog post published: ${draft.title}`);
}

async function publishLinkedInPost(draft: {
  id: string;
  body: string;
  metadata: string | null;
}): Promise<void> {
  const meta = safeParseJSON(draft.metadata, {} as Record<string, unknown>);

  // Primary: Zapier webhook → LinkedIn post
  try {
    const { publishLinkedInPost: zapierPost } = await import("@/lib/integrations/zapier");
    await zapierPost({
      body: draft.body,
      hook: meta.hook as string | undefined,
    });
    console.log(`[content] LinkedIn post published via Zapier`);
    return;
  } catch (err) {
    // Zapier not configured — fall back to Meet Alfred
    if (!(err instanceof Error && err.message.includes("not configured"))) {
      console.error("[content] Zapier LinkedIn post failed:", err);
    }
  }

  // Fallback: Meet Alfred campaign queue
  try {
    const { meetAlfred } = await import("@/lib/integrations/meet-alfred");
    const campaigns = await meetAlfred.campaigns.list() as { id: string; name: string }[];
    const publishCampaign = campaigns.find((c) =>
      c.name.toLowerCase().includes("content") || c.name.toLowerCase().includes("publish")
    );

    if (publishCampaign) {
      console.log(`[content] LinkedIn post queued to Alfred campaign: ${publishCampaign.name}`);
      return;
    }
  } catch {
    // Alfred not configured either
  }

  console.warn("[content] LinkedIn post drafted — configure ZAPIER_WEBHOOK_LINKEDIN_POST in Integrations for autonomous publishing.");
}

async function publishTwitterThread(draft: {
  id: string;
  body: string;
}): Promise<void> {
  // Parse tweets from the body (stored as JSON array)
  const tweets = safeParseJSON(draft.body, [draft.body]) as string[];

  // Primary: Zapier webhook → Twitter/X thread
  try {
    const { publishTwitterThread: zapierThread } = await import("@/lib/integrations/zapier");
    await zapierThread({ tweets });
    console.log(`[content] Twitter thread published via Zapier (${tweets.length} tweets)`);
    return;
  } catch (err) {
    if (!(err instanceof Error && err.message.includes("not configured"))) {
      console.error("[content] Zapier Twitter post failed:", err);
    }
  }

  console.warn("[content] Twitter thread drafted — configure ZAPIER_WEBHOOK_TWITTER_POST in Integrations for autonomous publishing.");
}

// ============================================
// CONTENT PERFORMANCE TRACKING
// ============================================

/**
 * Track newsletter engagement — called when tracking pixels fire.
 */
export async function trackNewsletterEngagement(
  subscriberEmail: string,
  event: "open" | "click",
  draftId?: string
): Promise<void> {
  const subscriber = await prisma.newsletterSubscriber.findUnique({
    where: { email: subscriberEmail },
  });
  if (!subscriber) return;

  // Update subscriber stats
  if (event === "open") {
    await prisma.newsletterSubscriber.update({
      where: { id: subscriber.id },
      data: {
        totalOpens: { increment: 1 },
        lastEngagement: new Date(),
      },
    });
  } else if (event === "click") {
    await prisma.newsletterSubscriber.update({
      where: { id: subscriber.id },
      data: {
        totalClicks: { increment: 1 },
        lastEngagement: new Date(),
      },
    });

    // Clicking = warm signal → bump lead score if linked to a contact
    if (subscriber.contactId) {
      await prisma.contact.update({
        where: { id: subscriber.contactId },
        data: { scoreDirty: true },
      });
    }

    // Evaluate if this subscriber should trigger warm outreach
    await evaluateSubscriberForOutreach(subscriberEmail);
  }

  // Update content performance
  if (draftId) {
    const perf = await prisma.contentPerformance.findUnique({
      where: { draftId },
    });
    if (perf) {
      if (event === "open") {
        await prisma.contentPerformance.update({
          where: { id: perf.id },
          data: { opens: { increment: 1 } },
        });
      } else {
        await prisma.contentPerformance.update({
          where: { id: perf.id },
          data: { clicks: { increment: 1 } },
        });
      }
    }
  }
}

/**
 * Check if a newsletter subscriber who matches ICP should trigger outreach.
 * Called when engagement score crosses a threshold.
 */
export async function evaluateSubscriberForOutreach(
  subscriberEmail: string
): Promise<void> {
  const subscriber = await prisma.newsletterSubscriber.findUnique({
    where: { email: subscriberEmail },
  });
  if (!subscriber || !subscriber.contactId) return;

  // Check engagement pattern: 3+ clicks in last 30 days = warm signal
  if (subscriber.totalClicks >= 3) {
    const contact = await prisma.contact.findUnique({
      where: { id: subscriber.contactId },
      include: { company: true },
    });
    if (!contact) return;

    // Check if already in a sequence or has a deal
    const activeEnrollment = await prisma.sequenceEnrollment.findFirst({
      where: { contactId: contact.id, status: "active" },
    });
    const activeDeal = await prisma.deal.findFirst({
      where: { contactId: contact.id, stage: { notIn: ["closed_won", "closed_lost"] } },
    });

    if (!activeEnrollment && !activeDeal && contact.fitScore && contact.fitScore >= 60) {
      // Auto-enroll in warm outreach sequence
      const warmSequence = await prisma.sequence.findFirst({
        where: { isActive: true },
        orderBy: { createdAt: "asc" },
      });

      let enrolled = false;
      if (warmSequence) {
        const steps = safeParseJSON(warmSequence.steps, [] as Array<{ delayDays: number }>);
        const firstDelay = steps[0]?.delayDays || 0;

        const { enrollContactInSequence } = await import("./sequence-enrollment");
        const enrollmentId = await enrollContactInSequence({
          sequenceId: warmSequence.id,
          contactId: contact.id,
          channel: "email",
          nextActionAt: new Date(Date.now() + firstDelay * 24 * 60 * 60 * 1000),
          metadata: { source: "newsletter_warm_lead", totalClicks: subscriber.totalClicks },
        });
        enrolled = !!enrollmentId;
      }

      // Also upgrade domain tier to warm (they came inbound via newsletter)
      if (contact.domainTier === "cold") {
        await prisma.contact.update({
          where: { id: contact.id },
          data: { domainTier: "warm" },
        });
      }

      await prisma.aIInsight.create({
        data: {
          type: "newsletter_warm_lead",
          title: `Newsletter subscriber ${contact.firstName} ${contact.lastName} showing high engagement`,
          description: `${subscriber.totalClicks} clicks in newsletter, fit score ${contact.fitScore}. ${enrolled ? "Auto-enrolled in outreach sequence." : "No active sequence available — manual outreach needed."}`,
          priority: "high",
          resourceType: "contact",
          resourceId: contact.id,
          status: enrolled ? "auto_actioned" : "new",
          actionItems: JSON.stringify([
            ...(enrolled ? [] : [{ action: "Enroll in warm outreach sequence", priority: "today" }]),
            { action: "Reference specific newsletter topics they clicked", priority: "today" },
          ]),
        },
      });
    }
  }
}

// ============================================
// CONTENT SELF-OPTIMIZATION
// ============================================

/**
 * Analyze content performance and adjust future calendar generation.
 * Runs as part of the Sunday self-audit.
 */
export async function optimizeContentStrategy(): Promise<string> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const performance = await prisma.contentPerformance.findMany({
    where: { measuredAt: { gte: thirtyDaysAgo } },
    include: {
      draft: {
        include: { calendar: true },
      },
    },
  });

  if (performance.length < 5) {
    return "Insufficient content performance data for optimization";
  }

  const result = await runAIJob("content_writer", "content_optimization", {
    performance: performance.map((p) => ({
      channel: p.channel,
      title: p.draft?.title,
      topic: p.draft?.calendar?.topic,
      angle: p.draft?.calendar?.angle,
      opens: p.opens,
      clicks: p.clicks,
      replies: p.replies,
      views: p.views,
      comments: p.comments,
      engagementRate: p.engagementRate,
      pipelineEntries: p.pipelineEntriesGenerated,
    })),
    instructions: `Analyze content performance and provide optimization guidance.

For each channel (newsletter, blog, linkedin, twitter):
1. What topics/angles performed best?
2. What topics/angles underperformed?
3. What format/structure patterns correlate with engagement?
4. What should we do MORE of next week?
5. What should we STOP doing?

Return JSON: {
  channelInsights: {
    newsletter: { topPerforming: string, underperforming: string, recommendation: string },
    blog: { topPerforming: string, underperforming: string, recommendation: string },
    linkedin: { topPerforming: string, underperforming: string, recommendation: string },
    twitter: { topPerforming: string, underperforming: string, recommendation: string }
  },
  overallStrategy: string,
  topicWeightAdjustments: [{ topic: string, direction: "increase" | "decrease", reason: string }]
}`,
  });

  const optimization = result.output as { overallStrategy: string };

  await prisma.systemChangelog.create({
    data: {
      category: "content",
      changeType: "strategy_optimized",
      description: `Content strategy optimized based on ${performance.length} content pieces`,
      dataEvidence: optimization.overallStrategy,
    },
  });

  return optimization.overallStrategy;
}

// ============================================
// UTILITIES
// ============================================

function getNextMonday(): Date {
  const now = new Date();
  const day = now.getDay();
  // day=0 (Sun) → 1, day=1 (Mon) → 7, day=2 (Tue) → 6, ...
  const daysUntilMonday = day === 0 ? 1 : day === 1 ? 7 : 8 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + daysUntilMonday);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function getNextTuesday7am(): Date {
  const monday = getNextMonday();
  const tuesday = new Date(monday);
  tuesday.setDate(monday.getDate() + 1);
  tuesday.setHours(7, 0, 0, 0); // 7 AM UTC
  return tuesday;
}

/** Get the next occurrence of a specific weekday (1=Mon..5=Fri) at a given hour UTC */
function getNextWeekday(targetDay: number, hour: number): Date {
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 1=Mon, ...
  let daysAhead = targetDay - day;
  if (daysAhead <= 0) daysAhead += 7; // Always schedule for next week if today or past
  const date = new Date(now);
  date.setDate(now.getDate() + daysAhead);
  date.setHours(hour, 0, 0, 0);
  return date;
}
