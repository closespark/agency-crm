"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageLoader } from "@/components/ui/loading";
import { formatDateTime, formatCurrency } from "@/lib/utils";
import {
  Brain,
  Send,
  AlertTriangle,
  XCircle,
  CheckCircle,
  Zap,
  MessageSquare,
  Clock,
  Loader2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

// ── Types ──

interface InsightEntry {
  id: string;
  type: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  createdAt: string;
}

interface ErrorEntry {
  id: string;
  type: string;
  error: string | null;
  agentName: string;
  createdAt: string;
}

interface ChangelogEntry {
  id: string;
  category: string;
  changeType: string;
  description: string;
  expectedImpact: string | null;
  createdAt: string;
}

interface DashboardData {
  autopilot: { isActive: boolean; lastChangedAt: string | null };
  insights: InsightEntry[];
  errors: ErrorEntry[];
  changelog: ChangelogEntry[];
  stats: {
    totalContacts: number;
    activeDeals: number;
    pipelineValue: number;
    activeEnrollments: number;
    failedJobs7d: number;
  };
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const priorityColors: Record<string, string> = {
  critical: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
  high: "bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300",
  medium: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
  low: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
};

const categoryColors: Record<string, string> = {
  icp: "bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300",
  scoring: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
  sequence: "bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300",
  stage_gate: "bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-300",
  bant: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300",
  client_health: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300",
  send_timing: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300",
};

// ── Main Component ──

export default function AICommandCenter() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  // Autopilot is always on — no toggle needed

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Expandable sections
  const [errorsExpanded, setErrorsExpanded] = useState(true);
  const [changelogExpanded, setChangelogExpanded] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/command-center");
      const json = await res.json();
      setData(json.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    // Auto-refresh every 60 seconds
    const interval = setInterval(fetchData, 60_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // No autopilot toggle — system is fully autonomous

  const sendChat = useCallback(async () => {
    if (!chatInput.trim() || chatLoading) return;
    const message = chatInput.trim();
    setChatInput("");
    setChatMessages((prev) => [...prev, { role: "user", content: message }]);
    setChatLoading(true);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          history: chatMessages.slice(-10),
        }),
      });
      const json = await res.json();
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: json.response || json.error || "No response" },
      ]);
    } catch {
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Failed to reach the AI agent. Check the server logs." },
      ]);
    } finally {
      setChatLoading(false);
      inputRef.current?.focus();
    }
  }, [chatInput, chatLoading, chatMessages]);

  if (loading) return <PageLoader />;

  if (!data) {
    return (
      <div className="py-12 text-center text-sm text-zinc-500">
        Failed to load command center data.
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] gap-4 overflow-hidden">
      {/* Left Column: Insights + Errors + Changelog */}
      <div className="flex w-1/2 flex-col gap-4 overflow-y-auto pr-2">
        {/* Header bar */}
        <div className="flex items-center justify-between rounded-xl border border-zinc-200 bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 px-5 py-4 dark:border-zinc-800 dark:from-blue-950/30 dark:via-indigo-950/30 dark:to-purple-950/30">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-600 p-2 text-white">
              <Brain size={22} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                Command Center
              </h1>
              <div className="flex items-center gap-3 text-xs text-zinc-500">
                <span>{data.stats.totalContacts} contacts</span>
                <span>{data.stats.activeDeals} deals ({formatCurrency(data.stats.pipelineValue)})</span>
                <span>{data.stats.activeEnrollments} in sequences</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400">
            <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            Autonomous
          </div>
        </div>

        {/* Errors section */}
        {data.errors.length > 0 && (
          <Card className="border-red-200 dark:border-red-900/50">
            <CardHeader className="cursor-pointer pb-2" onClick={() => setErrorsExpanded(!errorsExpanded)}>
              <CardTitle className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <AlertTriangle size={16} className="text-red-500" />
                  Errors ({data.errors.length})
                </span>
                {errorsExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </CardTitle>
            </CardHeader>
            {errorsExpanded && (
              <CardContent className="space-y-2 pt-0">
                {data.errors.map((err) => (
                  <div key={err.id} className="flex items-start gap-2 rounded-md bg-red-50 p-2 text-xs dark:bg-red-950/20">
                    <XCircle size={14} className="mt-0.5 shrink-0 text-red-500" />
                    <div className="min-w-0 flex-1">
                      <span className="font-medium text-zinc-900 dark:text-zinc-100">{err.agentName}</span>
                      <span className="ml-1 text-zinc-500">{err.type}</span>
                      {err.error && (
                        <p className="mt-0.5 text-red-600 dark:text-red-400">{err.error.slice(0, 200)}</p>
                      )}
                      <p className="mt-0.5 text-zinc-400">{formatDateTime(err.createdAt)}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            )}
          </Card>
        )}

        {/* AI Insights feed */}
        <Card className="flex-1">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Zap size={16} className="text-blue-500" />
              AI Insights
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.insights.length === 0 ? (
              <p className="py-4 text-center text-xs text-zinc-400">No recent insights</p>
            ) : (
              data.insights.map((insight) => (
                <div key={insight.id} className="rounded-md border p-2.5 dark:border-zinc-800">
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium ${priorityColors[insight.priority] || priorityColors.medium}`}>
                      {insight.priority}
                    </span>
                    <Badge variant="secondary" className="text-[10px]">{insight.type.replace(/_/g, " ")}</Badge>
                    {insight.status === "auto_actioned" && (
                      <CheckCircle size={12} className="text-green-500" />
                    )}
                  </div>
                  <p className="mt-1 text-sm font-medium text-zinc-900 dark:text-zinc-100">{insight.title}</p>
                  <p className="mt-0.5 text-xs text-zinc-500">{insight.description.slice(0, 200)}</p>
                  <p className="mt-0.5 text-[10px] text-zinc-400">{formatDateTime(insight.createdAt)}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* System Changelog */}
        <Card>
          <CardHeader className="cursor-pointer pb-2" onClick={() => setChangelogExpanded(!changelogExpanded)}>
            <CardTitle className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <Clock size={16} className="text-zinc-400" />
                System Changelog ({data.changelog.length})
              </span>
              {changelogExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </CardTitle>
          </CardHeader>
          {changelogExpanded && (
            <CardContent className="space-y-2 pt-0">
              {data.changelog.map((entry) => (
                <div key={entry.id} className="flex items-start gap-2 text-xs">
                  <div className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium ${categoryColors[entry.category] || "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"}`}>
                        {entry.category}
                      </span>
                      <Badge variant="secondary" className="text-[10px]">{entry.changeType}</Badge>
                    </div>
                    <p className="mt-0.5 text-zinc-700 dark:text-zinc-300">{entry.description}</p>
                    {entry.expectedImpact && (
                      <p className="text-zinc-400">Expected: {entry.expectedImpact}</p>
                    )}
                    <p className="text-[10px] text-zinc-400">{formatDateTime(entry.createdAt)}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          )}
        </Card>
      </div>

      {/* Right Column: Chat Agent */}
      <div className="flex w-1/2 flex-col rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        {/* Chat header */}
        <div className="flex items-center gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <div className="rounded-lg bg-indigo-100 p-1.5 text-indigo-600 dark:bg-indigo-900/50">
            <MessageSquare size={16} />
          </div>
          <div>
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">System Agent</p>
            <p className="text-[10px] text-zinc-400">Query tables, debug errors, inspect contacts</p>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
          {chatMessages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <Brain size={32} className="text-zinc-300 dark:text-zinc-600" />
              <p className="mt-3 text-sm font-medium text-zinc-500">Ask me anything about the system</p>
              <div className="mt-3 space-y-1.5">
                {[
                  "Show me all MQL contacts stuck without BANT",
                  "What errors happened this week?",
                  "Which sequences have the best reply rates?",
                  "Show contacts with high fit score but no deal",
                  "What did autopilot do last night?",
                ].map((q) => (
                  <button
                    key={q}
                    onClick={() => { setChatInput(q); inputRef.current?.focus(); }}
                    className="block w-full rounded-lg border border-zinc-200 px-3 py-1.5 text-left text-xs text-zinc-600 transition-colors hover:border-blue-300 hover:bg-blue-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-blue-700 dark:hover:bg-blue-950/20"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {chatMessages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                  msg.role === "user"
                    ? "bg-blue-600 text-white"
                    : "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                }`}
              >
                <div className="whitespace-pre-wrap">{msg.content}</div>
              </div>
            </div>
          ))}

          {chatLoading && (
            <div className="flex justify-start">
              <div className="flex items-center gap-2 rounded-lg bg-zinc-100 px-3 py-2 text-sm text-zinc-500 dark:bg-zinc-800">
                <Loader2 size={14} className="animate-spin" />
                Querying system...
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Input */}
        <div className="border-t border-zinc-200 p-3 dark:border-zinc-800">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendChat();
                }
              }}
              placeholder="Ask about contacts, deals, errors, sequences..."
              rows={1}
              className="flex-1 resize-none rounded-lg border border-zinc-200 bg-transparent px-3 py-2 text-sm placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none dark:border-zinc-700 dark:text-zinc-100"
            />
            <Button
              size="sm"
              onClick={sendChat}
              disabled={!chatInput.trim() || chatLoading}
            >
              <Send size={14} />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
