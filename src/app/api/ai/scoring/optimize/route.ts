import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { runAIJob } from "@/lib/ai/job-runner";

export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Gather current rules
    const rules = await prisma.leadScoreRule.findMany({
      orderBy: { category: "asc" },
    });

    // Gather conversion data for context
    const [totalContacts, convertedContacts, deals] = await Promise.all([
      prisma.contact.count(),
      prisma.contact.count({
        where: { lifecycleStage: { in: ["opportunity", "customer"] } },
      }),
      prisma.deal.findMany({
        where: { stage: "closed_won" },
        select: { contactId: true },
        take: 100,
      }),
    ]);

    // Get score distribution
    const contacts = await prisma.contact.findMany({
      select: {
        leadScore: true,
        lifecycleStage: true,
        leadStatus: true,
        jobTitle: true,
        source: true,
      },
      take: 200,
    });

    const input = {
      currentRules: rules.map((r) => ({
        id: r.id,
        name: r.name,
        category: r.category,
        condition: r.condition,
        points: r.points,
        isActive: r.isActive,
      })),
      conversionMetrics: {
        totalContacts,
        convertedContacts,
        conversionRate:
          totalContacts > 0
            ? ((convertedContacts / totalContacts) * 100).toFixed(1)
            : "0",
        closedWonDeals: deals.length,
      },
      scoreDistribution: {
        highScore: contacts.filter((c) => c.leadScore >= 70).length,
        mediumScore: contacts.filter(
          (c) => c.leadScore >= 40 && c.leadScore < 70
        ).length,
        lowScore: contacts.filter((c) => c.leadScore < 40).length,
      },
      sampleContacts: contacts.slice(0, 20),
      instructions:
        "Analyze the current scoring rules and conversion data. Suggest point adjustments to better predict conversions. Return an array of suggestions with ruleId, suggestedPoints, and reasoning.",
    };

    const result = await runAIJob("lead_scorer", "optimize_scoring", input);

    const suggestions = (
      result.output as {
        suggestions: {
          ruleId: string;
          suggestedPoints: number;
          reasoning: string;
        }[];
      }
    ).suggestions;

    // Apply AI suggestions to AI-managed rules
    if (suggestions && Array.isArray(suggestions)) {
      for (const suggestion of suggestions) {
        if (!suggestion.ruleId) continue;
        const rule = rules.find((r) => r.id === suggestion.ruleId);
        if (rule?.isAIManaged && suggestion.suggestedPoints !== undefined) {
          await prisma.leadScoreRule.update({
            where: { id: suggestion.ruleId },
            data: { points: suggestion.suggestedPoints },
          });
        }
      }
    }

    return NextResponse.json({
      data: {
        suggestions: suggestions || [],
        rulesAnalyzed: rules.length,
        autoApplied: suggestions?.filter((s) => {
          const rule = rules.find((r) => r.id === s.ruleId);
          return rule?.isAIManaged;
        }).length || 0,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to optimize scoring",
      },
      { status: 500 }
    );
  }
}
