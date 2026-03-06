"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { contactSchema, type ContactFormData } from "@/lib/validations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { LIFECYCLE_STAGES } from "@/types";

const LIFECYCLE_OPTIONS = LIFECYCLE_STAGES.map((s) => ({
  value: s,
  label: s.charAt(0).toUpperCase() + s.slice(1),
}));

const LEAD_STATUS_OPTIONS = [
  { value: "", label: "None" },
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "interested", label: "Interested" },
  { value: "unqualified", label: "Unqualified" },
  { value: "bad_timing", label: "Bad Timing" },
];

const SOURCE_OPTIONS = [
  { value: "", label: "None" },
  { value: "instantly", label: "Instantly" },
  { value: "inbound", label: "Inbound" },
  { value: "referral", label: "Referral" },
  { value: "organic", label: "Organic" },
  { value: "paid", label: "Paid" },
];

interface CompanyOption {
  id: string;
  name: string;
}

export default function NewContactPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [companies, setCompanies] = useState<CompanyOption[]>([]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ContactFormData>({
    resolver: zodResolver(contactSchema) as any,
    defaultValues: {
      lifecycleStage: "subscriber",
    },
  });

  useEffect(() => {
    fetch("/api/companies?pageSize=100")
      .then((res) => res.json())
      .then((json) => {
        if (json.data) {
          setCompanies(json.data.map((c: CompanyOption) => ({ id: c.id, name: c.name })));
        }
      })
      .catch(() => {});
  }, []);

  const onSubmit = async (data: ContactFormData) => {
    setSubmitting(true);
    setError("");

    const res = await fetch("/api/contacts", {
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

    router.push(`/contacts/${json.data.id}`);
  };

  return (
    <div>
      <PageHeader
        title="New Contact"
        description="Add a new contact to your CRM"
      />

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Contact Information</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {error && (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">
                {error}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="First Name"
                id="firstName"
                error={errors.firstName?.message}
                {...register("firstName")}
              />
              <Input
                label="Last Name"
                id="lastName"
                error={errors.lastName?.message}
                {...register("lastName")}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Email"
                id="email"
                type="email"
                error={errors.email?.message}
                {...register("email")}
              />
              <Input
                label="Phone"
                id="phone"
                error={errors.phone?.message}
                {...register("phone")}
              />
            </div>

            <Input
              label="Job Title"
              id="jobTitle"
              error={errors.jobTitle?.message}
              {...register("jobTitle")}
            />

            <Select
              label="Company"
              id="companyId"
              options={companies.map((c) => ({ value: c.id, label: c.name }))}
              placeholder="Select a company"
              {...register("companyId")}
            />

            <div className="grid grid-cols-2 gap-4">
              <Select
                label="Lifecycle Stage"
                id="lifecycleStage"
                options={LIFECYCLE_OPTIONS}
                error={errors.lifecycleStage?.message}
                {...register("lifecycleStage")}
              />
              <Select
                label="Lead Status"
                id="leadStatus"
                options={LEAD_STATUS_OPTIONS}
                error={errors.leadStatus?.message}
                {...register("leadStatus")}
              />
            </div>

            <Select
              label="Source"
              id="source"
              options={SOURCE_OPTIONS}
              error={errors.source?.message}
              {...register("source")}
            />

            <div className="flex items-center gap-2 pt-4">
              <Button type="submit" disabled={submitting}>
                {submitting ? "Creating..." : "Create Contact"}
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
