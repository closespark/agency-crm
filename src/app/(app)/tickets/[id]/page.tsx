"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { TicketDetail } from "@/components/service/ticket-detail";
import { Button } from "@/components/ui/button";
import { PageLoader } from "@/components/ui/loading";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { api } from "@/lib/api";
import { ArrowLeft, Trash2 } from "lucide-react";

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

export default function TicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [ticket, setTicket] = useState<TicketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    async function load() {
      const res = await api.get<TicketData>(`/tickets/${id}`);
      if (res.data) {
        setTicket(res.data);
      }
      setLoading(false);
    }
    load();
  }, [id]);

  async function handleDelete() {
    await api.delete(`/tickets/${id}`);
    router.push("/tickets");
  }

  if (loading) return <PageLoader />;

  if (!ticket) {
    return (
      <div>
        <PageHeader title="Ticket Not Found" />
        <p className="text-zinc-500">The ticket you are looking for does not exist.</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push("/tickets")}>
          Back to Tickets
        </Button>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={`Ticket #${ticket.id.slice(-6).toUpperCase()}`}
        description={ticket.subject}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.push("/tickets")}>
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          </div>
        }
      />

      <TicketDetail ticket={ticket} />

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        title="Delete Ticket"
        message="Are you sure you want to delete this ticket? This will also delete all associated comments."
        confirmLabel="Delete"
        destructive
      />
    </div>
  );
}
