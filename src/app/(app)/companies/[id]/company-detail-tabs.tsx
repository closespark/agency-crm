"use client";

import { Tabs } from "@/components/ui/tabs";

interface CompanyDetailTabsProps {
  overviewTab: React.ReactNode;
  contactsTab: React.ReactNode;
  dealsTab: React.ReactNode;
  contactCount: number;
  dealCount: number;
}

export default function CompanyDetailTabs({
  overviewTab,
  contactsTab,
  dealsTab,
  contactCount,
  dealCount,
}: CompanyDetailTabsProps) {
  const tabs = [
    {
      id: "overview",
      label: "Overview",
      content: overviewTab,
    },
    {
      id: "contacts",
      label: `Contacts (${contactCount})`,
      content: contactsTab,
    },
    {
      id: "deals",
      label: `Deals (${dealCount})`,
      content: dealsTab,
    },
  ];

  return <Tabs tabs={tabs} defaultTab="overview" />;
}
