"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Campaign } from "@/types";

const statusVariant: Record<string, "default" | "success" | "warning" | "secondary"> = {
  draft: "secondary",
  active: "success",
  paused: "warning",
  completed: "default",
};

const typeLabels: Record<string, string> = {
  email: "Email",
  social: "Social",
  ads: "Ads",
  content: "Content",
};

interface CampaignCardProps {
  campaign: Campaign;
}

export function CampaignCard({ campaign }: CampaignCardProps) {
  const metrics = campaign.metrics
    ? (JSON.parse(campaign.metrics) as {
        sent?: number;
        opened?: number;
        clicked?: number;
        converted?: number;
      })
    : null;

  return (
    <Link href={`/marketing/campaigns/${campaign.id}`}>
      <Card className="transition-shadow hover:shadow-md">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <CardTitle className="text-base">{campaign.name}</CardTitle>
            <Badge variant={statusVariant[campaign.status] || "secondary"}>
              {campaign.status}
            </Badge>
          </div>
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <Badge variant="outline" className="text-xs">
              {typeLabels[campaign.type] || campaign.type}
            </Badge>
            {campaign.budget != null && (
              <span>{formatCurrency(campaign.budget)}</span>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {metrics && (
            <div className="grid grid-cols-4 gap-2 text-center">
              <div>
                <p className="text-lg font-semibold">{metrics.sent ?? 0}</p>
                <p className="text-xs text-zinc-500">Sent</p>
              </div>
              <div>
                <p className="text-lg font-semibold">{metrics.opened ?? 0}</p>
                <p className="text-xs text-zinc-500">Opened</p>
              </div>
              <div>
                <p className="text-lg font-semibold">{metrics.clicked ?? 0}</p>
                <p className="text-xs text-zinc-500">Clicked</p>
              </div>
              <div>
                <p className="text-lg font-semibold">{metrics.converted ?? 0}</p>
                <p className="text-xs text-zinc-500">Converted</p>
              </div>
            </div>
          )}
          {!metrics && (
            <p className="text-sm text-zinc-400">No metrics yet</p>
          )}
          <div className="mt-3 flex items-center justify-between text-xs text-zinc-400">
            {campaign.startDate && (
              <span>Starts {formatDate(campaign.startDate)}</span>
            )}
            {campaign.endDate && (
              <span>Ends {formatDate(campaign.endDate)}</span>
            )}
            {!campaign.startDate && !campaign.endDate && (
              <span>Created {formatDate(campaign.createdAt)}</span>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
