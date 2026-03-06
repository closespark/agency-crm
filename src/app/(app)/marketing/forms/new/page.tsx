"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormBuilder } from "@/components/marketing/form-builder";
import { api } from "@/lib/api";

export default function NewFormPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState("[]");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get("name") as string,
      fields,
      submitLabel: (formData.get("submitLabel") as string) || "Submit",
      redirectUrl: (formData.get("redirectUrl") as string) || undefined,
      isActive: true,
    };

    const res = await api.post("/forms", data);

    if (res.error) {
      setError(res.error);
      setSaving(false);
      return;
    }

    router.push("/marketing/forms");
  };

  return (
    <div>
      <PageHeader
        title="New Form"
        actions={
          <Button variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
        }
      />

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">
                {error}
              </div>
            )}

            <Input
              id="name"
              name="name"
              label="Form Name"
              required
              placeholder="e.g. Contact Us Form"
            />

            <div className="grid grid-cols-2 gap-4">
              <Input
                id="submitLabel"
                name="submitLabel"
                label="Submit Button Text"
                placeholder="Submit"
                defaultValue="Submit"
              />
              <Input
                id="redirectUrl"
                name="redirectUrl"
                label="Redirect URL (optional)"
                placeholder="https://example.com/thank-you"
              />
            </div>

            <FormBuilder value={fields} onChange={setFields} />

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Creating..." : "Create Form"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
