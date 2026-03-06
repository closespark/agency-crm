import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { instantly } from "@/lib/integrations/instantly";

export async function GET(request: NextRequest) {
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
    const searchParams = request.nextUrl.searchParams;
    const sync = searchParams.get("sync") !== "false"; // sync by default

    // Fetch from Instantly API and sync to local DB
    if (sync) {
      try {
        const apiCampaigns = await instantly.campaigns.list();

        for (const raw of apiCampaigns.items) {
          const campaign = raw as {
            id: string;
            name: string;
            status: string;
          };

          const existing = await prisma.instantlyCampaign.findFirst({
            where: { instantlyId: campaign.id },
          });

          if (existing) {
            await prisma.instantlyCampaign.update({
              where: { id: existing.id },
              data: {
                name: campaign.name,
                status: campaign.status || existing.status,
                syncedAt: new Date(),
              },
            });
          } else {
            await prisma.instantlyCampaign.create({
              data: {
                instantlyId: campaign.id,
                name: campaign.name,
                status: campaign.status || "draft",
                sequences: "[]",
                syncedAt: new Date(),
              },
            });
          }
        }
      } catch (syncError) {
        // Log sync error but still return local data
        console.error("Failed to sync from Instantly API:", syncError);
      }
    }

    // Return local DB campaigns
    const campaigns = await prisma.instantlyCampaign.findMany({
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ data: campaigns });
  } catch (error) {
    console.error("Error listing Instantly campaigns:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
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
    const body = await request.json();
    const { name, sendingAccountId, dailyLimit, sequences } = body;

    if (!name) {
      return NextResponse.json(
        { error: "Campaign name is required" },
        { status: 400 }
      );
    }

    // Create campaign in Instantly (v2: sending accounts are mapped separately)
    const apiResult = await instantly.campaigns.create({
      name,
    });

    // Create local record
    const campaign = await prisma.instantlyCampaign.create({
      data: {
        instantlyId: apiResult.id,
        name,
        sendingAccountId: sendingAccountId || null,
        dailyLimit: dailyLimit || 30,
        sequences: JSON.stringify(sequences || []),
        syncedAt: new Date(),
      },
    });

    return NextResponse.json({ data: campaign }, { status: 201 });
  } catch (error) {
    console.error("Error creating Instantly campaign:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
