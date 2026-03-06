import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";

export default async function DashboardPage() {
  const [contactCount, dealCount, openTickets, totalRevenue] = await Promise.all([
    prisma.contact.count(),
    prisma.deal.count(),
    prisma.ticket.count({ where: { status: { in: ["open", "pending", "in_progress"] } } }),
    prisma.deal.aggregate({ where: { stage: "closed_won" }, _sum: { amount: true } }),
  ]);

  const stats = [
    { label: "Total Contacts", value: contactCount.toLocaleString() },
    { label: "Active Deals", value: dealCount.toLocaleString() },
    { label: "Open Tickets", value: openTickets.toLocaleString() },
    { label: "Revenue (Won)", value: formatCurrency(totalRevenue._sum.amount || 0) },
  ];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Dashboard</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-zinc-500">{stat.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
