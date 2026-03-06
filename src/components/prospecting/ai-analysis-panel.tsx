"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { parseJSON } from "@/lib/utils";

interface AIAnalysis {
  fitReasoning?: string;
  painPoints?: string[];
  talkingPoints?: string[];
  outreachAngle?: string;
  companyInsights?: string;
  competitorMentions?: string[];
  recommendations?: string[];
}

interface AIAnalysisPanelProps {
  analysis: string | null | undefined;
}

export function AIAnalysisPanel({ analysis }: AIAnalysisPanelProps) {
  const data = parseJSON<AIAnalysis>(analysis, {});

  if (!analysis || Object.keys(data).length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>AI Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No AI analysis available. Enrich this prospect to generate insights.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {data.fitReasoning && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Fit Reasoning</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-zinc-700 dark:text-zinc-300">{data.fitReasoning}</p>
          </CardContent>
        </Card>
      )}

      {data.painPoints && data.painPoints.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pain Points</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {data.painPoints.map((point, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-red-400" />
                  {point}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {data.talkingPoints && data.talkingPoints.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Talking Points</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {data.talkingPoints.map((point, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-400" />
                  {point}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {data.outreachAngle && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Outreach Angle</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-zinc-700 dark:text-zinc-300">{data.outreachAngle}</p>
          </CardContent>
        </Card>
      )}

      {data.companyInsights && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Company Insights</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-zinc-700 dark:text-zinc-300">{data.companyInsights}</p>
          </CardContent>
        </Card>
      )}

      {data.competitorMentions && data.competitorMentions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Competitor Mentions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {data.competitorMentions.map((comp, i) => (
                <Badge key={i} variant="secondary">{comp}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {data.recommendations && data.recommendations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recommendations</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {data.recommendations.map((rec, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-green-400" />
                  {rec}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
