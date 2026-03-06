"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { api } from "@/lib/api";

export default function NewTemplatePage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [body, setBody] = useState("");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get("name") as string,
      subject: formData.get("subject") as string,
      body,
      category: (formData.get("category") as string) || undefined,
      isActive: true,
    };

    const res = await api.post("/templates", data);

    if (res.error) {
      setError(res.error);
      setSaving(false);
      return;
    }

    router.push("/marketing/templates");
  };

  return (
    <div>
      <PageHeader
        title="New Email Template"
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
              label="Template Name"
              required
              placeholder="e.g. Welcome Email"
            />

            <Input
              id="subject"
              name="subject"
              label="Email Subject"
              required
              placeholder="e.g. Welcome to {{company_name}}"
            />

            <Select
              id="category"
              name="category"
              label="Category"
              options={[
                { value: "transactional", label: "Transactional" },
                { value: "marketing", label: "Marketing" },
                { value: "newsletter", label: "Newsletter" },
                { value: "notification", label: "Notification" },
                { value: "onboarding", label: "Onboarding" },
              ]}
              placeholder="Select category (optional)"
            />

            <div className="space-y-1">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                HTML Body
              </label>
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="<html>&#10;<body>&#10;  <h1>Hello {{first_name}}</h1>&#10;  <p>Your email content here...</p>&#10;</body>&#10;</html>"
                className="min-h-[300px] font-mono text-sm"
                required
              />
              <p className="text-xs text-zinc-400">
                Use {"{{variable_name}}"} for merge fields. Supports HTML.
              </p>
            </div>

            {body && (
              <div className="space-y-1">
                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Preview
                </label>
                <div className="rounded-md border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-800">
                  <div dangerouslySetInnerHTML={{ __html: body }} />
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Creating..." : "Create Template"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
