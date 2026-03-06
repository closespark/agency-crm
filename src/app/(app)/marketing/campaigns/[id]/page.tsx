"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageLoader } from "@/components/ui/loading";
import { api } from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Campaign } from "@/types";

const statusVariant: Record<string, "default" | "success" | "warning" | "secondary"> = {
  draft: "secondary",
  active: "success",
  paused: "warning",
  completed: "default",
};

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchCampaign = useCallback(async () => {
    const res = await api.get<Campaign>(`/campaigns/${id}`);
    if (res.data) {
      setCampaign(res.data);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchCampaign();
  }, [fetchCampaign]);

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this campaign?")) return;
    await api.delete(`/campaigns/${id}`);
    router.push("/marketing/campaigns");
  };

  if (loading) return <PageLoader />;
  if (!campaign) {
    return (
      <div>
        <PageHeader title="Campaign not found" />
        <Link href="/marketing/campaigns">
          <Button variant="outline">Back to Campaigns</Button>
        </Link>
      </div>
    );
  }

  const metrics = campaign.metrics
    ? (JSON.parse(campaign.metrics) as {
        sent?: number;
        opened?: number;
        clicked?: number;
        converted?: number;
      })
    : null;

  const openRate =
    metrics && metrics.sent && metrics.opened
      ? ((metrics.opened / metrics.sent) * 100).toFixed(1)
      : null;
  const clickRate =
    metrics && metrics.sent && metrics.clicked
      ? ((metrics.clicked / metrics.sent) * 100).toFixed(1)
      : null;
  const conversionRate =
    metrics && metrics.sent && metrics.converted
      ? ((metrics.converted / metrics.sent) * 100).toFixed(1)
      : null;

  return (
    <div>
      <PageHeader
        title={campaign.name}
        actions={
          <div className="flex items-center gap-2">
            <Link href="/marketing/campaigns">
              <Button variant="outline">Back</Button>
            </Link>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Campaign Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-sm font-medium text-zinc-500">Status</dt>
                <dd className="mt-1">
                  <Badge variant={statusVariant[campaign.status] || "secondary"}>
                    {campaign.status}
                  </Badge>
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-zinc-500">Type</dt>
                <dd className="mt-1 text-sm capitalize">{campaign.type}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-zinc-500">Budget</dt>
                <dd className="mt-1 text-sm">
                  {campaign.budget != null
                    ? formatCurrency(campaign.budget)
                    : "Not set"}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-zinc-500">Created</dt>
                <dd className="mt-1 text-sm">
                  {formatDate(campaign.createdAt)}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-zinc-500">
                  Start Date
                </dt>
                <dd className="mt-1 text-sm">
                  {campaign.startDate
                    ? formatDate(campaign.startDate)
                    : "Not set"}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-zinc-500">End Date</dt>
                <dd className="mt-1 text-sm">
                  {campaign.endDate
                    ? formatDate(campaign.endDate)
                    : "Not set"}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Metrics</CardTitle>
          </CardHeader>
          <CardContent>
            {metrics ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-2xl font-bold">{metrics.sent ?? 0}</p>
                    <p className="text-xs text-zinc-500">Sent</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{metrics.opened ?? 0}</p>
                    <p className="text-xs text-zinc-500">Opened</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold">
                      {metrics.clicked ?? 0}
                    </p>
                    <p className="text-xs text-zinc-500">Clicked</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold">
                      {metrics.converted ?? 0}
                    </p>
                    <p className="text-xs text-zinc-500">Converted</p>
                  </div>
                </div>

                <div className="space-y-2 border-t border-zinc-200 pt-4 dark:border-zinc-700">
                  {openRate && (
                    <div className="flex justify-between text-sm">
                      <span className="text-zinc-500">Open Rate</span>
                      <span className="font-medium">{openRate}%</span>
                    </div>
                  )}
                  {clickRate && (
                    <div className="flex justify-between text-sm">
                      <span className="text-zinc-500">Click Rate</span>
                      <span className="font-medium">{clickRate}%</span>
                    </div>
                  )}
                  {conversionRate && (
                    <div className="flex justify-between text-sm">
                      <span className="text-zinc-500">Conversion Rate</span>
                      <span className="font-medium">{conversionRate}%</span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-zinc-400">No metrics available yet</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
