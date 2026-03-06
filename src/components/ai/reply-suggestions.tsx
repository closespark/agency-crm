"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/loading";

interface ReplyAnalysis {
  sentiment: "positive" | "neutral" | "negative" | "urgent";
  intent: string;
  keyPoints: string[];
  suggestedResponse: string;
  recommendedActions: { action: string; reason: string }[];
  urgency: string;
}

interface ReplySuggestionsProps {
  content: string;
  contactId?: string;
  channel?: string;
  onUseReply?: (reply: string) => void;
  onActionClick?: (action: string) => void;
}

function sentimentVariant(sentiment: string) {
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

function intentVariant(intent: string) {
  switch (intent) {
    case "interested":
    case "meeting_request":
      return "success" as const;
    case "not_interested":
    case "unsubscribe":
      return "danger" as const;
    case "objection":
      return "warning" as const;
    default:
      return "default" as const;
  }
}

export function ReplySuggestions({
  content,
  contactId,
  channel,
  onUseReply,
  onActionClick,
}: ReplySuggestionsProps) {
  const [data, setData] = useState<ReplyAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editedReply, setEditedReply] = useState("");
  const [analyzed, setAnalyzed] = useState(false);

  async function analyze() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/analyze-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, contactId, channel }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to analyze reply");
      setData(json.data);
      setEditedReply(json.data.suggestedResponse);
      setAnalyzed(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  if (!analyzed) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-6">
          <Button onClick={analyze} disabled={loading}>
            {loading ? (
              <>
                <Spinner size="sm" /> Analyzing...
              </>
            ) : (
              "Analyze with AI"
            )}
          </Button>
          {error && <p className="ml-3 text-sm text-red-500">{error}</p>}
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">AI Reply Analysis</CardTitle>
          <Button size="sm" variant="outline" onClick={analyze} disabled={loading}>
            {loading ? <Spinner size="sm" /> : "Re-analyze"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Badges row */}
        <div className="flex flex-wrap gap-2">
          <Badge variant={sentimentVariant(data.sentiment)}>
            Sentiment: {data.sentiment}
          </Badge>
          <Badge variant={intentVariant(data.intent)}>
            Intent: {data.intent.replace(/_/g, " ")}
          </Badge>
          <Badge
            variant={
              data.urgency === "immediate"
                ? "danger"
                : data.urgency === "today"
                ? "warning"
                : "secondary"
            }
          >
            Urgency: {data.urgency.replace(/_/g, " ")}
          </Badge>
        </div>

        {/* Key Points */}
        {data.keyPoints.length > 0 && (
          <div>
            <h4 className="mb-1 text-xs font-semibold uppercase text-zinc-500 dark:text-zinc-400">
              Key Points
            </h4>
            <ul className="space-y-0.5">
              {data.keyPoints.map((point, i) => (
                <li key={i} className="text-sm text-zinc-700 dark:text-zinc-300">
                  - {point}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Suggested Response */}
        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase text-zinc-500 dark:text-zinc-400">
            Suggested Response
          </h4>
          <Textarea
            value={editedReply}
            onChange={(e) => setEditedReply(e.target.value)}
            rows={5}
          />
          {onUseReply && (
            <Button
              size="sm"
              className="mt-2"
              onClick={() => onUseReply(editedReply)}
              disabled={!editedReply.trim()}
            >
              Use This Reply
            </Button>
          )}
        </div>

        {/* Recommended Actions */}
        {data.recommendedActions.length > 0 && (
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase text-zinc-500 dark:text-zinc-400">
              Recommended Actions
            </h4>
            <div className="space-y-2">
              {data.recommendedActions.map((ra, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-md border border-zinc-200 p-2 dark:border-zinc-700"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {ra.action}
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      {ra.reason}
                    </p>
                  </div>
                  {onActionClick && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="ml-2 shrink-0"
                      onClick={() => onActionClick(ra.action)}
                    >
                      Execute
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
