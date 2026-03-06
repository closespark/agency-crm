"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/loading";
import { api } from "@/lib/api";
import { formatDateTime, parseJSON } from "@/lib/utils";

interface InstantlyCampaignData {
  id: string;
  instantlyId: string | null;
  name: string;
  status: string;
  sendingAccountId: string | null;
  dailyLimit: number;
  sequences: string;
  leads: string | null;
  metrics: string | null;
  syncedAt: string | null;
  createdAt: string;
}

interface InstantlySyncProps {
  campaigns: InstantlyCampaignData[];
  onRefresh: () => void;
}

interface SyncResult {
  synced: number;
  failed: number;
  results: Array<{
    id: string;
    name: string;
    metrics: Record<string, number>;
    synced: boolean;
    error?: string;
  }>;
}

const statusVariants: Record<string, "default" | "success" | "warning" | "danger" | "secondary"> = {
  draft: "secondary",
  active: "success",
  paused: "warning",
  completed: "default",
};

export function InstantlySync({ campaigns, onRefresh }: InstantlySyncProps) {
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);

  async function handleSyncAll() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await api.post<SyncResult>("/sequences/instantly/sync", {});
      if (res.data) {
        setSyncResult(res.data);
        onRefresh();
      }
    } catch {
      // Error handled
    } finally {
      setSyncing(false);
    }
  }

  async function handleSyncOne(campaignId: string) {
    setSyncing(true);
    try {
      await api.post("/sequences/instantly/sync", { campaignId });
      onRefresh();
    } catch {
      // Error handled
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {campaigns.length} campaign{campaigns.length !== 1 ? "s" : ""} synced
          with Instantly
        </p>
        <Button onClick={handleSyncAll} disabled={syncing} variant="outline">
          {syncing ? (
            <>
              <Spinner size="sm" />
              Syncing...
            </>
          ) : (
            "Sync All Metrics"
          )}
        </Button>
      </div>

      {syncResult && (
        <div className="rounded-md bg-blue-50 p-3 text-sm dark:bg-blue-950">
          <p className="font-medium text-blue-800 dark:text-blue-200">
            Sync complete: {syncResult.synced} synced, {syncResult.failed} failed
          </p>
          {syncResult.results
            .filter((r) => !r.synced)
            .map((r) => (
              <p key={r.id} className="mt-1 text-xs text-red-600 dark:text-red-400">
                {r.name}: {r.error}
              </p>
            ))}
        </div>
      )}

      {campaigns.length === 0 ? (
        <div className="py-12 text-center text-sm text-zinc-500">
          No Instantly campaigns yet. Push a sequence to Instantly to get
          started.
        </div>
      ) : (
        <div className="grid gap-4">
          {campaigns.map((campaign) => {
            const metrics = parseJSON<Record<string, number>>(
              campaign.metrics,
              { sent: 0, opened: 0, replied: 0, bounced: 0 }
            );
            const leads = parseJSON<{ total: number }>(campaign.leads, {
              total: 0,
            });

            return (
              <Card key={campaign.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <CardTitle className="text-base">
                        {campaign.name}
                      </CardTitle>
                      <Badge
                        variant={
                          statusVariants[campaign.status] || "secondary"
                        }
                      >
                        {campaign.status}
                      </Badge>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSyncOne(campaign.id)}
                      disabled={syncing}
                    >
                      Sync
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-5 gap-4 text-center">
                    <div>
                      <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                        {leads.total}
                      </p>
                      <p className="text-xs text-zinc-500">Leads</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-blue-600">
                        {metrics.sent || 0}
                      </p>
                      <p className="text-xs text-zinc-500">Sent</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-green-600">
                        {metrics.opened || 0}
                      </p>
                      <p className="text-xs text-zinc-500">Opened</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-purple-600">
                        {metrics.replied || 0}
                      </p>
                      <p className="text-xs text-zinc-500">Replied</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-red-600">
                        {metrics.bounced || 0}
                      </p>
                      <p className="text-xs text-zinc-500">Bounced</p>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between text-xs text-zinc-400">
                    <span>
                      Daily limit: {campaign.dailyLimit}
                    </span>
                    {campaign.syncedAt && (
                      <span>
                        Last synced: {formatDateTime(campaign.syncedAt)}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
