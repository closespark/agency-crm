import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";

export default async function MarketingHubPage() {
  const [
    campaignCount,
    activeCampaigns,
    templateCount,
    formCount,
    totalSubmissions,
    activeWorkflows,
    totalWorkflows,
    listCount,
    sequenceCount,
  ] = await Promise.all([
    prisma.campaign.count(),
    prisma.campaign.count({ where: { status: "active" } }),
    prisma.emailTemplate.count(),
    prisma.form.count(),
    prisma.formSubmission.count(),
    prisma.workflow.count({ where: { isActive: true } }),
    prisma.workflow.count(),
    prisma.contactList.count(),
    prisma.sequence.count(),
  ]);

  const sections = [
    {
      title: "Campaigns",
      href: "/marketing/campaigns",
      description: "Create and manage marketing campaigns",
      stats: [
        { label: "Total", value: campaignCount },
        { label: "Active", value: activeCampaigns },
      ],
    },
    {
      title: "Email Templates",
      href: "/marketing/templates",
      description: "Design reusable email templates",
      stats: [{ label: "Templates", value: templateCount }],
    },
    {
      title: "Forms",
      href: "/marketing/forms",
      description: "Build forms to capture leads",
      stats: [
        { label: "Forms", value: formCount },
        { label: "Submissions", value: totalSubmissions },
      ],
    },
    {
      title: "Workflows",
      href: "/marketing/workflows",
      description: "Automate marketing processes",
      stats: [
        { label: "Total", value: totalWorkflows },
        { label: "Active", value: activeWorkflows },
      ],
    },
    {
      title: "Contact Lists",
      href: "/marketing/lists",
      description: "Organize contacts into targeted lists",
      stats: [{ label: "Lists", value: listCount }],
    },
    {
      title: "Sequences",
      href: "/marketing/sequences",
      description: "Set up automated email sequences",
      stats: [{ label: "Sequences", value: sequenceCount }],
    },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
          Marketing Hub
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Manage campaigns, templates, forms, workflows, and contact lists
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map((section) => (
          <Link key={section.title} href={section.href}>
            <Card className="h-full transition-shadow hover:shadow-md">
              <CardHeader>
                <CardTitle>{section.title}</CardTitle>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  {section.description}
                </p>
              </CardHeader>
              <CardContent>
                <div className="flex gap-6">
                  {section.stats.map((stat) => (
                    <div key={stat.label}>
                      <p className="text-2xl font-bold">{stat.value}</p>
                      <p className="text-xs text-zinc-500">{stat.label}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
