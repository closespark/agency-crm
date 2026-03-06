"use client";

import { useEffect, useState, useCallback } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { Select } from "@/components/ui/select";
import { Pagination } from "@/components/ui/pagination";
import { InsightCard } from "@/components/ai/insight-card";
import { PageLoader, EmptyState } from "@/components/ui/loading";
import { Lightbulb } from "lucide-react";

interface InsightData {
  id: string;
  type: string;
  title: string;
  description: string;
  priority: string;
  resourceType: string;
  resourceId: string;
  actionItems: string | null;
  status: string;
  createdAt: string;
}

const typeOptions = [
  { value: "", label: "All Types" },
  { value: "deal_risk", label: "Deal Risk" },
  { value: "upsell_opportunity", label: "Upsell Opportunity" },
  { value: "churn_warning", label: "Churn Warning" },
  { value: "engagement_drop", label: "Engagement Drop" },
  { value: "hot_lead", label: "Hot Lead" },
  { value: "meeting_suggestion", label: "Meeting Suggestion" },
];

const statusOptions = [
  { value: "", label: "All Statuses" },
  { value: "new", label: "New" },
  { value: "acknowledged", label: "Acknowledged" },
  { value: "acted_on", label: "Acted On" },
  { value: "dismissed", label: "Dismissed" },
];

export default function AIInsightsPage() {
  const [insights, setInsights] = useState<InsightData[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");

  const fetchInsights = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      page: page.toString(),
      pageSize: "20",
      ...(type && { type }),
      ...(status && { status }),
    });
    try {
      const res = await fetch(`/api/ai/insights?${params}`);
      const data = await res.json();
      setInsights(data.data || []);
      setTotalPages(data.meta?.totalPages || 1);
    } finally {
      setLoading(false);
    }
  }, [page, type, status]);

  useEffect(() => {
    fetchInsights();
  }, [fetchInsights]);

  async function handleUpdateStatus(id: string, newStatus: string) {
    await fetch(`/api/ai/insights/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    fetchInsights();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Insights"
        description="AI-generated insights and recommendations across your CRM data"
      />

      <div className="flex items-center gap-3">
        <Select
          options={typeOptions}
          value={type}
          onChange={(e) => {
            setType(e.target.value);
            setPage(1);
          }}
          className="w-52"
        />
        <Select
          options={statusOptions}
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="w-44"
        />
      </div>

      {loading ? (
        <PageLoader />
      ) : insights.length === 0 ? (
        <EmptyState
          icon={<Lightbulb size={48} />}
          title="No insights found"
          description="Run the AI engine to generate insights from your CRM data."
        />
      ) : (
        <div className="space-y-3">
          {insights.map((insight) => (
            <InsightCard
              key={insight.id}
              insight={insight}
              onUpdateStatus={handleUpdateStatus}
            />
          ))}
        </div>
      )}

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
