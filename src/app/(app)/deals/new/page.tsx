"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { dealSchema, type DealFormData } from "@/lib/validations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { DEAL_STAGES } from "@/types";

const STAGE_OPTIONS = DEAL_STAGES.map((s) => ({
  value: s,
  label: s
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" "),
}));

interface Option {
  id: string;
  name?: string;
  firstName?: string;
  lastName?: string;
}

export default function NewDealPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [contacts, setContacts] = useState<Option[]>([]);
  const [companies, setCompanies] = useState<Option[]>([]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<DealFormData>({
    resolver: zodResolver(dealSchema) as any,
    defaultValues: {
      stage: "discovery",
      pipeline: "new_business",
      currency: "USD",
    },
  });

  useEffect(() => {
    Promise.all([
      fetch("/api/contacts?pageSize=100").then((r) => r.json()),
      fetch("/api/companies?pageSize=100").then((r) => r.json()),
    ]).then(([contactsRes, companiesRes]) => {
      if (contactsRes.data) {
        setContacts(contactsRes.data);
      }
      if (companiesRes.data) {
        setCompanies(companiesRes.data);
      }
    });
  }, []);

  const onSubmit = async (data: DealFormData) => {
    setSubmitting(true);
    setError("");

    const res = await fetch("/api/deals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    const json = await res.json();

    if (json.error) {
      setError(json.error);
      setSubmitting(false);
      return;
    }

    router.push(`/deals/${json.data.id}`);
  };

  return (
    <div>
      <PageHeader
        title="New Deal"
        description="Create a new deal in your pipeline"
      />

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Deal Information</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {error && (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">
                {error}
              </div>
            )}

            <Input
              label="Deal Name"
              id="name"
              error={errors.name?.message}
              {...register("name")}
            />

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Amount"
                id="amount"
                type="number"
                step="0.01"
                error={errors.amount?.message}
                {...register("amount")}
              />
              <Input
                label="Currency"
                id="currency"
                error={errors.currency?.message}
                {...register("currency")}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Select
                label="Stage"
                id="stage"
                options={STAGE_OPTIONS}
                error={errors.stage?.message}
                {...register("stage")}
              />
              <Input
                label="Probability (%)"
                id="probability"
                type="number"
                min="0"
                max="100"
                error={errors.probability?.message}
                {...register("probability")}
              />
            </div>

            <Input
              label="Close Date"
              id="closeDate"
              type="date"
              error={errors.closeDate?.message}
              {...register("closeDate")}
            />

            <Select
              label="Contact"
              id="contactId"
              options={contacts.map((c) => ({
                value: c.id,
                label: `${c.firstName} ${c.lastName}`,
              }))}
              placeholder="Select a contact"
              {...register("contactId")}
            />

            <Select
              label="Company"
              id="companyId"
              options={companies.map((c) => ({
                value: c.id,
                label: c.name || "",
              }))}
              placeholder="Select a company"
              {...register("companyId")}
            />

            <Input
              label="Pipeline"
              id="pipeline"
              error={errors.pipeline?.message}
              {...register("pipeline")}
            />

            <div className="flex items-center gap-2 pt-4">
              <Button type="submit" disabled={submitting}>
                {submitting ? "Creating..." : "Create Deal"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
              >
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
