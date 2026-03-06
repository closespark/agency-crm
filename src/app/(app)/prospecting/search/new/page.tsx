"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { ICPForm, type ICPFormData } from "@/components/prospecting/icp-form";

export default function NewICPSearchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const defaultSource = searchParams.get("source") || "";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(data: ICPFormData, source: "ai" | "apollo") {
    setLoading(true);
    setError("");

    try {
      const icp = {
        industries: data.industries,
        companySize: data.companySize || undefined,
        revenueRange:
          data.revenueMin || data.revenueMax
            ? {
                min: data.revenueMin ? Number(data.revenueMin) : undefined,
                max: data.revenueMax ? Number(data.revenueMax) : undefined,
              }
            : undefined,
        jobTitles: data.jobTitles,
        locations: data.locations,
        keywords: data.keywords,
      };

      const res = await fetch("/api/prospecting/searches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: data.name, icp, source }),
      });

      const result = await res.json();

      if (!res.ok) {
        setError(result.error || "Search failed");
        return;
      }

      if (result.data?.id) {
        router.push(`/prospecting/search/${result.data.id}`);
      }
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="New ICP Search"
        description="Define your ideal customer profile to discover matching prospects"
        actions={
          <Button variant="outline" onClick={() => router.push("/prospecting")}>
            Back
          </Button>
        }
      />

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      <ICPForm
        initialData={defaultSource === "apollo" ? { name: "Apollo.io Search" } : undefined}
        onSubmitAI={(data) => handleSubmit(data, "ai")}
        onSubmitApollo={(data) => handleSubmit(data, "apollo")}
        isLoading={loading}
      />
    </div>
  );
}
