"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { companySchema, type CompanyFormData } from "@/lib/validations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";

const INDUSTRY_OPTIONS = [
  { value: "", label: "Select Industry" },
  { value: "Technology", label: "Technology" },
  { value: "Finance", label: "Finance" },
  { value: "Healthcare", label: "Healthcare" },
  { value: "Education", label: "Education" },
  { value: "Retail", label: "Retail" },
  { value: "Manufacturing", label: "Manufacturing" },
  { value: "Services", label: "Services" },
  { value: "Other", label: "Other" },
];

const SIZE_OPTIONS = [
  { value: "", label: "Select Size" },
  { value: "1-10", label: "1-10" },
  { value: "11-50", label: "11-50" },
  { value: "51-200", label: "51-200" },
  { value: "201-500", label: "201-500" },
  { value: "501-1000", label: "501-1000" },
  { value: "1001+", label: "1001+" },
];

export default function NewCompanyPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CompanyFormData>({
    resolver: zodResolver(companySchema) as any,
  });

  const onSubmit = async (data: CompanyFormData) => {
    setSubmitting(true);
    setError("");

    const res = await fetch("/api/companies", {
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

    router.push(`/companies/${json.data.id}`);
  };

  return (
    <div>
      <PageHeader
        title="New Company"
        description="Add a new company to your CRM"
      />

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Company Information</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {error && (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">
                {error}
              </div>
            )}

            <Input
              label="Company Name"
              id="name"
              error={errors.name?.message}
              {...register("name")}
            />

            <Input
              label="Domain"
              id="domain"
              placeholder="example.com"
              error={errors.domain?.message}
              {...register("domain")}
            />

            <div className="grid grid-cols-2 gap-4">
              <Select
                label="Industry"
                id="industry"
                options={INDUSTRY_OPTIONS}
                error={errors.industry?.message}
                {...register("industry")}
              />
              <Select
                label="Company Size"
                id="size"
                options={SIZE_OPTIONS}
                error={errors.size?.message}
                {...register("size")}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Revenue"
                id="revenue"
                type="number"
                placeholder="0"
                error={errors.revenue?.message}
                {...register("revenue")}
              />
              <Input
                label="Phone"
                id="phone"
                error={errors.phone?.message}
                {...register("phone")}
              />
            </div>

            <Input
              label="Address"
              id="address"
              error={errors.address?.message}
              {...register("address")}
            />

            <div className="grid grid-cols-3 gap-4">
              <Input
                label="City"
                id="city"
                error={errors.city?.message}
                {...register("city")}
              />
              <Input
                label="State"
                id="state"
                error={errors.state?.message}
                {...register("state")}
              />
              <Input
                label="Country"
                id="country"
                error={errors.country?.message}
                {...register("country")}
              />
            </div>

            <Textarea
              label="Description"
              id="description"
              error={errors.description?.message}
              {...register("description")}
            />

            <div className="flex items-center gap-2 pt-4">
              <Button type="submit" disabled={submitting}>
                {submitting ? "Creating..." : "Create Company"}
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
