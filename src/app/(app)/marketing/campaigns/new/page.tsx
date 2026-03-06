"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { api } from "@/lib/api";

export default function NewCampaignPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get("name") as string,
      type: formData.get("type") as string,
      status: formData.get("status") as string,
      budget: formData.get("budget") ? Number(formData.get("budget")) : undefined,
      startDate: (formData.get("startDate") as string) || undefined,
      endDate: (formData.get("endDate") as string) || undefined,
    };

    const res = await api.post("/campaigns", data);

    if (res.error) {
      setError(res.error);
      setSaving(false);
      return;
    }

    router.push("/marketing/campaigns");
  };

  return (
    <div>
      <PageHeader
        title="New Campaign"
        actions={
          <Button variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
        }
      />

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">
                {error}
              </div>
            )}

            <Input
              id="name"
              name="name"
              label="Campaign Name"
              required
              placeholder="Enter campaign name"
            />

            <div className="grid grid-cols-2 gap-4">
              <Select
                id="type"
                name="type"
                label="Type"
                options={[
                  { value: "email", label: "Email" },
                  { value: "social", label: "Social" },
                  { value: "ads", label: "Ads" },
                  { value: "content", label: "Content" },
                ]}
                placeholder="Select type"
              />
              <Select
                id="status"
                name="status"
                label="Status"
                options={[
                  { value: "draft", label: "Draft" },
                  { value: "active", label: "Active" },
                  { value: "paused", label: "Paused" },
                  { value: "completed", label: "Completed" },
                ]}
              />
            </div>

            <Input
              id="budget"
              name="budget"
              label="Budget"
              type="number"
              step="0.01"
              placeholder="0.00"
            />

            <div className="grid grid-cols-2 gap-4">
              <Input
                id="startDate"
                name="startDate"
                label="Start Date"
                type="date"
              />
              <Input
                id="endDate"
                name="endDate"
                label="End Date"
                type="date"
              />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Creating..." : "Create Campaign"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
