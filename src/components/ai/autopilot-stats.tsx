"use client";

import { Card, CardContent } from "@/components/ui/card";
import {
  Users,
  MessageSquare,
  TrendingUp,
  Lightbulb,
  Zap,
  CalendarCheck,
} from "lucide-react";

interface AutopilotStatsProps {
  stats: {
    contactsScored: number;
    repliesAnalyzed: number;
    dealsAnalyzed: number;
    insightsGenerated: number;
    sequenceStepsExecuted: number;
    meetingsBooked: number;
  } | null;
  loading?: boolean;
}

const statItems = [
  { key: "contactsScored", label: "Contacts Scored", icon: Users, color: "text-blue-600 bg-blue-100 dark:bg-blue-900/50" },
  { key: "repliesAnalyzed", label: "Replies Analyzed", icon: MessageSquare, color: "text-green-600 bg-green-100 dark:bg-green-900/50" },
  { key: "dealsAnalyzed", label: "Deals Analyzed", icon: TrendingUp, color: "text-purple-600 bg-purple-100 dark:bg-purple-900/50" },
  { key: "insightsGenerated", label: "Insights Generated", icon: Lightbulb, color: "text-yellow-600 bg-yellow-100 dark:bg-yellow-900/50" },
  { key: "sequenceStepsExecuted", label: "Sequence Steps", icon: Zap, color: "text-orange-600 bg-orange-100 dark:bg-orange-900/50" },
  { key: "meetingsBooked", label: "Meetings Booked", icon: CalendarCheck, color: "text-teal-600 bg-teal-100 dark:bg-teal-900/50" },
] as const;

export function AutopilotStats({ stats, loading }: AutopilotStatsProps) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
      {statItems.map((item) => {
        const Icon = item.icon;
        const value = stats ? stats[item.key] : 0;
        return (
          <Card key={item.key}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`rounded-lg p-2 ${item.color}`}>
                  <Icon size={18} />
                </div>
                <div className="min-w-0">
                  {loading ? (
                    <div className="h-6 w-12 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
                  ) : (
                    <p className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
                      {value.toLocaleString()}
                    </p>
                  )}
                  <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                    {item.label}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
