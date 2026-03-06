"use client";

import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/loading";
import { LeadScorePanel } from "./lead-score-panel";
import { ComposeEmail } from "./compose-email";

interface ConversationLogEntry {
  id: string;
  channel: string;
  direction: string;
  rawContent: string;
  aiSummary: string | null;
  sentiment: string | null;
  intent: string | null;
  suggestedAction: string | null;
  actionTaken: boolean;
  createdAt: string;
}

interface AIInsightEntry {
  id: string;
  type: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  createdAt: string;
}

interface ContactAITabProps {
  contactId: string;
  contactName?: string;
  onLifecycleApply?: (stage: string) => void;
  onNextAction?: (action: string) => void;
  onSendEmail?: (subject: string, body: string) => void;
}

function sentimentVariant(sentiment: string | null) {
  switch (sentiment) {
    case "positive":
      return "success" as const;
    case "negative":
      return "danger" as const;
    case "urgent":
      return "danger" as const;
    default:
      return "secondary" as const;
  }
}

function priorityVariant(priority: string) {
  switch (priority) {
    case "critical":
      return "danger" as const;
    case "high":
      return "warning" as const;
    default:
      return "secondary" as const;
  }
}

export function ContactAITab({
  contactId,
  contactName,
  onLifecycleApply,
  onNextAction,
  onSendEmail,
}: ContactAITabProps) {
  const [conversationLog, setConversationLog] = useState<ConversationLogEntry[]>([]);
  const [insights, setInsights] = useState<AIInsightEntry[]>([]);
  const [loadingLog, setLoadingLog] = useState(true);
  const [loadingInsights, setLoadingInsights] = useState(true);
  const [composeOpen, setComposeOpen] = useState(false);
  const [scoring, setScoring] = useState(false);

  useEffect(() => {
    async function fetchLog() {
      try {
        const res = await fetch(
          `/api/ai/conversation-log?contactId=${contactId}&pageSize=10`
        );
        const json = await res.json();
        if (res.ok) setConversationLog(json.data);
      } catch {
        // silent fail
      } finally {
        setLoadingLog(false);
      }
    }

    async function fetchInsights() {
      try {
        const res = await fetch(
          `/api/ai/insights?resourceType=contact&resourceId=${contactId}`
        );
        const json = await res.json();
        if (res.ok) setInsights(json.data || []);
      } catch {
        // silent fail
      } finally {
        setLoadingInsights(false);
      }
    }

    fetchLog();
    fetchInsights();
  }, [contactId]);

  async function triggerScore() {
    setScoring(true);
    try {
      await fetch(`/api/ai/score/${contactId}`, { method: "POST" });
    } catch {
      // handled by LeadScorePanel
    } finally {
      setScoring(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Quick Actions */}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={triggerScore} disabled={scoring}>
          {scoring ? <Spinner size="sm" /> : "Re-Score Contact"}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setComposeOpen(true)}>
          Compose Email
        </Button>
      </div>

      {/* Lead Score Panel */}
      <LeadScorePanel
        contactId={contactId}
        onLifecycleApply={onLifecycleApply}
        onNextAction={onNextAction}
      />

      {/* AI Insights */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">AI Insights</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingInsights ? (
            <div className="flex justify-center py-4">
              <Spinner />
            </div>
          ) : insights.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              No AI insights yet for this contact.
            </p>
          ) : (
            <ul className="space-y-3">
              {insights.map((insight) => (
                <li
                  key={insight.id}
                  className="rounded-md border border-zinc-200 p-3 dark:border-zinc-700"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant={priorityVariant(insight.priority)}>
                          {insight.priority}
                        </Badge>
                        <Badge variant="secondary">{insight.type.replace(/_/g, " ")}</Badge>
                      </div>
                      <p className="mt-1 text-sm font-medium text-zinc-900 dark:text-zinc-100">
                        {insight.title}
                      </p>
                      <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                        {insight.description}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-zinc-400">
                      {new Date(insight.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Conversation Log */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">AI Conversation History</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingLog ? (
            <div className="flex justify-center py-4">
              <Spinner />
            </div>
          ) : conversationLog.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              No AI conversation logs yet for this contact.
            </p>
          ) : (
            <ul className="space-y-3">
              {conversationLog.map((entry) => (
                <li
                  key={entry.id}
                  className="rounded-md border border-zinc-200 p-3 dark:border-zinc-700"
                >
                  <div className="flex items-center gap-2">
                    <Badge variant={entry.direction === "inbound" ? "default" : "secondary"}>
                      {entry.direction}
                    </Badge>
                    <Badge variant="secondary">{entry.channel}</Badge>
                    {entry.sentiment && (
                      <Badge variant={sentimentVariant(entry.sentiment)}>
                        {entry.sentiment}
                      </Badge>
                    )}
                    {entry.intent && (
                      <Badge variant="secondary">
                        {entry.intent.replace(/_/g, " ")}
                      </Badge>
                    )}
                    <span className="ml-auto text-xs text-zinc-400">
                      {new Date(entry.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  {entry.aiSummary && (
                    <p className="mt-1.5 text-sm text-zinc-700 dark:text-zinc-300">
                      {entry.aiSummary}
                    </p>
                  )}
                  {!entry.aiSummary && (
                    <p className="mt-1.5 line-clamp-2 text-sm text-zinc-500 dark:text-zinc-400">
                      {entry.rawContent}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Compose Email Modal */}
      <ComposeEmail
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        contactId={contactId}
        contactName={contactName}
        onSend={onSendEmail}
      />
    </div>
  );
}
