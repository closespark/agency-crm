"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/loading";
import { SequenceTimeline } from "./sequence-timeline";
import { api } from "@/lib/api";

interface GeneratedStep {
  stepNumber: number;
  channel: "email" | "linkedin" | "call";
  delayDays: number;
  angle?: string;
  goal?: string;
  objectionToAddress?: string;
  tone?: string;
  subject?: string;
  body?: string;
  notes?: string;
}

interface GeneratedSequence {
  name: string;
  description: string;
  steps: GeneratedStep[];
  estimatedDuration: string;
  strategy: string;
}

interface AIGeneratorFormProps {
  onSave: (sequence: GeneratedSequence) => void;
  onCancel: () => void;
}

const channelCheckboxes = [
  { value: "email", label: "Email" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "multi", label: "Multi-channel" },
] as const;

export function AIGeneratorForm({ onSave, onCancel }: AIGeneratorFormProps) {
  const [step, setStep] = useState<"form" | "preview">("form");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [generated, setGenerated] = useState<GeneratedSequence | null>(null);

  // Form state
  const [targetDescription, setTargetDescription] = useState("");
  const [industry, setIndustry] = useState("");
  const [painPoints, setPainPoints] = useState("");
  const [agencyServices, setAgencyServices] = useState("");
  const [selectedChannels, setSelectedChannels] = useState<string[]>(["email"]);
  const [stepCount, setStepCount] = useState("7");
  const [tone, setTone] = useState("professional");

  function toggleChannel(ch: string) {
    setSelectedChannels((prev) =>
      prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch]
    );
  }

  async function handleGenerate() {
    setError("");

    if (!targetDescription.trim()) {
      setError("Please describe your target audience");
      return;
    }
    if (!agencyServices.trim()) {
      setError("Please describe your agency services");
      return;
    }
    if (selectedChannels.length === 0) {
      setError("Please select at least one channel");
      return;
    }

    setLoading(true);
    try {
      const res = await api.post<GeneratedSequence>("/sequences/generate", {
        targetDescription,
        industry: industry || undefined,
        painPoints: painPoints
          ? painPoints.split(",").map((p) => p.trim())
          : undefined,
        agencyServices,
        channels: selectedChannels,
        stepCount: parseInt(stepCount) || 7,
        tone,
      });

      if (res.error) {
        setError(res.error);
        return;
      }

      if (res.data) {
        setGenerated(res.data);
        setStep("preview");
      }
    } catch {
      setError("Failed to generate sequence. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (step === "preview" && generated) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>AI-Generated Sequence Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-4 space-y-2">
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                {generated.name}
              </h3>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                {generated.description}
              </p>
              <div className="flex gap-4 text-xs text-zinc-500">
                <span>Duration: {generated.estimatedDuration}</span>
                <span>{generated.steps.length} steps</span>
              </div>
              {generated.strategy && (
                <p className="mt-2 rounded-md bg-zinc-50 p-3 text-sm text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                  <span className="font-medium">Strategy:</span>{" "}
                  {generated.strategy}
                </p>
              )}
            </div>

            <SequenceTimeline steps={generated.steps} />
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => setStep("form")}>
            Back to Edit
          </Button>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={() => onSave(generated)}>
            Save Sequence
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Generate Sequence with AI</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
              {error}
            </div>
          )}

          <Textarea
            label="Target Audience Description"
            placeholder="e.g., CMOs at B2B SaaS companies with 50-200 employees who are struggling with lead generation..."
            rows={3}
            value={targetDescription}
            onChange={(e) => setTargetDescription(e.target.value)}
          />

          <Input
            label="Industry (optional)"
            placeholder="e.g., SaaS, Healthcare, E-commerce"
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
          />

          <Textarea
            label="Pain Points (comma-separated, optional)"
            placeholder="e.g., low conversion rates, high CAC, inconsistent pipeline"
            rows={2}
            value={painPoints}
            onChange={(e) => setPainPoints(e.target.value)}
          />

          <Textarea
            label="Your Agency Services"
            placeholder="e.g., We offer full-funnel demand generation including paid media, content marketing, and sales enablement..."
            rows={3}
            value={agencyServices}
            onChange={(e) => setAgencyServices(e.target.value)}
          />

          <div className="space-y-1">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Outreach Channels
            </label>
            <div className="flex gap-4">
              {channelCheckboxes.map((ch) => (
                <label key={ch.value} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedChannels.includes(ch.value)}
                    onChange={() => toggleChannel(ch.value)}
                    className="h-4 w-4 rounded border-zinc-300"
                  />
                  {ch.label}
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Number of Steps"
              options={[
                { value: "3", label: "3 steps" },
                { value: "5", label: "5 steps" },
                { value: "7", label: "7 steps" },
                { value: "10", label: "10 steps" },
              ]}
              value={stepCount}
              onChange={(e) => setStepCount(e.target.value)}
            />
            <Select
              label="Tone"
              options={[
                { value: "professional", label: "Professional" },
                { value: "casual", label: "Casual" },
                { value: "bold", label: "Bold / Direct" },
                { value: "empathetic", label: "Empathetic" },
                { value: "humorous", label: "Humorous" },
              ]}
              value={tone}
              onChange={(e) => setTone(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={handleGenerate} disabled={loading}>
          {loading ? (
            <>
              <Spinner size="sm" />
              Generating...
            </>
          ) : (
            "Generate Sequence"
          )}
        </Button>
      </div>
    </div>
  );
}
