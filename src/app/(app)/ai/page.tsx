"use client";

import { useEffect, useState, useCallback } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs } from "@/components/ui/tabs";
import { AutopilotStats } from "@/components/ai/autopilot-stats";
import { AIActivityFeed } from "@/components/ai/ai-activity-feed";
import { InsightCard } from "@/components/ai/insight-card";
import { Spinner, PageLoader } from "@/components/ui/loading";
import { Select } from "@/components/ui/select";
import { Pagination } from "@/components/ui/pagination";
import { formatDateTime, formatCurrency } from "@/lib/utils";
import {
  Brain,
  Play,
  Pause,
  Users,
  TrendingUp,
  Zap,
  Lightbulb,
  RefreshCw,
} from "lucide-react";

interface Stats {
  contactsScored: number;
  repliesAnalyzed: number;
  dealsAnalyzed: number;
  insightsGenerated: number;
  sequenceStepsExecuted: number;
  meetingsBooked: number;
}

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

interface ConvLogEntry {
  id: string;
  contactId: string | null;
  dealId: string | null;
  channel: string;
  direction: string;
  rawContent: string;
  aiSummary: string | null;
  sentiment: string | null;
  intent: string | null;
  actionTaken: boolean;
  createdAt: string;
}

export default function AICommandCenterPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [autopilotActive, setAutopilotActive] = useState(true);
  const [runningAction, setRunningAction] = useState<string | null>(null);

  // Insights tab state
  const [insights, setInsights] = useState<InsightData[]>([]);
  const [insightsPage, setInsightsPage] = useState(1);
  const [insightsTotalPages, setInsightsTotalPages] = useState(1);
  const [insightsType, setInsightsType] = useState("");
  const [insightsStatus, setInsightsStatus] = useState("");

  // Conversation log tab state
  const [convLogs, setConvLogs] = useState<ConvLogEntry[]>([]);
  const [convPage, setConvPage] = useState(1);
  const [convTotalPages, setConvTotalPages] = useState(1);
  const [convChannel, setConvChannel] = useState("");
  const [convSentiment, setConvSentiment] = useState("");

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/stats");
      const data = await res.json();
      setStats(data.data);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchInsights = useCallback(async () => {
    const params = new URLSearchParams({
      page: insightsPage.toString(),
      pageSize: "10",
      ...(insightsType && { type: insightsType }),
      ...(insightsStatus && { status: insightsStatus }),
    });
    const res = await fetch(`/api/ai/insights?${params}`);
    const data = await res.json();
    setInsights(data.data || []);
    setInsightsTotalPages(data.meta?.totalPages || 1);
  }, [insightsPage, insightsType, insightsStatus]);

  const fetchConvLogs = useCallback(async () => {
    const params = new URLSearchParams({
      page: convPage.toString(),
      pageSize: "15",
      ...(convChannel && { channel: convChannel }),
      ...(convSentiment && { sentiment: convSentiment }),
    });
    const res = await fetch(`/api/ai/conversation-log?${params}`);
    const data = await res.json();
    setConvLogs(data.data || []);
    setConvTotalPages(data.meta?.totalPages || 1);
  }, [convPage, convChannel, convSentiment]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    fetchInsights();
  }, [fetchInsights]);

  useEffect(() => {
    fetchConvLogs();
  }, [fetchConvLogs]);

  async function runAction(action: string) {
    setRunningAction(action);
    try {
      const res = await fetch("/api/ai/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (data.data?.stats) {
        setStats(data.data.stats);
      }
      fetchInsights();
    } finally {
      setRunningAction(null);
    }
  }

  async function handleInsightStatus(id: string, status: string) {
    await fetch(`/api/ai/insights/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    fetchInsights();
  }

  const insightTypeOptions = [
    { value: "", label: "All Types" },
    { value: "deal_risk", label: "Deal Risk" },
    { value: "upsell_opportunity", label: "Upsell Opportunity" },
    { value: "churn_warning", label: "Churn Warning" },
    { value: "engagement_drop", label: "Engagement Drop" },
    { value: "hot_lead", label: "Hot Lead" },
    { value: "meeting_suggestion", label: "Meeting Suggestion" },
  ];

  const insightStatusOptions = [
    { value: "", label: "All Statuses" },
    { value: "new", label: "New" },
    { value: "acknowledged", label: "Acknowledged" },
    { value: "acted_on", label: "Acted On" },
    { value: "dismissed", label: "Dismissed" },
  ];

  const sentimentOptions = [
    { value: "", label: "All Sentiment" },
    { value: "positive", label: "Positive" },
    { value: "neutral", label: "Neutral" },
    { value: "negative", label: "Negative" },
    { value: "urgent", label: "Urgent" },
  ];

  const channelOptions = [
    { value: "", label: "All Channels" },
    { value: "email", label: "Email" },
    { value: "linkedin", label: "LinkedIn" },
    { value: "chat", label: "Chat" },
  ];

  const sentimentColor: Record<string, string> = {
    positive: "success",
    neutral: "secondary",
    negative: "danger",
    urgent: "warning",
  };

  return (
    <div className="space-y-6">
      {/* Hero Section */}
      <div className="rounded-xl border border-zinc-200 bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 p-6 dark:border-zinc-800 dark:from-blue-950/30 dark:via-indigo-950/30 dark:to-purple-950/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="rounded-xl bg-blue-600 p-3 text-white">
              <Brain size={28} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                AI Command Center
              </h1>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Autopilot engine status and controls -- Last 30 days
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div
                className={`h-2.5 w-2.5 rounded-full ${
                  autopilotActive ? "bg-green-500 animate-pulse" : "bg-zinc-400"
                }`}
              />
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {autopilotActive ? "Autopilot Active" : "Autopilot Paused"}
              </span>
            </div>
            <Button
              variant={autopilotActive ? "outline" : "default"}
              onClick={() => setAutopilotActive(!autopilotActive)}
            >
              {autopilotActive ? <Pause size={16} /> : <Play size={16} />}
              {autopilotActive ? "Pause" : "Activate"}
            </Button>
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <AutopilotStats stats={stats} loading={loading} />

      {/* Run Now Buttons */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Run Now</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {[
              { action: "score_contacts", label: "Score All Contacts", icon: Users },
              { action: "scan_deals", label: "Scan Deals", icon: TrendingUp },
              { action: "process_sequences", label: "Process Sequences", icon: Zap },
              { action: "generate_insights", label: "Generate Insights", icon: Lightbulb },
            ].map((item) => {
              const Icon = item.icon;
              const isRunning = runningAction === item.action;
              return (
                <Button
                  key={item.action}
                  variant="outline"
                  disabled={!!runningAction || !autopilotActive}
                  onClick={() => runAction(item.action)}
                >
                  {isRunning ? (
                    <Spinner size="sm" />
                  ) : (
                    <Icon size={16} />
                  )}
                  {item.label}
                </Button>
              );
            })}
            <Button
              variant="ghost"
              onClick={() => {
                setLoading(true);
                fetchStats();
              }}
            >
              <RefreshCw size={16} />
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs
        tabs={[
          {
            id: "insights",
            label: "Insights",
            content: (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Select
                    options={insightTypeOptions}
                    value={insightsType}
                    onChange={(e) => {
                      setInsightsType(e.target.value);
                      setInsightsPage(1);
                    }}
                    className="w-48"
                  />
                  <Select
                    options={insightStatusOptions}
                    value={insightsStatus}
                    onChange={(e) => {
                      setInsightsStatus(e.target.value);
                      setInsightsPage(1);
                    }}
                    className="w-48"
                  />
                </div>
                {insights.length === 0 ? (
                  <p className="py-8 text-center text-sm text-zinc-500">
                    No insights found
                  </p>
                ) : (
                  <div className="space-y-3">
                    {insights.map((insight) => (
                      <InsightCard
                        key={insight.id}
                        insight={insight}
                        onUpdateStatus={handleInsightStatus}
                      />
                    ))}
                  </div>
                )}
                <Pagination
                  page={insightsPage}
                  totalPages={insightsTotalPages}
                  onPageChange={setInsightsPage}
                />
              </div>
            ),
          },
          {
            id: "jobs",
            label: "Jobs",
            content: <JobsTabContent />,
          },
          {
            id: "agents",
            label: "Agents",
            content: <AgentsTabContent />,
          },
          {
            id: "conversation-log",
            label: "Conversation Log",
            content: (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Select
                    options={channelOptions}
                    value={convChannel}
                    onChange={(e) => {
                      setConvChannel(e.target.value);
                      setConvPage(1);
                    }}
                    className="w-40"
                  />
                  <Select
                    options={sentimentOptions}
                    value={convSentiment}
                    onChange={(e) => {
                      setConvSentiment(e.target.value);
                      setConvPage(1);
                    }}
                    className="w-40"
                  />
                </div>
                {convLogs.length === 0 ? (
                  <p className="py-8 text-center text-sm text-zinc-500">
                    No conversation logs found
                  </p>
                ) : (
                  <div className="space-y-2">
                    {convLogs.map((log) => (
                      <Card key={log.id}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <Badge variant="secondary">{log.channel}</Badge>
                                <Badge variant={log.direction === "inbound" ? "default" : "outline"}>
                                  {log.direction}
                                </Badge>
                                {log.sentiment && (
                                  <Badge variant={(sentimentColor[log.sentiment] ?? "secondary") as "success" | "secondary" | "danger" | "warning"}>
                                    {log.sentiment}
                                  </Badge>
                                )}
                                {log.intent && (
                                  <Badge variant="outline">{log.intent}</Badge>
                                )}
                              </div>
                              {log.aiSummary && (
                                <p className="mt-1 text-sm font-medium text-zinc-900 dark:text-zinc-100">
                                  {log.aiSummary}
                                </p>
                              )}
                              <p className="mt-1 line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400">
                                {log.rawContent}
                              </p>
                            </div>
                            <span className="shrink-0 text-xs text-zinc-400">
                              {formatDateTime(log.createdAt)}
                            </span>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
                <Pagination
                  page={convPage}
                  totalPages={convTotalPages}
                  onPageChange={setConvPage}
                />
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}

// Inline sub-components for the embedded tabs

function JobsTabContent() {
  const [jobs, setJobs] = useState<Array<{
    id: string;
    type: string;
    status: string;
    tokens: number | null;
    cost: number | null;
    createdAt: string;
    startedAt: string | null;
    completedAt: string | null;
    agent: { id: string; name: string };
  }>>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [summary, setSummary] = useState({ totalJobs: 0, totalTokens: 0, totalCost: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/ai/jobs?page=${page}&pageSize=10`)
      .then((r) => r.json())
      .then((res) => {
        setJobs(res.data || []);
        setTotalPages(res.meta?.totalPages || 1);
        if (res.summary) setSummary(res.summary);
      })
      .finally(() => setLoading(false));
  }, [page]);

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{summary.totalJobs.toLocaleString()}</p>
            <p className="text-xs text-zinc-500">Total Jobs (30d)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{summary.totalTokens.toLocaleString()}</p>
            <p className="text-xs text-zinc-500">Total Tokens (30d)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{formatCurrency(summary.totalCost)}</p>
            <p className="text-xs text-zinc-500">Total Cost (30d)</p>
          </CardContent>
        </Card>
      </div>
      <div className="text-right">
        <a href="/ai/jobs" className="text-sm text-blue-600 hover:underline">
          View all jobs &rarr;
        </a>
      </div>
      {jobs.length === 0 ? (
        <p className="py-8 text-center text-sm text-zinc-500">No jobs found</p>
      ) : (
        <div className="space-y-2">
          {jobs.map((job) => (
            <Card key={job.id}>
              <CardContent className="flex items-center justify-between p-3">
                <div className="flex items-center gap-3">
                  <Badge
                    variant={
                      job.status === "completed" ? "success" :
                      job.status === "failed" ? "danger" :
                      job.status === "running" ? "warning" : "secondary"
                    }
                  >
                    {job.status}
                  </Badge>
                  <div>
                    <span className="text-sm font-medium">{job.agent.name}</span>
                    <span className="mx-2 text-zinc-300">|</span>
                    <span className="text-sm text-zinc-500">{job.type}</span>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs text-zinc-500">
                  {job.tokens && <span>{job.tokens.toLocaleString()} tokens</span>}
                  {job.cost != null && <span>{formatCurrency(job.cost)}</span>}
                  <span>{formatDateTime(job.createdAt)}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}

function AgentsTabContent() {
  const [agents, setAgents] = useState<Array<{
    id: string;
    name: string;
    description: string | null;
    model: string;
    temperature: number;
    isActive: boolean;
    _count: { jobs: number };
  }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/ai/agents")
      .then((r) => r.json())
      .then((res) => setAgents(res.data || []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-4">
      <div className="text-right">
        <a href="/ai/agents" className="text-sm text-blue-600 hover:underline">
          Manage agents &rarr;
        </a>
      </div>
      {agents.length === 0 ? (
        <p className="py-8 text-center text-sm text-zinc-500">No agents configured</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => (
            <Card key={agent.id} className={!agent.isActive ? "opacity-60" : ""}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-zinc-900 dark:text-zinc-100">
                    {agent.name}
                  </h3>
                  <Badge variant={agent.isActive ? "success" : "secondary"}>
                    {agent.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-zinc-500">
                  {agent.description || "No description"}
                </p>
                <div className="mt-2 flex items-center gap-3 text-xs text-zinc-400">
                  <span>{agent.model}</span>
                  <span>Temp: {agent.temperature}</span>
                  <span>{agent._count.jobs} jobs</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
