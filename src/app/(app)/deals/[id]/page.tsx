import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatDate, formatDateTime, formatCurrency, parseJSON } from "@/lib/utils";
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
import DealDetailTabs from "./deal-detail-tabs";
import DealActions from "./deal-actions";

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

function getQuoteStatusVariant(status: string) {
  switch (status) {
    case "signed":
      return "success" as const;
    case "declined":
      return "danger" as const;
    case "sent":
      return "warning" as const;
    default:
      return "secondary" as const;
  }
}

export default async function DealDetailPage({ params }: Props) {
  const { id } = await params;

  const deal = await prisma.deal.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, name: true, email: true, image: true } },
      contact: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
        },
      },
      company: { select: { id: true, name: true, domain: true } },
      activities: {
        include: {
          user: { select: { id: true, name: true, image: true } },
        },
        orderBy: { createdAt: "desc" },
      },
      quotes: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!deal) {
    notFound();
  }

  const overviewTab = (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Deal Details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="space-y-3">
            <div className="flex justify-between">
              <dt className="text-sm text-zinc-500">Amount</dt>
              <dd className="text-sm font-medium">
                {deal.amount
                  ? formatCurrency(deal.amount, deal.currency)
                  : "-"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-sm text-zinc-500">Stage</dt>
              <dd>
                <Badge variant={getStageBadgeVariant(deal.stage)}>
                  {deal.stage.replace("_", " ")}
                </Badge>
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-sm text-zinc-500">Pipeline</dt>
              <dd className="text-sm font-medium">{deal.pipeline}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-sm text-zinc-500">Probability</dt>
              <dd className="text-sm font-medium">
                {deal.probability !== null ? `${deal.probability}%` : "-"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-sm text-zinc-500">Close Date</dt>
              <dd className="text-sm font-medium">
                {deal.closeDate ? formatDate(deal.closeDate) : "-"}
              </dd>
            </div>
            {deal.lostReason && (
              <div className="flex justify-between">
                <dt className="text-sm text-zinc-500">Lost Reason</dt>
                <dd className="text-sm font-medium">{deal.lostReason}</dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Associations</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="space-y-3">
            <div className="flex justify-between">
              <dt className="text-sm text-zinc-500">Contact</dt>
              <dd className="text-sm font-medium">
                {deal.contact ? (
                  <a
                    href={`/contacts/${deal.contact.id}`}
                    className="text-blue-600 hover:underline"
                  >
                    {deal.contact.firstName} {deal.contact.lastName}
                  </a>
                ) : (
                  "-"
                )}
              </dd>
            </div>
            {deal.contact?.email && (
              <div className="flex justify-between">
                <dt className="text-sm text-zinc-500">Contact Email</dt>
                <dd className="text-sm font-medium">{deal.contact.email}</dd>
              </div>
            )}
            {deal.contact?.phone && (
              <div className="flex justify-between">
                <dt className="text-sm text-zinc-500">Contact Phone</dt>
                <dd className="text-sm font-medium">{deal.contact.phone}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-sm text-zinc-500">Company</dt>
              <dd className="text-sm font-medium">
                {deal.company ? (
                  <a
                    href={`/companies/${deal.company.id}`}
                    className="text-blue-600 hover:underline"
                  >
                    {deal.company.name}
                  </a>
                ) : (
                  "-"
                )}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-sm text-zinc-500">Owner</dt>
              <dd className="text-sm font-medium">
                {deal.owner?.name || "-"}
              </dd>
            </div>
            <div className="border-t border-zinc-200 pt-3 dark:border-zinc-800" />
            <div className="flex justify-between">
              <dt className="text-sm text-zinc-500">Created</dt>
              <dd className="text-sm font-medium">
                {formatDateTime(deal.createdAt)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-sm text-zinc-500">Last Updated</dt>
              <dd className="text-sm font-medium">
                {formatDateTime(deal.updatedAt)}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  );

  const activitiesTab = (
    <div>
      {deal.activities.length === 0 ? (
        <EmptyState
          title="No activities yet"
          description="Log a call, email, meeting, or note for this deal."
        />
      ) : (
        <div className="space-y-4">
          {deal.activities.map((activity) => (
            <Card key={activity.id}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Avatar
                    name={activity.user?.name || "User"}
                    src={activity.user?.image}
                    size="sm"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {activity.user?.name || "Unknown"}
                      </span>
                      <Badge variant="secondary">{activity.type}</Badge>
                      <span className="text-xs text-zinc-400">
                        {formatDateTime(activity.createdAt)}
                      </span>
                    </div>
                    {activity.subject && (
                      <p className="mt-1 text-sm font-medium">
                        {activity.subject}
                      </p>
                    )}
                    {activity.body && (
                      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                        {activity.body}
                      </p>
                    )}
                    <div className="mt-1 flex gap-3 text-xs text-zinc-400">
                      {activity.outcome && (
                        <span>Outcome: {activity.outcome}</span>
                      )}
                      {activity.duration && (
                        <span>
                          Duration: {Math.round(activity.duration / 60)}m
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );

  const quotesTab = (
    <div>
      {deal.quotes.length === 0 ? (
        <EmptyState
          title="No quotes"
          description="No quotes have been created for this deal."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Quote Name</TableHead>
              <TableHead>Subtotal</TableHead>
              <TableHead>Discount</TableHead>
              <TableHead>Tax</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Expires</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {deal.quotes.map((quote) => {
              return (
                <TableRow key={quote.id}>
                  <TableCell className="font-medium">{quote.name}</TableCell>
                  <TableCell>{formatCurrency(quote.subtotal)}</TableCell>
                  <TableCell>{formatCurrency(quote.discount)}</TableCell>
                  <TableCell>{formatCurrency(quote.tax)}</TableCell>
                  <TableCell className="font-medium">
                    {formatCurrency(quote.total)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={getQuoteStatusVariant(quote.status)}>
                      {quote.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {quote.expiresAt ? formatDate(quote.expiresAt) : "-"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
              {deal.name}
            </h1>
            <Badge variant={getStageBadgeVariant(deal.stage)}>
              {deal.stage.replace("_", " ")}
            </Badge>
          </div>
          <div className="mt-1 flex items-center gap-3 text-sm text-zinc-500">
            {deal.amount && (
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                {formatCurrency(deal.amount, deal.currency)}
              </span>
            )}
            {deal.contact && (
              <span>
                {deal.contact.firstName} {deal.contact.lastName}
              </span>
            )}
            {deal.company && <span>{deal.company.name}</span>}
          </div>
        </div>
        <DealActions dealId={deal.id} />
      </div>

      <DealDetailTabs
        overviewTab={overviewTab}
        activitiesTab={activitiesTab}
        quotesTab={quotesTab}
        activityCount={deal.activities.length}
        quoteCount={deal.quotes.length}
        dealId={deal.id}
      />
    </div>
  );
}
