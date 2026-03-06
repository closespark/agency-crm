import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/shared/page-header";
import { SettingsTabs } from "./settings-tabs";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      teamId: true,
    },
  });

  if (!user) {
    redirect("/login");
  }

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Manage your account, team, and organization settings."
      />
      <SettingsTabs user={user} />
    </div>
  );
}
