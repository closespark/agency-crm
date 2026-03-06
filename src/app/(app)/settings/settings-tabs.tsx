"use client";

import { Tabs } from "@/components/ui/tabs";
import { ProfileForm } from "@/components/settings/profile-form";
import { TeamSettings } from "@/components/settings/team-settings";
import { UserManagement } from "@/components/settings/user-management";
import { AuditLog } from "@/components/settings/audit-log";
import { EmailSignatureSettings } from "@/components/settings/email-signature";

interface SettingsTabsProps {
  user: {
    id: string;
    name: string | null;
    email: string;
    role: string;
    teamId: string | null;
  };
}

export function SettingsTabs({ user }: SettingsTabsProps) {
  const isAdmin = user.role === "admin";

  const tabs = [
    {
      id: "profile",
      label: "Profile",
      content: (
        <ProfileForm user={{ id: user.id, name: user.name, email: user.email }} />
      ),
    },
    {
      id: "team",
      label: "Team",
      content: <TeamSettings userTeamId={user.teamId} isAdmin={isAdmin} />,
    },
    ...(isAdmin
      ? [
          {
            id: "email-signature",
            label: "Email Signature",
            content: <EmailSignatureSettings />,
          },
          {
            id: "users",
            label: "Users",
            content: <UserManagement />,
          },
          {
            id: "audit-log",
            label: "Audit Log",
            content: <AuditLog />,
          },
        ]
      : []),
  ];

  return <Tabs tabs={tabs} defaultTab="profile" />;
}
