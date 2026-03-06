import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatDate, formatCurrency } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/loading";
import CompanyDetailTabs from "./company-detail-tabs";
import CompanyActions from "./company-actions";

interface Props {
  params: Promise<{ id: string }>;
}

function getStageBadgeVariant(stage: string) {
  switch (stage) {
    case "closed_won":
      return "success" as const;
    case "closed_lost":
      return "danger" as const;
    case "proposal_sent":
    case "negotiation":
    case "contract_sent":
      return "warning" as const;
    default:
      return "default" as const;
  }
}

export default async function CompanyDetailPage({ params }: Props) {
  const { id } = await params;

  const company = await prisma.company.findUnique({
    where: { id },
    include: {
      contacts: {
        include: {
          owner: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
      },
      deals: {
        include: {
          owner: { select: { id: true, name: true } },
          contact: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { createdAt: "desc" },
      },
      tickets: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!company) {
    notFound();
  }

  const totalDealValue = company.deals.reduce(
    (sum, deal) => sum + (deal.amount || 0),
    0
  );
  const openDeals = company.deals.filter(
    (d) => d.stage !== "closed_won" && d.stage !== "closed_lost"
  );

  const overviewTab = (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Company Details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="space-y-3">
            <div className="flex justify-between">
              <dt className="text-sm text-zinc-500">Domain</dt>
              <dd className="text-sm font-medium">
                {company.domain ? (
                  <a
                    href={`https://${company.domain}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    {company.domain}
                  </a>
                ) : (
                  "-"
                )}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-sm text-zinc-500">Industry</dt>
              <dd className="text-sm font-medium">{company.industry || "-"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-sm text-zinc-500">Size</dt>
              <dd className="text-sm font-medium">
                {company.size ? `${company.size} employees` : "-"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-sm text-zinc-500">Revenue</dt>
              <dd className="text-sm font-medium">
                {company.revenue ? formatCurrency(company.revenue) : "-"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-sm text-zinc-500">Phone</dt>
              <dd className="text-sm font-medium">{company.phone || "-"}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Location & Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="space-y-3">
            <div className="flex justify-between">
              <dt className="text-sm text-zinc-500">Address</dt>
              <dd className="text-sm font-medium">{company.address || "-"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-sm text-zinc-500">City</dt>
              <dd className="text-sm font-medium">{company.city || "-"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-sm text-zinc-500">State</dt>
              <dd className="text-sm font-medium">{company.state || "-"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-sm text-zinc-500">Country</dt>
              <dd className="text-sm font-medium">{company.country || "-"}</dd>
            </div>
            <div className="border-t border-zinc-200 pt-3 dark:border-zinc-800" />
            <div className="flex justify-between">
              <dt className="text-sm text-zinc-500">Total Contacts</dt>
              <dd className="text-sm font-medium">{company.contacts.length}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-sm text-zinc-500">Open Deals</dt>
              <dd className="text-sm font-medium">{openDeals.length}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-sm text-zinc-500">Total Deal Value</dt>
              <dd className="text-sm font-medium">
                {formatCurrency(totalDealValue)}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {company.description && (
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Description</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {company.description}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );

  const contactsTab = (
    <div>
      {company.contacts.length === 0 ? (
        <EmptyState
          title="No contacts"
          description="No contacts associated with this company."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Job Title</TableHead>
              <TableHead>Lifecycle Stage</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {company.contacts.map((contact) => (
              <TableRow key={contact.id}>
                <TableCell>
                  <a
                    href={`/contacts/${contact.id}`}
                    className="flex items-center gap-2 font-medium text-blue-600 hover:underline"
                  >
                    <Avatar
                      name={`${contact.firstName} ${contact.lastName}`}
                      size="sm"
                    />
                    {contact.firstName} {contact.lastName}
                  </a>
                </TableCell>
                <TableCell>{contact.email || "-"}</TableCell>
                <TableCell>{contact.jobTitle || "-"}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{contact.lifecycleStage}</Badge>
                </TableCell>
                <TableCell>{contact.owner?.name || "-"}</TableCell>
                <TableCell>{formatDate(contact.createdAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );

  const dealsTab = (
    <div>
      {company.deals.length === 0 ? (
        <EmptyState
          title="No deals"
          description="No deals associated with this company."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Deal Name</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Close Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {company.deals.map((deal) => (
              <TableRow key={deal.id}>
                <TableCell>
                  <a
                    href={`/deals/${deal.id}`}
                    className="font-medium text-blue-600 hover:underline"
                  >
                    {deal.name}
                  </a>
                </TableCell>
                <TableCell>
                  {deal.contact
                    ? `${deal.contact.firstName} ${deal.contact.lastName}`
                    : "-"}
                </TableCell>
                <TableCell>
                  {deal.amount
                    ? formatCurrency(deal.amount, deal.currency)
                    : "-"}
                </TableCell>
                <TableCell>
                  <Badge variant={getStageBadgeVariant(deal.stage)}>
                    {deal.stage.replace("_", " ")}
                  </Badge>
                </TableCell>
                <TableCell>{deal.owner?.name || "-"}</TableCell>
                <TableCell>
                  {deal.closeDate ? formatDate(deal.closeDate) : "-"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            {company.name}
          </h1>
          <div className="mt-1 flex items-center gap-3 text-sm text-zinc-500">
            {company.domain && <span>{company.domain}</span>}
            {company.industry && (
              <Badge variant="secondary">{company.industry}</Badge>
            )}
            {company.size && <span>{company.size} employees</span>}
          </div>
        </div>
        <CompanyActions companyId={company.id} />
      </div>

      <CompanyDetailTabs
        overviewTab={overviewTab}
        contactsTab={contactsTab}
        dealsTab={dealsTab}
        contactCount={company.contacts.length}
        dealCount={company.deals.length}
      />
    </div>
  );
}
