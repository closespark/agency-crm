import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { instantly } from "@/lib/integrations/instantly";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { campaignId } = body as { campaignId?: string };

  try {
    // If campaignId provided, sync just that one. Otherwise sync all.
    const campaigns = campaignId
      ? await prisma.instantlyCampaign.findMany({
          where: { id: campaignId },
        })
      : await prisma.instantlyCampaign.findMany({
          where: { instantlyId: { not: null } },
        });

    if (campaigns.length === 0) {
      return NextResponse.json(
        { error: "No campaigns found to sync" },
        { status: 404 }
      );
    }

    const results: Array<{
      id: string;
      name: string;
      metrics: Record<string, number>;
      synced: boolean;
      error?: string;
    }> = [];

    for (const campaign of campaigns) {
      if (!campaign.instantlyId) {
        results.push({
          id: campaign.id,
          name: campaign.name,
          metrics: {},
          synced: false,
          error: "No Instantly ID linked",
        });
        continue;
      }

      try {
        const analytics = await instantly.campaigns.analytics(
          campaign.instantlyId
        );

        // V2 analytics returns a nested structure grouped by account + date.
        // Aggregate into a flat summary for local storage.
        let sent = 0, opened = 0, replied = 0, bounced = 0;
        for (const accountData of Object.values(analytics)) {
          if (typeof accountData === "object" && accountData !== null) {
            for (const dayData of Object.values(accountData as Record<string, Record<string, number>>)) {
              if (typeof dayData === "object" && dayData !== null) {
                sent += (dayData as Record<string, number>).sent || 0;
                opened += (dayData as Record<string, number>).opened || 0;
                replied += (dayData as Record<string, number>).replied || 0;
                bounced += (dayData as Record<string, number>).bounced || 0;
              }
            }
          }
        }

        const metrics = { sent, opened, replied, bounced };

        await prisma.instantlyCampaign.update({
          where: { id: campaign.id },
          data: {
            metrics: JSON.stringify(metrics),
            syncedAt: new Date(),
          },
        });

        results.push({
          id: campaign.id,
          name: campaign.name,
          metrics,
          synced: true,
        });
      } catch (error) {
        results.push({
          id: campaign.id,
          name: campaign.name,
          metrics: {},
          synced: false,
          error: error instanceof Error ? error.message : "Sync failed",
        });
      }
    }

    return NextResponse.json({
      data: {
        synced: results.filter((r) => r.synced).length,
        failed: results.filter((r) => !r.synced).length,
        results,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: `Sync failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      },
      { status: 500 }
    );
  }
}
