"use client";

import { Tabs } from "@/components/ui/tabs";
import { ContactAITab } from "@/components/ai/contact-ai-tab";

interface ContactDetailTabsProps {
  overviewTab: React.ReactNode;
  activitiesTab: React.ReactNode;
  dealsTab: React.ReactNode;
  tasksTab: React.ReactNode;
  ticketsTab: React.ReactNode;
  activityCount: number;
  dealCount: number;
  taskCount: number;
  ticketCount: number;
  contactId: string;
}

export default function ContactDetailTabs({
  overviewTab,
  activitiesTab,
  dealsTab,
  tasksTab,
  ticketsTab,
  activityCount,
  dealCount,
  taskCount,
  ticketCount,
  contactId,
}: ContactDetailTabsProps) {
  const tabs = [
    {
      id: "overview",
      label: "Overview",
      content: overviewTab,
    },
    {
      id: "ai",
      label: "AI Analysis",
      content: <ContactAITab contactId={contactId} />,
    },
    {
      id: "activities",
      label: `Activities (${activityCount})`,
      content: activitiesTab,
    },
    {
      id: "deals",
      label: `Deals (${dealCount})`,
      content: dealsTab,
    },
    {
      id: "tasks",
      label: `Tasks (${taskCount})`,
      content: tasksTab,
    },
    {
      id: "tickets",
      label: `Tickets (${ticketCount})`,
      content: ticketsTab,
    },
  ];

  return <Tabs tabs={tabs} defaultTab="overview" />;
}
