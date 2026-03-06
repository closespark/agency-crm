"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { parseJSON } from "@/lib/utils";
import { formatDate } from "@/lib/utils";
import {
  AlertTriangle,
  TrendingUp,
  UserX,
  TrendingDown,
  Flame,
  Calendar,
  Check,
  X,
  Eye,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";

interface ActionItem {
  action: string;
  priority: string;
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

interface InsightCardProps {
  insight: InsightData;
  onUpdateStatus: (id: string, status: string) => void;
}

const typeConfig: Record<string, { icon: typeof AlertTriangle; label: string; color: string }> = {
  deal_risk: { icon: AlertTriangle, label: "Deal Risk", color: "text-red-600" },
  upsell_opportunity: { icon: TrendingUp, label: "Upsell", color: "text-green-600" },
  churn_warning: { icon: UserX, label: "Churn Warning", color: "text-orange-600" },
  engagement_drop: { icon: TrendingDown, label: "Engagement Drop", color: "text-yellow-600" },
  hot_lead: { icon: Flame, label: "Hot Lead", color: "text-red-500" },
  meeting_suggestion: { icon: Calendar, label: "Meeting", color: "text-blue-600" },
};

const priorityVariant: Record<string, "danger" | "warning" | "default" | "secondary"> = {
  critical: "danger",
  high: "danger",
  medium: "warning",
  low: "secondary",
};

function getResourceLink(resourceType: string, resourceId: string): string {
  switch (resourceType) {
    case "contact":
      return `/contacts/${resourceId}`;
    case "deal":
      return `/deals/${resourceId}`;
    case "company":
      return `/companies/${resourceId}`;
    default:
      return "#";
  }
}

export function InsightCard({ insight, onUpdateStatus }: InsightCardProps) {
  const config = typeConfig[insight.type] || typeConfig.deal_risk;
  const Icon = config.icon;
  const actions = parseJSON<ActionItem[]>(insight.actionItems, []);

  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 ${config.color}`}>
            <Icon size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    {insight.title}
                  </h3>
                  <Badge variant={priorityVariant[insight.priority] || "secondary"}>
                    {insight.priority}
                  </Badge>
                  <Badge variant="secondary">{config.label}</Badge>
                </div>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  {insight.description}
                </p>
              </div>
              <span className="shrink-0 text-xs text-zinc-400">
                {formatDate(insight.createdAt)}
              </span>
            </div>

            {actions.length > 0 && (
              <div className="mt-2 space-y-1">
                {actions.map((item, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400"
                  >
                    <span className="inline-block h-1 w-1 rounded-full bg-zinc-400" />
                    <span>{item.action}</span>
                    {item.priority && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {item.priority}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="mt-3 flex items-center gap-2">
              {insight.status === "new" && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onUpdateStatus(insight.id, "acknowledged")}
                  >
                    <Eye size={14} />
                    Acknowledge
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => onUpdateStatus(insight.id, "acted_on")}
                  >
                    <Check size={14} />
                    Act
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onUpdateStatus(insight.id, "dismissed")}
                  >
                    <X size={14} />
                    Dismiss
                  </Button>
                </>
              )}
              {insight.status === "acknowledged" && (
                <>
                  <Button
                    size="sm"
                    onClick={() => onUpdateStatus(insight.id, "acted_on")}
                  >
                    <Check size={14} />
                    Act
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onUpdateStatus(insight.id, "dismissed")}
                  >
                    <X size={14} />
                    Dismiss
                  </Button>
                </>
              )}
              {(insight.status === "acted_on" || insight.status === "dismissed") && (
                <Badge variant={insight.status === "acted_on" ? "success" : "secondary"}>
                  {insight.status === "acted_on" ? "Acted On" : "Dismissed"}
                </Badge>
              )}
              <Link
                href={getResourceLink(insight.resourceType, insight.resourceId)}
                className="ml-auto flex items-center gap-1 text-xs text-blue-600 hover:underline"
              >
                View {insight.resourceType}
                <ExternalLink size={12} />
              </Link>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
