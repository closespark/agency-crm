"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PageLoader } from "@/components/ui/loading";
import { StepEditor, type SequenceStep } from "@/components/sequences/step-editor";
import { AIGeneratorForm } from "@/components/sequences/ai-generator-form";
import { api } from "@/lib/api";
import { parseJSON } from "@/lib/utils";

interface GeneratedSequence {
  name: string;
  description: string;
  steps: SequenceStep[];
  estimatedDuration: string;
  strategy: string;
}

function NewSequenceContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode = searchParams.get("mode"); // "ai" or null
  const editId = searchParams.get("edit"); // for editing existing

  const [selectedPath, setSelectedPath] = useState<"ai" | "manual" | null>(
    mode === "ai" ? "ai" : null
  );
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Manual form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState<SequenceStep[]>([]);

  // Load existing sequence if editing
  useEffect(() => {
    if (editId) {
      setLoading(true);
      api
        .get<{
          id: string;
          name: string;
          description: string;
          steps: string;
          parsedSteps: SequenceStep[];
        }>(`/sequences/${editId}`)
        .then((res) => {
          if (res.data) {
            setName(res.data.name);
            setDescription(res.data.description || "");
            setSteps(
              res.data.parsedSteps || parseJSON<SequenceStep[]>(res.data.steps, [])
            );
            setSelectedPath("manual");
          }
        })
        .finally(() => setLoading(false));
    }
  }, [editId]);

  async function handleSaveManual() {
    if (!name.trim()) return;
    if (steps.length === 0) return;

    setSaving(true);
    try {
      if (editId) {
        await api.put(`/sequences/${editId}`, {
          name,
          description,
          steps: JSON.stringify(steps),
          isActive: true,
        });
        router.push(`/sequences/${editId}`);
      } else {
        const res = await api.post<{ id: string }>("/sequences", {
          name,
          description,
          steps: JSON.stringify(steps),
          isActive: true,
        });
        if (res.data) {
          router.push(`/sequences/${res.data.id}`);
        }
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveAI(generated: GeneratedSequence) {
    setSaving(true);
    try {
      const res = await api.post<{ id: string }>("/sequences", {
        aiGenerated: true,
        generatedSequence: generated,
      });
      if (res.data) {
        router.push(`/sequences/${res.data.id}`);
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <PageLoader />;
  }

  // Path selection screen
  if (!selectedPath && !editId) {
    return (
      <div>
        <PageHeader
          title="Create New Sequence"
          description="Choose how to build your outreach sequence"
        />

        <div className="mx-auto grid max-w-3xl grid-cols-2 gap-6">
          <Card
            className="cursor-pointer transition-shadow hover:shadow-md"
            onClick={() => setSelectedPath("ai")}
          >
            <CardHeader className="text-center">
              <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-900">
                <svg
                  className="h-6 w-6 text-purple-600 dark:text-purple-300"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z"
                  />
                </svg>
              </div>
              <CardTitle>Generate with AI</CardTitle>
              <CardDescription>
                Describe your target audience and let AI create a complete
                multi-step outreach sequence for you.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card
            className="cursor-pointer transition-shadow hover:shadow-md"
            onClick={() => setSelectedPath("manual")}
          >
            <CardHeader className="text-center">
              <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900">
                <svg
                  className="h-6 w-6 text-blue-600 dark:text-blue-300"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M11.42 15.17l-5.384 3.07a.75.75 0 01-1.094-.67V5.57a.75.75 0 01.367-.644l6.692-3.867a.75.75 0 01.748 0l6.692 3.867a.75.75 0 01.367.644v11.998a.75.75 0 01-1.094.67l-5.384-3.07a.75.75 0 00-.748 0z"
                  />
                </svg>
              </div>
              <CardTitle>Build Manually</CardTitle>
              <CardDescription>
                Create your sequence step by step with full control over
                channels, timing, and messaging.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </div>
    );
  }

  // AI generation path
  if (selectedPath === "ai") {
    return (
      <div>
        <PageHeader
          title="Generate Sequence with AI"
          description="Tell us about your target audience and services"
        />
        <AIGeneratorForm
          onSave={handleSaveAI}
          onCancel={() => setSelectedPath(null)}
        />
      </div>
    );
  }

  // Manual builder path
  return (
    <div>
      <PageHeader
        title={editId ? "Edit Sequence" : "Build Sequence Manually"}
        description="Define each step of your outreach sequence"
        actions={
          !editId ? (
            <Button variant="ghost" onClick={() => setSelectedPath(null)}>
              Back
            </Button>
          ) : undefined
        }
      />

      <div className="space-y-6">
        <Card>
          <CardContent className="space-y-4 pt-6">
            <Input
              label="Sequence Name"
              placeholder="e.g., Q1 SaaS Outreach"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Textarea
              label="Description (optional)"
              placeholder="What is this sequence for?"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </CardContent>
        </Card>

        <div>
          <h3 className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Sequence Steps
          </h3>
          <StepEditor steps={steps} onChange={setSteps} />
        </div>

        <div className="flex justify-end gap-3">
          <Button
            variant="outline"
            onClick={() =>
              editId ? router.push(`/sequences/${editId}`) : router.push("/sequences")
            }
          >
            Cancel
          </Button>
          <Button
            onClick={handleSaveManual}
            disabled={saving || !name.trim() || steps.length === 0}
          >
            {saving
              ? "Saving..."
              : editId
                ? "Update Sequence"
                : "Create Sequence"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function NewSequencePage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <NewSequenceContent />
    </Suspense>
  );
}
