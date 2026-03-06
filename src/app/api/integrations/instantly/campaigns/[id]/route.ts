import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { instantly } from "@/lib/integrations/instantly";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.INSTANTLY_API_KEY) {
    return NextResponse.json(
      {
        error:
          "Instantly integration not configured. Set INSTANTLY_API_KEY in your environment variables.",
      },
      { status: 503 }
    );
  }

  try {
    const { id } = await params;

    const campaign = await prisma.instantlyCampaign.findUnique({
      where: { id },
    });

    if (!campaign) {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 }
      );
    }

    // Fetch fresh metrics from Instantly if we have an Instantly ID
    let metrics = campaign.metrics ? JSON.parse(campaign.metrics) : null;
    if (campaign.instantlyId) {
      try {
        const freshMetrics = await instantly.campaigns.analytics(
          campaign.instantlyId
        );
        metrics = freshMetrics;

        // Update local record with fresh metrics
        await prisma.instantlyCampaign.update({
          where: { id },
          data: {
            metrics: JSON.stringify(freshMetrics),
            syncedAt: new Date(),
          },
        });
      } catch (metricsError) {
        // Fall back to cached metrics
        console.error("Failed to fetch fresh metrics:", metricsError);
      }
    }

    return NextResponse.json({
      data: {
        ...campaign,
        metrics,
        sequences: campaign.sequences
          ? JSON.parse(campaign.sequences)
          : [],
        leads: campaign.leads ? JSON.parse(campaign.leads) : null,
      },
    });
  } catch (error) {
    console.error("Error fetching Instantly campaign:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.INSTANTLY_API_KEY) {
    return NextResponse.json(
      {
        error:
          "Instantly integration not configured. Set INSTANTLY_API_KEY in your environment variables.",
      },
      { status: 503 }
    );
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const { action } = body as { action: "launch" | "pause" | "sync" };

    if (!action || !["launch", "pause", "sync"].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action. Must be "launch", "pause", or "sync".' },
        { status: 400 }
      );
    }

    const campaign = await prisma.instantlyCampaign.findUnique({
      where: { id },
    });

    if (!campaign) {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 }
      );
    }

    if (!campaign.instantlyId) {
      return NextResponse.json(
        { error: "Campaign has no Instantly ID. It may not have been pushed to Instantly yet." },
        { status: 400 }
      );
    }

    switch (action) {
      case "launch": {
        await instantly.campaigns.activate(campaign.instantlyId);
        await prisma.instantlyCampaign.update({
          where: { id },
          data: { status: "active", syncedAt: new Date() },
        });
        return NextResponse.json({
          data: { status: "active", message: "Campaign launched" },
        });
      }

      case "pause": {
        await instantly.campaigns.pause(campaign.instantlyId);
        await prisma.instantlyCampaign.update({
          where: { id },
          data: { status: "paused", syncedAt: new Date() },
        });
        return NextResponse.json({
          data: { status: "paused", message: "Campaign paused" },
        });
      }

      case "sync": {
        const metrics = await instantly.campaigns.analytics(
          campaign.instantlyId
        );
        const apiCampaign = (await instantly.campaigns.get(
          campaign.instantlyId
        )) as { status?: string; name?: string };

        await prisma.instantlyCampaign.update({
          where: { id },
          data: {
            metrics: JSON.stringify(metrics),
            status: apiCampaign.status || campaign.status,
            syncedAt: new Date(),
          },
        });

        return NextResponse.json({
          data: {
            metrics,
            status: apiCampaign.status || campaign.status,
            message: "Campaign synced",
          },
        });
      }
    }
  } catch (error) {
    console.error("Error controlling Instantly campaign:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
