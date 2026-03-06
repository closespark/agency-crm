"use client";

import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { PageLoader, Spinner } from "@/components/ui/loading";
import { InstantlySync } from "@/components/sequences/instantly-sync";
import { api } from "@/lib/api";

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

interface SequenceOption {
  id: string;
  name: string;
  stepsCount: number;
  enrollmentCounts: { total: number; active: number };
}

export default function InstantlyPage() {
  const [loading, setLoading] = useState(true);
  const [campaigns, setCampaigns] = useState<InstantlyCampaignData[]>([]);
  const [sequences, setSequences] = useState<SequenceOption[]>([]);
  const [pushModalOpen, setPushModalOpen] = useState(false);
  const [selectedSequenceId, setSelectedSequenceId] = useState("");
  const [dailyLimit, setDailyLimit] = useState("30");
  const [pushing, setPushing] = useState(false);

  const fetchCampaigns = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch Instantly campaigns from local DB
      const res = await api.get<InstantlyCampaignData[]>(
        "/sequences/instantly/sync"
      );

      // The sync endpoint returns data on POST. For listing, we'll use a GET
      // that returns locally stored campaigns. Since we don't have a separate
      // listing endpoint, we fetch all sequences and Instantly campaigns together.
      // For now, we'll load the Instantly campaigns by fetching from Prisma via
      // the sequences API (which includes Instantly data).
    } catch {
      // Handled
    }
    setLoading(false);
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch sequences for the push modal
      const seqRes = await api.get<{
        data: SequenceOption[];
        meta: { total: number };
      }>("/sequences?pageSize=100");

      if (seqRes.data) {
        const response = seqRes.data as unknown as {
          data: SequenceOption[];
        };
        setSequences(response.data);
      }

      // Fetch Instantly campaigns (we'll make a direct Prisma query through a custom approach)
      // Since we need to list InstantlyCampaigns, let's use the sequences API
      // The InstantlyCampaign data will be fetched via a direct endpoint
      // For now, we use the sync endpoint which handles campaign listing
      const campRes = await fetch("/api/sequences/instantly/campaigns");
      if (campRes.ok) {
        const campData = await campRes.json();
        setCampaigns(campData.data || []);
      }
    } catch {
      // Use empty arrays as fallback
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handlePush() {
    if (!selectedSequenceId) return;

    setPushing(true);
    try {
      const res = await api.post("/sequences/instantly/push", {
        sequenceId: selectedSequenceId,
        dailyLimit: parseInt(dailyLimit) || 30,
      });

      if (!res.error) {
        setPushModalOpen(false);
        setSelectedSequenceId("");
        fetchData();
      }
    } finally {
      setPushing(false);
    }
  }

  if (loading) {
    return <PageLoader />;
  }

  const sequenceOptions = sequences.map((s) => ({
    value: s.id,
    label: `${s.name} (${s.stepsCount} steps, ${s.enrollmentCounts?.active || 0} active)`,
  }));

  return (
    <div>
      <PageHeader
        title="Instantly Campaigns"
        description="Manage email campaigns synced with Instantly.ai"
        actions={
          <Button onClick={() => setPushModalOpen(true)}>
            Push Sequence to Instantly
          </Button>
        }
      />

      <InstantlySync campaigns={campaigns} onRefresh={fetchData} />

      {/* Push to Instantly Modal */}
      <Modal
        open={pushModalOpen}
        onClose={() => setPushModalOpen(false)}
        title="Push Sequence to Instantly"
        className="max-w-md"
      >
        <div className="space-y-4">
          <Select
            label="Select Sequence"
            options={sequenceOptions}
            value={selectedSequenceId}
            onChange={(e) => setSelectedSequenceId(e.target.value)}
            placeholder="Choose a sequence..."
          />

          <Input
            label="Daily Send Limit"
            type="number"
            min={1}
            max={500}
            value={dailyLimit}
            onChange={(e) => setDailyLimit(e.target.value)}
          />

          <p className="text-xs text-zinc-500">
            This will create a new campaign in Instantly with all email steps
            from the selected sequence and add all actively enrolled contacts as
            leads.
          </p>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setPushModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handlePush}
              disabled={pushing || !selectedSequenceId}
            >
              {pushing ? (
                <>
                  <Spinner size="sm" />
                  Pushing...
                </>
              ) : (
                "Push to Instantly"
              )}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
