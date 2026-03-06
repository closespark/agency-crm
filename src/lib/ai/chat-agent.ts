// Website Chat Agent — real-time conversational AI on the agency website.
// Qualifies visitors, answers questions, books meetings, captures leads, feeds CRM.
// Uses Conversation + Message models for persistence.

import { prisma } from "@/lib/prisma";
import { aiComplete, type AIMessage } from "./claude";
import { AGENT_CONFIGS } from "./agents";
import { safeParseJSON } from "@/lib/safe-json";

interface ChatInput {
  message: string;
  conversationId?: string;
  visitorId: string;
}

interface ChatAction {
  action: "book_meeting" | "capture_lead" | "notify_human";
  data?: Record<string, string>;
}

interface ChatResponse {
  reply: string;
  conversationId: string;
  actions: ChatAction[];
}

/**
 * Process an incoming chat message and return an AI response with full CRM context.
 */
export async function handleChatMessage(input: ChatInput): Promise<ChatResponse> {
  const { message, visitorId } = input;

  // 1. Resolve visitor to contact (if identified)
  const identity = await prisma.visitorIdentity.findUnique({
    where: { visitorId },
  });

  let contactId = identity?.contactId || null;
  let contactContext = "";

  if (contactId) {
    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
      include: {
        company: true,
        deals: { where: { stage: { notIn: ["closed_won", "closed_lost"] } }, take: 1 },
      },
    });

    if (contact) {
      contactContext = `\n\nKNOWN VISITOR:
- Name: ${contact.firstName} ${contact.lastName}
- Email: ${contact.email || "unknown"}
- Job Title: ${contact.jobTitle || "unknown"}
- Company: ${contact.company?.name || "unknown"}
- Lifecycle Stage: ${contact.lifecycleStage}
- Lead Score: ${contact.leadScore}/100
- BANT: Budget=${contact.bantBudget || "?"}, Authority=${contact.bantAuthority || "?"}, Need=${contact.bantNeed || "?"}, Timeline=${contact.bantTimeline || "?"}
${contact.deals[0] ? `- Active Deal: ${contact.deals[0].name} (${contact.deals[0].stage})` : "- No active deal"}`;
    }
  }

  // 2. Get recent page views for context
  const recentPages = await prisma.pageView.findMany({
    where: { visitorId },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { path: true, createdAt: true },
  });

  const pageContext = recentPages.length > 0
    ? `\n\nPAGES VISITED: ${recentPages.map((p) => p.path).join(", ")}`
    : "";

  // 3. Get or create conversation
  let conversationId = input.conversationId;

  if (conversationId) {
    // Verify conversation exists
    const existing = await prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    if (!existing) conversationId = undefined;
  }

  if (!conversationId) {
    const conversation = await prisma.conversation.create({
      data: {
        channel: "chat",
        status: "open",
        contactId: contactId || undefined,
        subject: "Website chat",
      },
    });
    conversationId = conversation.id;
  }

  // 4. Store the user's message
  await prisma.message.create({
    data: {
      conversationId,
      contactId: contactId || undefined,
      body: message,
      direction: "inbound",
    },
  });

  // 5. Load conversation history
  const history = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    take: 30, // Keep context reasonable
    select: { body: true, direction: true },
  });

  const aiMessages: AIMessage[] = history.map((m) => ({
    role: m.direction === "inbound" ? ("user" as const) : ("assistant" as const),
    content: m.body,
  }));

  // 6. Call Claude with full context
  const config = AGENT_CONFIGS.website_chat_agent;
  const systemPrompt = config.systemPrompt + contactContext + pageContext;

  const result = await aiComplete({
    system: systemPrompt,
    messages: aiMessages,
    model: config.model,
    temperature: config.temperature,
    maxTokens: 1024,
  });

  // 7. Extract actions from response (look for JSON blocks)
  const actions: ChatAction[] = [];
  let reply = result.text;

  // Extract action JSON if present
  const actionMatch = reply.match(/\{[\s\S]*?"action"\s*:\s*"(book_meeting|capture_lead|notify_human)"[\s\S]*?\}/g);
  if (actionMatch) {
    for (const match of actionMatch) {
      try {
        const parsed = safeParseJSON(match, null) as ChatAction | null;
        if (!parsed) continue;
        actions.push(parsed);
        // Remove the action JSON from the visible reply
        reply = reply.replace(match, "").trim();
      } catch {
        // Not valid JSON, leave it
      }
    }
  }

  // 8. Process actions
  for (const action of actions) {
    if (action.action === "capture_lead" && action.data?.email) {
      // Create or update contact
      const contact = await prisma.contact.upsert({
        where: { email: action.data.email },
        create: {
          firstName: action.data.name?.split(" ")[0] || "Unknown",
          lastName: action.data.name?.split(" ").slice(1).join(" ") || "",
          email: action.data.email,
          jobTitle: action.data.role || null,
          lifecycleStage: "lead",
          stageEnteredAt: new Date(),
          leadStatus: "new",
          source: "chat",
          engagementScore: 25,
          leadScore: 25,
          scoreDirty: true,
        },
        update: {
          engagementScore: { increment: 10 },
          scoreDirty: true,
        },
      });

      contactId = contact.id;

      // Link visitor identity
      await prisma.visitorIdentity.upsert({
        where: { visitorId },
        create: { visitorId, contactId: contact.id, identifiedBy: "chat" },
        update: { contactId: contact.id },
      });

      // Backfill page views
      await prisma.pageView.updateMany({
        where: { visitorId, contactId: null },
        data: { contactId: contact.id },
      });

      // Link conversation to contact
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { contactId: contact.id },
      });

      // Log activity
      const admin = await prisma.user.findFirst({ where: { role: "admin" } });
      if (admin) {
        await prisma.activity.create({
          data: {
            userId: admin.id,
            contactId: contact.id,
            type: "note",
            subject: "Lead captured via website chat",
            body: `Contact identified through chat conversation. Email: ${action.data.email}`,
          },
        });
      }

      // If company provided, link it
      if (action.data.company) {
        let company = await prisma.company.findFirst({
          where: { name: action.data.company },
        });
        if (!company) {
          company = await prisma.company.create({ data: { name: action.data.company } });
        }
        await prisma.contact.update({
          where: { id: contact.id },
          data: { companyId: company.id },
        });
      }
    }
  }

  // 9. Store the AI response
  await prisma.message.create({
    data: {
      conversationId,
      body: reply,
      direction: "outbound",
      isInternal: false,
    },
  });

  return { reply, conversationId, actions };
}
