"use client";

import { useEffect, useState, useCallback } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { Tabs } from "@/components/ui/tabs";
import { StatsCards } from "@/components/dashboards/stats-cards";
import { DealFunnel } from "@/components/dashboards/deal-funnel";
import { RevenueChart } from "@/components/dashboards/revenue-chart";
import { ActivityChart } from "@/components/dashboards/activity-chart";
import { PipelineChart } from "@/components/dashboards/pipeline-chart";
import { TicketChart } from "@/components/dashboards/ticket-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/loading";
import { formatCurrency, formatDate } from "@/lib/utils";

interface AnalyticsData {
  kpis: {
    totalContacts: number;
    totalDeals: number;
    dealsWon: number;
    totalRevenue: number;
    avgDealSize: number;
    winRate: number;
    openTickets: number;
  };
  contactsPerMonth: { month: string; count: number }[];
  dealStages: { stage: string; count: number; amount: number }[];
  ticketStatuses: { status: string; count: number }[];
  activityByWeek: { week: string; email: number; call: number; meeting: number; note: number; task: number }[];
  revenueOverTime: { month: string; revenue: number }[];
  topPerformers: { name: string; deals: number; revenue: number }[];
}

interface SavedReport {
  id: string;
  name: string;
  type: string;
  config: string;
  createdAt: string;
  updatedAt: string;
}

function DashboardTab() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/analytics/overview")
      .then((res) => res.json())
      .then((res) => setData(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex h-96 items-center justify-center text-zinc-500">
        Failed to load analytics data
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <StatsCards kpis={data.kpis} />

      <div className="grid gap-6 lg:grid-cols-2">
        <RevenueChart data={data.revenueOverTime} />
        <DealFunnel data={data.dealStages} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <PipelineChart data={data.dealStages} />
        <TicketChart data={data.ticketStatuses} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ActivityChart data={data.activityByWeek} />

        <Card>
          <CardHeader>
            <CardTitle>Top Performers</CardTitle>
          </CardHeader>
          <CardContent>
            {data.topPerformers.length === 0 ? (
              <div className="flex h-48 items-center justify-center text-sm text-zinc-400">
                No data available
              </div>
            ) : (
              <div className="space-y-4">
                {data.topPerformers.map((performer, i) => (
                  <div
                    key={performer.name}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400">
                        {i + 1}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                          {performer.name}
                        </p>
                        <p className="text-xs text-zinc-500">
                          {performer.deals} deal{performer.deals !== 1 ? "s" : ""} won
                        </p>
                      </div>
                    </div>
                    <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      {formatCurrency(performer.revenue)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Contacts per month mini-chart */}
      <Card>
        <CardHeader>
          <CardTitle>Contacts Created (Last 6 Months)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-3">
            {data.contactsPerMonth.map((month) => {
              const max = Math.max(...data.contactsPerMonth.map((m) => m.count), 1);
              const height = Math.max((month.count / max) * 120, 4);
              return (
                <div key={month.month} className="flex flex-1 flex-col items-center gap-1">
                  <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    {month.count}
                  </span>
                  <div
                    className="w-full rounded-t bg-indigo-500"
                    style={{ height: `${height}px` }}
                  />
                  <span className="text-xs text-zinc-500">{month.month}</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SavedReportsTab() {
  const [reports, setReports] = useState<SavedReport[]>([]);
  const [loading, setLoading] = useState(true);

  const loadReports = useCallback(() => {
    setLoading(true);
    fetch("/api/reports")
      .then((res) => res.json())
      .then((res) => setReports(res.data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this report?")) return;
    await fetch(`/api/reports/${id}`, { method: "DELETE" });
    loadReports();
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (reports.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center text-center">
        <svg
          className="mb-3 h-12 w-12 text-zinc-300"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
          />
        </svg>
        <h3 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">
          No saved reports
        </h3>
        <p className="mt-1 text-sm text-zinc-500">
          Managed autonomously by AI. Reports will appear after the next autopilot cycle.
        </p>
      </div>
    );
  }

  const typeLabels: Record<string, string> = {
    single_object: "Single Object",
    cross_object: "Cross Object",
    attribution: "Attribution",
  };

  return (
    <div className="space-y-3">
      {reports.map((report) => (
        <Card key={report.id}>
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <a
                href={`/reports/${report.id}`}
                className="text-sm font-medium text-zinc-900 hover:text-indigo-600 dark:text-zinc-100 dark:hover:text-indigo-400"
              >
                {report.name}
              </a>
              <div className="mt-1 flex items-center gap-3 text-xs text-zinc-500">
                <span className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                  {typeLabels[report.type] || report.type}
                </span>
                <span>Updated {formatDate(report.updatedAt)}</span>
              </div>
            </div>
            <button
              onClick={() => handleDelete(report.id)}
              className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-red-600 dark:hover:bg-zinc-800"
              title="Delete report"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
              </svg>
            </button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function ReportsPage() {
  return (
    <div>
      <PageHeader
        title="Reports"
        description="Auto-generated analytics dashboards and reports"
      />
      <Tabs
        tabs={[
          {
            id: "dashboard",
            label: "Dashboards",
            content: <DashboardTab />,
          },
          {
            id: "reports",
            label: "Saved Reports",
            content: <SavedReportsTab />,
          },
        ]}
        defaultTab="dashboard"
      />
    </div>
  );
}
