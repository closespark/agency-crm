import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatDate, formatDateTime, formatCurrency, parseJSON } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/loading";
import ContactDetailTabs from "./contact-detail-tabs";
import ContactActions from "./contact-actions";

interface Props {
  params: Promise<{ id: string }>;
}

function getLifecycleBadgeVariant(stage: string) {
  switch (stage) {
    case "customer":
    case "evangelist":
      return "success" as const;
    case "opportunity":
    case "sql":
      return "warning" as const;
    case "mql":
      return "default" as const;
    default:
      return "secondary" as const;
  }
}

function getActivityIcon(type: string) {
  switch (type) {
    case "email":
      return "Mail";
    case "call":
      return "Phone";
    case "meeting":
      return "Calendar";
    case "note":
      return "FileText";
    case "task":
      return "CheckSquare";
    default:
      return "Activity";
  }
}

function getPriorityVariant(priority: string) {
  switch (priority) {
    case "urgent":
      return "danger" as const;
    case "high":
      return "warning" as const;
    case "medium":
      return "default" as const;
    default:
      return "secondary" as const;
  }
}

function getStatusVariant(status: string) {
  switch (status) {
    case "completed":
    case "resolved":
    case "closed":
      return "success" as const;
    case "in_progress":
    case "pending":
      return "warning" as const;
    case "open":
      return "danger" as const;
    default:
      return "secondary" as const;
  }
}

export default async function ContactDetailPage({ params }: Props) {
  const { id } = await params;

  const contact = await prisma.contact.findUnique({
    where: { id },
    include: {
      company: true,
      owner: { select: { id: true, name: true, email: true, image: true } },
      deals: {
        include: {
          owner: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
      },
      activities: {
        include: {
          user: { select: { id: true, name: true, image: true } },
        },
        orderBy: { createdAt: "desc" },
      },
      tasks: {
        include: {
          user: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
      },
      tickets: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!contact) {
    notFound();
  }

  const customFields = parseJSON<Record<string, string>>(contact.customFields, {});
  const fullName = `${contact.firstName} ${contact.lastName}`;

  const overviewTab = (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="space-y-3">
            <div className="flex justify-between">
              <dt className="text-sm text-zinc-500">Email</dt>
              <dd className="text-sm font-medium">{contact.email || "-"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-sm text-zinc-500">Phone</dt>
              <dd className="text-sm font-medium">{contact.phone || "-"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-sm text-zinc-500">Job Title</dt>
              <dd className="text-sm font-medium">{contact.jobTitle || "-"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-sm text-zinc-500">Company</dt>
              <dd className="text-sm font-medium">
                {contact.company ? (
                  <a
                    href={`/companies/${contact.company.id}`}
                    className="text-blue-600 hover:underline"
                  >
                    {contact.company.name}
                  </a>
                ) : (
                  "-"
                )}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-sm text-zinc-500">Owner</dt>
              <dd className="text-sm font-medium">
                {contact.owner?.name || "-"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-sm text-zinc-500">Source</dt>
              <dd className="text-sm font-medium">{contact.source || "-"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-sm text-zinc-500">Lead Score</dt>
              <dd className="text-sm font-medium">{contact.leadScore}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Dates & Custom Fields</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="space-y-3">
            <div className="flex justify-between">
              <dt className="text-sm text-zinc-500">Created</dt>
              <dd className="text-sm font-medium">
                {formatDateTime(contact.createdAt)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-sm text-zinc-500">Last Updated</dt>
              <dd className="text-sm font-medium">
                {formatDateTime(contact.updatedAt)}
              </dd>
            </div>
            {Object.entries(customFields).length > 0 && (
              <>
                <div className="border-t border-zinc-200 pt-3 dark:border-zinc-800">
                  <p className="text-xs font-semibold uppercase text-zinc-400">
                    Custom Fields
                  </p>
                </div>
                {Object.entries(customFields).map(([key, value]) => (
                  <div key={key} className="flex justify-between">
                    <dt className="text-sm text-zinc-500">{key}</dt>
                    <dd className="text-sm font-medium">{value}</dd>
                  </div>
                ))}
              </>
            )}
          </dl>
        </CardContent>
      </Card>
    </div>
  );

  const activitiesTab = (
    <div>
      {contact.activities.length === 0 ? (
        <EmptyState
          title="No activities yet"
          description="Log a call, email, meeting, or note for this contact."
        />
      ) : (
        <div className="space-y-4">
          {contact.activities.map((activity) => (
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
                      <Badge variant="secondary">{getActivityIcon(activity.type)} {activity.type}</Badge>
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

  const dealsTab = (
    <div>
      {contact.deals.length === 0 ? (
        <EmptyState
          title="No deals"
          description="No deals associated with this contact."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Deal Name</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Close Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contact.deals.map((deal) => (
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
                  {deal.amount ? formatCurrency(deal.amount, deal.currency) : "-"}
                </TableCell>
                <TableCell>
                  <Badge variant="default">{deal.stage.replace("_", " ")}</Badge>
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

  const tasksTab = (
    <div>
      {contact.tasks.length === 0 ? (
        <EmptyState
          title="No tasks"
          description="No tasks associated with this contact."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Assigned To</TableHead>
              <TableHead>Due Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contact.tasks.map((task) => (
              <TableRow key={task.id}>
                <TableCell className="font-medium">{task.title}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{task.type}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={getPriorityVariant(task.priority)}>
                    {task.priority}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={getStatusVariant(task.status)}>
                    {task.status.replace("_", " ")}
                  </Badge>
                </TableCell>
                <TableCell>{task.user?.name || "-"}</TableCell>
                <TableCell>
                  {task.dueDate ? formatDate(task.dueDate) : "-"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );

  const ticketsTab = (
    <div>
      {contact.tickets.length === 0 ? (
        <EmptyState
          title="No tickets"
          description="No support tickets for this contact."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Subject</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contact.tickets.map((ticket) => (
              <TableRow key={ticket.id}>
                <TableCell className="font-medium">{ticket.subject}</TableCell>
                <TableCell>
                  <Badge variant={getStatusVariant(ticket.status)}>
                    {ticket.status.replace("_", " ")}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={getPriorityVariant(ticket.priority)}>
                    {ticket.priority}
                  </Badge>
                </TableCell>
                <TableCell>{ticket.category || "-"}</TableCell>
                <TableCell>{formatDate(ticket.createdAt)}</TableCell>
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
        <div className="flex items-center gap-4">
          <Avatar name={fullName} size="lg" />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                {fullName}
              </h1>
              <Badge variant={getLifecycleBadgeVariant(contact.lifecycleStage)}>
                {contact.lifecycleStage}
              </Badge>
              {contact.leadStatus && (
                <Badge variant="outline">
                  {contact.leadStatus.replace("_", " ")}
                </Badge>
              )}
            </div>
            <div className="mt-1 flex items-center gap-3 text-sm text-zinc-500">
              {contact.email && <span>{contact.email}</span>}
              {contact.phone && <span>{contact.phone}</span>}
              {contact.jobTitle && <span>{contact.jobTitle}</span>}
            </div>
          </div>
        </div>
        <ContactActions contactId={contact.id} />
      </div>

      <ContactDetailTabs
        overviewTab={overviewTab}
        activitiesTab={activitiesTab}
        dealsTab={dealsTab}
        tasksTab={tasksTab}
        ticketsTab={ticketsTab}
        activityCount={contact.activities.length}
        dealCount={contact.deals.length}
        taskCount={contact.tasks.length}
        ticketCount={contact.tickets.length}
        contactId={contact.id}
      />
    </div>
  );
}
