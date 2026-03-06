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
    // Gather CRM data patterns for context
    const [
      contactCount,
      dealCount,
      sequenceCount,
      workflowCount,
      recentActivities,
      stageDistribution,
    ] = await Promise.all([
      prisma.contact.count(),
      prisma.deal.count(),
      prisma.sequence.count(),
      prisma.workflow.count(),
      prisma.activity.findMany({
        select: { type: true },
        take: 500,
        orderBy: { createdAt: "desc" },
      }),
      prisma.contact.groupBy({
        by: ["lifecycleStage"],
        _count: true,
      }),
    ]);

    // Analyze activity patterns
    const activityTypes = recentActivities.reduce<Record<string, number>>(
      (acc, a) => {
        acc[a.type] = (acc[a.type] || 0) + 1;
        return acc;
      },
      {}
    );

    const existingWorkflows = await prisma.workflow.findMany({
      select: { name: true, trigger: true },
      take: 20,
    });

    const input = {
      crmStats: {
        contacts: contactCount,
        deals: dealCount,
        sequences: sequenceCount,
        existingWorkflows: workflowCount,
      },
      activityPatterns: activityTypes,
      stageDistribution: stageDistribution.map((s) => ({
        stage: s.lifecycleStage,
        count: s._count,
      })),
      existingWorkflows: existingWorkflows.map((w) => ({
        name: w.name,
        trigger: w.trigger,
      })),
      instructions: `Based on the CRM data, suggest 3-5 workflows that would be most impactful. Each suggestion should include:
- name: a descriptive workflow name
- description: what it does and why it's valuable
- trigger: { type, conditions } object
- actions: array of { type, config } objects

Supported trigger types: contact_created, contact_stage_changed, deal_stage_changed, email_replied, lead_score_threshold, form_submitted, meeting_booked, no_activity, sequence_completed.

Supported action types: send_email, enroll_in_sequence, update_lifecycle_stage, update_lead_status, create_task, create_deal, score_contact, send_notification, add_to_list, ai_analyze, webhook, wait.

Focus on automations that save time and improve conversion rates. Don't suggest workflows that already exist.`,
    };

    const result = await runAIJob(
      "lifecycle_manager",
      "suggest_workflows",
      input
    );

    return NextResponse.json({
      data: {
        suggestions: (result.output as { suggestions: unknown[] }).suggestions || result.output,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to generate suggestions",
      },
      { status: 500 }
    );
  }
}
