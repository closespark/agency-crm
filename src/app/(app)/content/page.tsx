"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs } from "@/components/ui/tabs";
import {
  PenLine,
  Calendar,
  Mail,
  FileText,
  Linkedin,
  Twitter,
  TrendingUp,
  Eye,
  MousePointerClick,
  Users,
  ArrowRight,
} from "lucide-react";

interface ContentDraft {
  id: string;
  channel: string;
  title: string | null;
  body: string;
  voiceScore: number | null;
  status: string;
  publishAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  calendar: {
    topic: string;
    angle: string;
    sourceInsight: string | null;
  } | null;
  performance: {
    opens: number;
    clicks: number;
    views: number;
    comments: number;
    pipelineEntriesGenerated: number;
    engagementRate: number | null;
  } | null;
}

interface PerformanceData {
  subscribers: { total: number; avgOpenRate: number | null; avgClickRate: number | null };
  channelBreakdown: {
    channel: string;
    _count: number;
    _sum: { opens: number; clicks: number; views: number; comments: number; pipelineEntriesGenerated: number };
    _avg: { engagementRate: number | null };
  }[];
  totalPipelineEntries: number;
}

const channelIcons: Record<string, React.ElementType> = {
  newsletter: Mail,
  blog: FileText,
  linkedin: Linkedin,
  twitter: Twitter,
};

const channelLabels: Record<string, string> = {
  newsletter: "Newsletter",
  blog: "Blog",
  linkedin: "LinkedIn",
  twitter: "Twitter/X",
};

const statusColors: Record<string, string> = {
  draft: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  review: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
  approved: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  scheduled: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
  published: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  rejected: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
};

export default function ContentPage() {
  const [drafts, setDrafts] = useState<ContentDraft[]>([]);
  const [performance, setPerformance] = useState<PerformanceData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/content/drafts").then((r) => r.json()),
      fetch("/api/content/performance").then((r) => r.json()),
    ]).then(([draftData, perfData]) => {
      setDrafts(draftData.drafts || []);
      setPerformance(perfData);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  const published = drafts.filter((d) => d.status === "published");
  const pending = drafts.filter((d) => ["draft", "approved", "scheduled"].includes(d.status));

  const handleUpdateDraft = (id: string, status: string) => {
    fetch("/api/content/drafts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    }).then(() => {
      setDrafts((prev) =>
        prev.map((d) => (d.id === id ? { ...d, status } : d))
      );
    });
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            Content Engine
          </h1>
          <p className="text-sm text-zinc-500">
            Autonomous content generation from pipeline intelligence
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-100 p-2 dark:bg-blue-900">
                <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{performance?.subscribers.total || 0}</p>
                <p className="text-xs text-zinc-500">Newsletter Subscribers</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-green-100 p-2 dark:bg-green-900">
                <Eye className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {performance?.subscribers.avgOpenRate
                    ? `${(performance.subscribers.avgOpenRate * 100).toFixed(0)}%`
                    : "—"}
                </p>
                <p className="text-xs text-zinc-500">Avg Open Rate</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-purple-100 p-2 dark:bg-purple-900">
                <MousePointerClick className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {performance?.subscribers.avgClickRate
                    ? `${(performance.subscribers.avgClickRate * 100).toFixed(0)}%`
                    : "—"}
                </p>
                <p className="text-xs text-zinc-500">Avg Click Rate</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-orange-100 p-2 dark:bg-orange-900">
                <TrendingUp className="h-5 w-5 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{performance?.totalPipelineEntries || 0}</p>
                <p className="text-xs text-zinc-500">Pipeline Entries from Content</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs
        tabs={[
          {
            id: "overview",
            label: "Overview",
            content: (
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Calendar className="h-5 w-5" />
                      Upcoming Content
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {pending.length === 0 ? (
                      <p className="text-sm text-zinc-500">
                        No content scheduled. The Content Engine generates next week's calendar during the Sunday self-audit.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {pending.map((draft) => {
                          const Icon = channelIcons[draft.channel] || PenLine;
                          return (
                            <div
                              key={draft.id}
                              className="flex items-center justify-between rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
                            >
                              <div className="flex items-center gap-3">
                                <Icon className="h-4 w-4 text-zinc-400" />
                                <div>
                                  <p className="text-sm font-medium">
                                    {draft.title || draft.calendar?.topic || "Untitled"}
                                  </p>
                                  <p className="text-xs text-zinc-500">
                                    {channelLabels[draft.channel] || draft.channel}
                                    {draft.publishAt && ` · ${new Date(draft.publishAt).toLocaleDateString()}`}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                {draft.voiceScore != null && (
                                  <span className="text-xs text-zinc-400">
                                    Voice: {(draft.voiceScore * 100).toFixed(0)}%
                                  </span>
                                )}
                                <Badge className={statusColors[draft.status] || ""}>
                                  {draft.status}
                                </Badge>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {performance?.channelBreakdown && performance.channelBreakdown.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <TrendingUp className="h-5 w-5" />
                        Channel Performance (30 days)
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        {performance.channelBreakdown.map((ch) => {
                          const Icon = channelIcons[ch.channel] || PenLine;
                          return (
                            <div
                              key={ch.channel}
                              className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
                            >
                              <div className="mb-3 flex items-center gap-2">
                                <Icon className="h-4 w-4" />
                                <span className="text-sm font-medium">
                                  {channelLabels[ch.channel] || ch.channel}
                                </span>
                              </div>
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                <div>
                                  <p className="text-zinc-500">Pieces</p>
                                  <p className="font-medium">{ch._count}</p>
                                </div>
                                <div>
                                  <p className="text-zinc-500">Pipeline</p>
                                  <p className="font-medium">{ch._sum.pipelineEntriesGenerated}</p>
                                </div>
                                <div>
                                  <p className="text-zinc-500">Clicks</p>
                                  <p className="font-medium">{ch._sum.clicks}</p>
                                </div>
                                <div>
                                  <p className="text-zinc-500">Engagement</p>
                                  <p className="font-medium">
                                    {ch._avg.engagementRate
                                      ? `${(ch._avg.engagementRate * 100).toFixed(0)}%`
                                      : "—"}
                                  </p>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            ),
          },
          {
            id: "drafts",
            label: "Drafts & Queue",
            content: (
              <Card>
                <CardHeader>
                  <CardTitle>Content Queue</CardTitle>
                </CardHeader>
                <CardContent>
                  {pending.length === 0 ? (
                    <p className="text-sm text-zinc-500">No pending drafts.</p>
                  ) : (
                    <div className="space-y-4">
                      {pending.map((draft) => (
                        <DraftCard key={draft.id} draft={draft} onUpdate={handleUpdateDraft} />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ),
          },
          {
            id: "published",
            label: "Published",
            content: (
              <Card>
                <CardHeader>
                  <CardTitle>Published Content</CardTitle>
                </CardHeader>
                <CardContent>
                  {published.length === 0 ? (
                    <p className="text-sm text-zinc-500">No published content yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {published.map((draft) => {
                        const Icon = channelIcons[draft.channel] || PenLine;
                        return (
                          <div
                            key={draft.id}
                            className="flex items-center justify-between rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
                          >
                            <div className="flex items-center gap-3">
                              <Icon className="h-4 w-4 text-zinc-400" />
                              <div>
                                <p className="text-sm font-medium">{draft.title || "Untitled"}</p>
                                <p className="text-xs text-zinc-500">
                                  {channelLabels[draft.channel]}
                                  {draft.publishedAt && ` · ${new Date(draft.publishedAt).toLocaleDateString()}`}
                                </p>
                              </div>
                            </div>
                            {draft.performance && (
                              <div className="flex items-center gap-4 text-xs text-zinc-500">
                                {draft.performance.opens > 0 && (
                                  <span>{draft.performance.opens} opens</span>
                                )}
                                {draft.performance.clicks > 0 && (
                                  <span>{draft.performance.clicks} clicks</span>
                                )}
                                {draft.performance.views > 0 && (
                                  <span>{draft.performance.views} views</span>
                                )}
                                {draft.performance.pipelineEntriesGenerated > 0 && (
                                  <span className="font-medium text-green-600">
                                    {draft.performance.pipelineEntriesGenerated} pipeline
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            ),
          },
          {
            id: "performance",
            label: "Performance",
            content: (
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-zinc-500">
                    Performance data populates after content has been published and engagement is tracked.
                    The Content Engine self-optimizes every Sunday based on this data.
                  </p>
                </CardContent>
              </Card>
            ),
          },
        ]}
        defaultTab="overview"
      />
    </div>
  );
}

function DraftCard({
  draft,
  onUpdate,
}: {
  draft: ContentDraft;
  onUpdate: (id: string, status: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const Icon = channelIcons[draft.channel] || PenLine;

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800">
      <div
        className="flex cursor-pointer items-center justify-between p-4"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <Icon className="h-4 w-4 text-zinc-400" />
          <div>
            <p className="text-sm font-medium">{draft.title || draft.calendar?.topic || "Untitled"}</p>
            <p className="text-xs text-zinc-500">
              {channelLabels[draft.channel]}
              {draft.calendar?.angle && ` · ${draft.calendar.angle.substring(0, 60)}...`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {draft.voiceScore != null && (
            <span className="text-xs text-zinc-400">
              Voice: {(draft.voiceScore * 100).toFixed(0)}%
            </span>
          )}
          <Badge className={statusColors[draft.status] || ""}>{draft.status}</Badge>
          <ArrowRight className={`h-4 w-4 transition-transform ${expanded ? "rotate-90" : ""}`} />
        </div>
      </div>
      {expanded && (
        <div className="border-t border-zinc-200 p-4 dark:border-zinc-800">
          <div className="prose prose-sm dark:prose-invert mb-4 max-w-none">
            <pre className="whitespace-pre-wrap text-xs">{draft.body.substring(0, 1000)}</pre>
          </div>
          {draft.calendar?.sourceInsight && (
            <p className="mb-3 text-xs text-zinc-400">
              Source: {draft.calendar.sourceInsight}
            </p>
          )}
          <div className="flex gap-2">
            {draft.status === "draft" && (
              <>
                <Button size="sm" onClick={() => onUpdate(draft.id, "approved")}>
                  Approve
                </Button>
                <Button size="sm" variant="outline" onClick={() => onUpdate(draft.id, "rejected")}>
                  Reject
                </Button>
              </>
            )}
            {draft.status === "approved" && (
              <Button size="sm" onClick={() => onUpdate(draft.id, "scheduled")}>
                Schedule
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
