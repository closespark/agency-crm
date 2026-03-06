"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Avatar } from "@/components/ui/avatar";
import { formatDateTime } from "@/lib/utils";
import { api } from "@/lib/api";
import {
  Clock,
  AlertTriangle,
  Building2,
  User,
  Mail,
  Phone,
  MessageSquare,
  Lock,
  Globe,
} from "lucide-react";

interface TicketContact {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone?: string | null;
}

interface TicketCompany {
  id: string;
  name: string;
  domain?: string | null;
}

interface CommentUser {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
}

interface TicketComment {
  id: string;
  body: string;
  isPublic: boolean;
  createdAt: string;
  user: CommentUser;
}

interface TicketData {
  id: string;
  subject: string;
  description: string | null;
  status: string;
  priority: string;
  category: string | null;
  pipeline: string;
  contactId: string | null;
  companyId: string | null;
  assigneeId: string | null;
  slaDeadline: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  contact: TicketContact | null;
  company: TicketCompany | null;
  comments: TicketComment[];
}

interface TicketDetailProps {
  ticket: TicketData;
}

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "success" | "warning" | "danger" | "secondary" }> = {
  open: { label: "Open", variant: "default" },
  pending: { label: "Pending", variant: "warning" },
  in_progress: { label: "In Progress", variant: "default" },
  resolved: { label: "Resolved", variant: "success" },
  closed: { label: "Closed", variant: "secondary" },
};

const PRIORITY_CONFIG: Record<string, { label: string; variant: "default" | "success" | "warning" | "danger" | "secondary"; icon: boolean }> = {
  low: { label: "Low", variant: "secondary", icon: false },
  medium: { label: "Medium", variant: "default", icon: false },
  high: { label: "High", variant: "warning", icon: true },
  urgent: { label: "Urgent", variant: "danger", icon: true },
};

const STATUS_TRANSITIONS: Record<string, string[]> = {
  open: ["in_progress"],
  pending: ["in_progress", "open"],
  in_progress: ["resolved", "pending"],
  resolved: ["closed", "in_progress"],
  closed: [],
};

function getSlaStatus(deadline: string | null): { label: string; overdue: boolean; className: string } | null {
  if (!deadline) return null;
  const now = new Date();
  const sla = new Date(deadline);
  const diff = sla.getTime() - now.getTime();

  if (diff < 0) {
    return { label: "SLA Overdue", overdue: true, className: "text-red-600 bg-red-50 border-red-200" };
  }

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (hours < 1) {
    return { label: `SLA due in ${minutes}m`, overdue: false, className: "text-amber-600 bg-amber-50 border-amber-200" };
  }
  if (hours < 4) {
    return { label: `SLA due in ${hours}h ${minutes}m`, overdue: false, className: "text-amber-600 bg-amber-50 border-amber-200" };
  }

  return { label: `SLA due in ${hours}h`, overdue: false, className: "text-green-600 bg-green-50 border-green-200" };
}

export function TicketDetail({ ticket: initialTicket }: TicketDetailProps) {
  const router = useRouter();
  const [ticket, setTicket] = useState<TicketData>(initialTicket);
  const [commentBody, setCommentBody] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const statusConfig = STATUS_CONFIG[ticket.status] || STATUS_CONFIG.open;
  const priorityConfig = PRIORITY_CONFIG[ticket.priority] || PRIORITY_CONFIG.medium;
  const slaStatus = getSlaStatus(ticket.slaDeadline);
  const transitions = STATUS_TRANSITIONS[ticket.status] || [];

  async function handleStatusChange(newStatus: string) {
    setUpdatingStatus(true);
    try {
      const res = await api.put<TicketData>(`/tickets/${ticket.id}`, { status: newStatus });
      if (res.data) {
        setTicket(res.data);
      }
    } finally {
      setUpdatingStatus(false);
    }
  }

  async function handleAddComment() {
    if (!commentBody.trim()) return;
    setSubmitting(true);
    try {
      const res = await api.post<TicketComment>(`/tickets/${ticket.id}/comments`, {
        body: commentBody,
        isPublic,
      });
      if (res.data) {
        setTicket((prev) => ({
          ...prev,
          comments: [...prev.comments, res.data!],
        }));
        setCommentBody("");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* Main Content */}
      <div className="lg:col-span-2 space-y-6">
        {/* Ticket Header */}
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <CardTitle className="text-xl">{ticket.subject}</CardTitle>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
                  <Badge variant={priorityConfig.variant}>
                    {priorityConfig.icon && <AlertTriangle className="mr-1 h-3 w-3" />}
                    {priorityConfig.label}
                  </Badge>
                  {ticket.category && (
                    <Badge variant="outline">{ticket.category}</Badge>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {transitions.map((status) => {
                  const config = STATUS_CONFIG[status];
                  return (
                    <Button
                      key={status}
                      variant="outline"
                      size="sm"
                      disabled={updatingStatus}
                      onClick={() => handleStatusChange(status)}
                    >
                      {config?.label || status}
                    </Button>
                  );
                })}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {ticket.description && (
              <p className="whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">
                {ticket.description}
              </p>
            )}
            {!ticket.description && (
              <p className="text-sm italic text-zinc-400">No description provided.</p>
            )}
          </CardContent>
        </Card>

        {/* SLA Indicator */}
        {slaStatus && (
          <div className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium ${slaStatus.className}`}>
            <Clock className="h-4 w-4" />
            {slaStatus.label}
            {ticket.slaDeadline && (
              <span className="ml-auto text-xs opacity-75">
                Deadline: {formatDateTime(ticket.slaDeadline)}
              </span>
            )}
          </div>
        )}

        {/* Comment Thread */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Comments ({ticket.comments.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {ticket.comments.length === 0 && (
              <p className="py-8 text-center text-sm text-zinc-400">
                No comments yet. Start the conversation below.
              </p>
            )}

            {/* Comment Timeline */}
            <div className="space-y-4">
              {ticket.comments.map((comment) => (
                <div
                  key={comment.id}
                  className={`rounded-lg border p-4 ${
                    comment.isPublic
                      ? "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
                      : "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30"
                  }`}
                >
                  <div className="mb-2 flex items-center gap-3">
                    <Avatar
                      src={comment.user.image}
                      name={comment.user.name || comment.user.email}
                      size="sm"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                          {comment.user.name || comment.user.email}
                        </span>
                        <Badge
                          variant={comment.isPublic ? "default" : "warning"}
                          className="text-[10px] px-1.5 py-0"
                        >
                          {comment.isPublic ? (
                            <><Globe className="mr-0.5 h-2.5 w-2.5" /> Public</>
                          ) : (
                            <><Lock className="mr-0.5 h-2.5 w-2.5" /> Internal</>
                          )}
                        </Badge>
                      </div>
                      <span className="text-xs text-zinc-500">
                        {formatDateTime(comment.createdAt)}
                      </span>
                    </div>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300 pl-11">
                    {comment.body}
                  </p>
                </div>
              ))}
            </div>

            {/* Add Comment Form */}
            <div className="border-t border-zinc-200 pt-4 dark:border-zinc-800">
              <Textarea
                placeholder="Write a comment..."
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
                rows={3}
              />
              <div className="mt-3 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setIsPublic(!isPublic)}
                  className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                    isPublic
                      ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300"
                      : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300"
                  }`}
                >
                  {isPublic ? (
                    <><Globe className="h-3 w-3" /> Public reply</>
                  ) : (
                    <><Lock className="h-3 w-3" /> Internal note</>
                  )}
                </button>
                <Button
                  onClick={handleAddComment}
                  disabled={submitting || !commentBody.trim()}
                  size="sm"
                >
                  {submitting ? "Posting..." : "Add Comment"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sidebar */}
      <div className="space-y-6">
        {/* Details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div>
              <span className="text-zinc-500">Status</span>
              <div className="mt-1">
                <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
              </div>
            </div>
            <div>
              <span className="text-zinc-500">Priority</span>
              <div className="mt-1">
                <Badge variant={priorityConfig.variant}>
                  {priorityConfig.icon && <AlertTriangle className="mr-1 h-3 w-3" />}
                  {priorityConfig.label}
                </Badge>
              </div>
            </div>
            <div>
              <span className="text-zinc-500">Pipeline</span>
              <p className="mt-1 capitalize">{ticket.pipeline}</p>
            </div>
            {ticket.category && (
              <div>
                <span className="text-zinc-500">Category</span>
                <p className="mt-1">{ticket.category}</p>
              </div>
            )}
            <div>
              <span className="text-zinc-500">Created</span>
              <p className="mt-1">{formatDateTime(ticket.createdAt)}</p>
            </div>
            <div>
              <span className="text-zinc-500">Last Updated</span>
              <p className="mt-1">{formatDateTime(ticket.updatedAt)}</p>
            </div>
            {ticket.resolvedAt && (
              <div>
                <span className="text-zinc-500">Resolved At</span>
                <p className="mt-1">{formatDateTime(ticket.resolvedAt)}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Contact Info */}
        {ticket.contact && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <User className="h-4 w-4" />
                Contact
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="font-medium">
                {ticket.contact.firstName} {ticket.contact.lastName}
              </p>
              {ticket.contact.email && (
                <div className="flex items-center gap-2 text-zinc-500">
                  <Mail className="h-3.5 w-3.5" />
                  <span>{ticket.contact.email}</span>
                </div>
              )}
              {ticket.contact.phone && (
                <div className="flex items-center gap-2 text-zinc-500">
                  <Phone className="h-3.5 w-3.5" />
                  <span>{ticket.contact.phone}</span>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Company Info */}
        {ticket.company && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Building2 className="h-4 w-4" />
                Company
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="font-medium">{ticket.company.name}</p>
              {ticket.company.domain && (
                <p className="text-zinc-500">{ticket.company.domain}</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => router.push(`/tickets/${ticket.id}`)}
            >
              Edit Ticket
            </Button>
            {ticket.contact && (
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => router.push(`/contacts/${ticket.contact!.id}`)}
              >
                View Contact
              </Button>
            )}
            {ticket.company && (
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => router.push(`/companies/${ticket.company!.id}`)}
              >
                View Company
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
