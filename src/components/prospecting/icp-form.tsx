"use client";

import { useState, type KeyboardEvent } from "react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface ICPFormData {
  name: string;
  industries: string[];
  companySize: string;
  revenueMin: string;
  revenueMax: string;
  jobTitles: string[];
  locations: string[];
  keywords: string[];
}

interface ICPFormProps {
  initialData?: Partial<ICPFormData>;
  onSubmitAI: (data: ICPFormData) => void;
  onSubmitApollo: (data: ICPFormData) => void;
  isLoading?: boolean;
}

const companySizeOptions = [
  { value: "", label: "Any size" },
  { value: "1-10", label: "1-10 employees" },
  { value: "11-50", label: "11-50 employees" },
  { value: "51-200", label: "51-200 employees" },
  { value: "201-500", label: "201-500 employees" },
  { value: "501-1000", label: "501-1,000 employees" },
  { value: "1001+", label: "1,001+ employees" },
];

const industryOptions = [
  "Technology", "SaaS", "Finance", "Healthcare", "E-commerce", "Education",
  "Real Estate", "Marketing", "Consulting", "Manufacturing", "Retail",
  "Media", "Telecommunications", "Legal", "Non-profit", "Government",
];

function TagInput({
  label,
  tags,
  onAdd,
  onRemove,
  placeholder,
}: {
  label: string;
  tags: string[];
  onAdd: (tag: string) => void;
  onRemove: (index: number) => void;
  placeholder?: string;
}) {
  const [input, setInput] = useState("");

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if ((e.key === "Enter" || e.key === ",") && input.trim()) {
      e.preventDefault();
      const value = input.trim().replace(/,$/, "");
      if (value && !tags.includes(value)) {
        onAdd(value);
      }
      setInput("");
    }
    if (e.key === "Backspace" && !input && tags.length > 0) {
      onRemove(tags.length - 1);
    }
  }

  return (
    <div className="space-y-1">
      <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{label}</label>
      <div className="flex min-h-[36px] flex-wrap gap-1.5 rounded-md border border-zinc-300 bg-white px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-900">
        {tags.map((tag, i) => (
          <Badge key={i} variant="default" className="gap-1">
            {tag}
            <button
              type="button"
              onClick={() => onRemove(i)}
              className="ml-0.5 text-xs hover:text-white/80"
            >
              &times;
            </button>
          </Badge>
        ))}
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={tags.length === 0 ? placeholder : ""}
          className="min-w-[120px] flex-1 bg-transparent text-sm outline-none placeholder:text-zinc-400 dark:text-zinc-100"
        />
      </div>
      <p className="text-xs text-zinc-400">Press Enter or comma to add</p>
    </div>
  );
}

export function ICPForm({ initialData, onSubmitAI, onSubmitApollo, isLoading }: ICPFormProps) {
  const [data, setData] = useState<ICPFormData>({
    name: initialData?.name || "",
    industries: initialData?.industries || [],
    companySize: initialData?.companySize || "",
    revenueMin: initialData?.revenueMin || "",
    revenueMax: initialData?.revenueMax || "",
    jobTitles: initialData?.jobTitles || [],
    locations: initialData?.locations || [],
    keywords: initialData?.keywords || [],
  });

  function update<K extends keyof ICPFormData>(key: K, value: ICPFormData[K]) {
    setData((prev) => ({ ...prev, [key]: value }));
  }

  function toggleIndustry(industry: string) {
    setData((prev) => ({
      ...prev,
      industries: prev.industries.includes(industry)
        ? prev.industries.filter((i) => i !== industry)
        : [...prev.industries, industry],
    }));
  }

  const icpJSON = {
    industries: data.industries,
    companySize: data.companySize || undefined,
    revenueRange: data.revenueMin || data.revenueMax
      ? { min: data.revenueMin ? Number(data.revenueMin) : undefined, max: data.revenueMax ? Number(data.revenueMax) : undefined }
      : undefined,
    jobTitles: data.jobTitles,
    locations: data.locations,
    keywords: data.keywords,
  };

  const isValid = data.name.trim() && (data.industries.length > 0 || data.jobTitles.length > 0 || data.keywords.length > 0);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <Input
          label="Search Name"
          id="name"
          value={data.name}
          onChange={(e) => update("name", e.target.value)}
          placeholder="e.g., SaaS CTOs in US"
        />

        <div className="space-y-1">
          <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Industries</label>
          <div className="flex flex-wrap gap-2">
            {industryOptions.map((ind) => (
              <button
                key={ind}
                type="button"
                onClick={() => toggleIndustry(ind)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  data.industries.includes(ind)
                    ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                    : "border-zinc-300 text-zinc-600 hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-400"
                }`}
              >
                {ind}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Select
            label="Company Size"
            id="companySize"
            options={companySizeOptions}
            value={data.companySize}
            onChange={(e) => update("companySize", e.target.value)}
          />
          <Input
            label="Revenue Min ($)"
            id="revenueMin"
            type="number"
            value={data.revenueMin}
            onChange={(e) => update("revenueMin", e.target.value)}
            placeholder="e.g., 1000000"
          />
          <Input
            label="Revenue Max ($)"
            id="revenueMax"
            type="number"
            value={data.revenueMax}
            onChange={(e) => update("revenueMax", e.target.value)}
            placeholder="e.g., 50000000"
          />
        </div>

        <TagInput
          label="Job Titles"
          tags={data.jobTitles}
          onAdd={(tag) => update("jobTitles", [...data.jobTitles, tag])}
          onRemove={(i) => update("jobTitles", data.jobTitles.filter((_, idx) => idx !== i))}
          placeholder="CTO, VP Engineering, Head of Product..."
        />

        <TagInput
          label="Locations"
          tags={data.locations}
          onAdd={(tag) => update("locations", [...data.locations, tag])}
          onRemove={(i) => update("locations", data.locations.filter((_, idx) => idx !== i))}
          placeholder="United States, San Francisco, London..."
        />

        <TagInput
          label="Keywords"
          tags={data.keywords}
          onAdd={(tag) => update("keywords", [...data.keywords, tag])}
          onRemove={(i) => update("keywords", data.keywords.filter((_, idx) => idx !== i))}
          placeholder="AI, machine learning, B2B..."
        />

        <div className="flex gap-3">
          <Button onClick={() => onSubmitAI(data)} disabled={!isValid || isLoading}>
            {isLoading ? "Searching..." : "Search with AI"}
          </Button>
          <Button variant="outline" onClick={() => onSubmitApollo(data)} disabled={!isValid || isLoading}>
            {isLoading ? "Searching..." : "Search Apollo.io"}
          </Button>
        </div>
      </div>

      <div>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">ICP Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="max-h-96 overflow-auto rounded-md bg-zinc-50 p-3 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              {JSON.stringify(icpJSON, null, 2)}
            </pre>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
