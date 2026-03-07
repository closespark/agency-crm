"use client";

import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { SearchInput } from "@/components/shared/search-input";
import { Select } from "@/components/ui/select";
import { Pagination } from "@/components/ui/pagination";
import { PageLoader, EmptyState } from "@/components/ui/loading";
import { CampaignCard } from "@/components/marketing/campaign-card";
import { api, buildQueryString } from "@/lib/api";
import type { Campaign } from "@/types";

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchCampaigns = useCallback(async () => {
    setLoading(true);
    const qs = buildQueryString({
      page,
      pageSize: 12,
      search,
      filters: {
        ...(status && { status }),
        ...(type && { type }),
      },
    });
    const res = await api.get<Campaign[]>(`/campaigns${qs}`);
    if (res.data) {
      setCampaigns(res.data);
      setTotalPages(res.meta?.totalPages || 1);
    }
    setLoading(false);
  }, [page, search, status, type]);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  useEffect(() => {
    setPage(1);
  }, [search, status, type]);

  return (
    <div>
      <PageHeader
        title="Campaigns"
        description="AI-managed marketing campaigns"
        actions={
          <span className="text-sm text-zinc-500">Managed autonomously by AI</span>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search campaigns..."
          className="w-64"
        />
        <Select
          options={[
            { value: "draft", label: "Draft" },
            { value: "active", label: "Active" },
            { value: "paused", label: "Paused" },
            { value: "completed", label: "Completed" },
          ]}
          placeholder="All statuses"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="w-40"
        />
        <Select
          options={[
            { value: "email", label: "Email" },
            { value: "social", label: "Social" },
            { value: "ads", label: "Ads" },
            { value: "content", label: "Content" },
          ]}
          placeholder="All types"
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="w-40"
        />
      </div>

      {loading ? (
        <PageLoader />
      ) : campaigns.length === 0 ? (
        <EmptyState
          title="No campaigns found"
          description="Managed autonomously by AI. Campaigns will appear after the next autopilot cycle."
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {campaigns.map((campaign) => (
              <CampaignCard key={campaign.id} campaign={campaign} />
            ))}
          </div>
          <Pagination
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
}
