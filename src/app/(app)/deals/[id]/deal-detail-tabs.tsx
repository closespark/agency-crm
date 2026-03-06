"use client";

import { Tabs } from "@/components/ui/tabs";
import { DealAITab } from "@/components/ai/deal-ai-tab";

interface DealDetailTabsProps {
  overviewTab: React.ReactNode;
  activitiesTab: React.ReactNode;
  quotesTab: React.ReactNode;
  activityCount: number;
  quoteCount: number;
  dealId: string;
}

export default function DealDetailTabs({
  overviewTab,
  activitiesTab,
  quotesTab,
  activityCount,
  quoteCount,
  dealId,
}: DealDetailTabsProps) {
  const tabs = [
    {
      id: "overview",
      label: "Overview",
      content: overviewTab,
    },
    {
      id: "ai",
      label: "AI Analysis",
      content: <DealAITab dealId={dealId} />,
    },
    {
      id: "activities",
      label: `Activities (${activityCount})`,
      content: activitiesTab,
    },
    {
      id: "quotes",
      label: `Quotes (${quoteCount})`,
      content: quotesTab,
    },
  ];

  return <Tabs tabs={tabs} defaultTab="overview" />;
}
