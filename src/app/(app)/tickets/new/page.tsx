"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ticketSchema, type TicketFormData } from "@/lib/validations";
import { api, buildQueryString } from "@/lib/api";
import { ArrowLeft } from "lucide-react";

interface ContactOption {
  id: string;
  firstName: string;
  lastName: string;
}

interface CompanyOption {
  id: string;
  name: string;
}

interface UserOption {
  id: string;
  name: string | null;
  email: string;
}

const PRIORITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

const STATUS_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In Progress" },
];

const CATEGORY_OPTIONS = [
  { value: "", label: "Select Category" },
  { value: "billing", label: "Billing" },
  { value: "technical", label: "Technical" },
  { value: "general", label: "General" },
  { value: "feature_request", label: "Feature Request" },
  { value: "bug", label: "Bug Report" },
  { value: "account", label: "Account" },
];

const PIPELINE_OPTIONS = [
  { value: "support", label: "Support" },
  { value: "sales", label: "Sales" },
  { value: "onboarding", label: "Onboarding" },
];

export default function NewTicketPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TicketFormData>({
    resolver: zodResolver(ticketSchema) as any,
    defaultValues: {
      status: "open",
      priority: "medium",
      pipeline: "support",
    },
  });

  useEffect(() => {
    async function loadOptions() {
      const [contactsRes, companiesRes] = await Promise.all([
        api.get<ContactOption[]>(`/contacts${buildQueryString({ pageSize: 100 })}`),
        api.get<CompanyOption[]>(`/companies${buildQueryString({ pageSize: 100 })}`),
      ]);
      if (contactsRes.data) setContacts(contactsRes.data);
      if (companiesRes.data) setCompanies(companiesRes.data);
    }
    loadOptions();
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function onSubmit(data: any) {
    setSubmitting(true);
    setError("");

    const res = await api.post<{ id: string }>("/tickets", data);
    if (res.error) {
      setError(res.error);
      setSubmitting(false);
      return;
    }

    if (res.data) {
      router.push(`/tickets/${res.data.id}`);
    }
  }

  return (
    <div>
      <PageHeader
        title="New Ticket"
        description="Create a new support ticket"
        actions={
          <Button variant="outline" onClick={() => router.push("/tickets")}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        }
      />

      <Card>
        <CardContent className="p-6">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {error && (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">{error}</div>
            )}

            <Input
              label="Subject"
              id="subject"
              placeholder="Brief description of the issue"
              error={errors.subject?.message}
              {...register("subject")}
            />

            <Textarea
              label="Description"
              id="description"
              placeholder="Provide detailed information about the issue..."
              rows={5}
              error={errors.description?.message}
              {...register("description")}
            />

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Select
                label="Priority"
                id="priority"
                options={PRIORITY_OPTIONS}
                error={errors.priority?.message}
                {...register("priority")}
              />
              <Select
                label="Status"
                id="status"
                options={STATUS_OPTIONS}
                error={errors.status?.message}
                {...register("status")}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Select
                label="Category"
                id="category"
                options={CATEGORY_OPTIONS}
                error={errors.category?.message}
                {...register("category")}
              />
              <Select
                label="Pipeline"
                id="pipeline"
                options={PIPELINE_OPTIONS}
                error={errors.pipeline?.message}
                {...register("pipeline")}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Select
                label="Contact"
                id="contactId"
                placeholder="Select Contact"
                options={contacts.map((c) => ({
                  value: c.id,
                  label: `${c.firstName} ${c.lastName}`,
                }))}
                error={errors.contactId?.message}
                {...register("contactId")}
              />
              <Select
                label="Company"
                id="companyId"
                placeholder="Select Company"
                options={companies.map((c) => ({
                  value: c.id,
                  label: c.name,
                }))}
                error={errors.companyId?.message}
                {...register("companyId")}
              />
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push("/tickets")}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Creating..." : "Create Ticket"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
