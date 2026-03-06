"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { SeoFields } from "@/components/cms/seo-fields";
import { slugify, parseJSON } from "@/lib/utils";

interface PageData {
  id?: string;
  title: string;
  slug: string;
  content: string;
  template: string;
  status: string;
  metaTitle: string;
  metaDesc: string;
}

interface PageEditorProps {
  initialData?: PageData;
}

const templateOptions = [
  { value: "default", label: "Default" },
  { value: "landing", label: "Landing Page" },
  { value: "sidebar", label: "With Sidebar" },
  { value: "full-width", label: "Full Width" },
  { value: "blank", label: "Blank" },
];

const statusOptions = [
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
];

export function PageEditor({ initialData }: PageEditorProps) {
  const router = useRouter();
  const isEditing = !!initialData?.id;

  const [title, setTitle] = useState(initialData?.title || "");
  const [slug, setSlug] = useState(initialData?.slug || "");
  const [content, setContent] = useState(
    initialData?.content || '[\n  {\n    "type": "heading",\n    "text": "Page Title"\n  },\n  {\n    "type": "paragraph",\n    "text": "Page content goes here."\n  }\n]'
  );
  const [template, setTemplate] = useState(initialData?.template || "default");
  const [status, setStatus] = useState(initialData?.status || "draft");
  const [metaTitle, setMetaTitle] = useState(initialData?.metaTitle || "");
  const [metaDesc, setMetaDesc] = useState(initialData?.metaDesc || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [jsonError, setJsonError] = useState("");
  const [showPreview, setShowPreview] = useState(false);

  const handleTitleChange = useCallback(
    (value: string) => {
      setTitle(value);
      if (!isEditing) {
        setSlug(slugify(value));
      }
    },
    [isEditing]
  );

  const handleContentChange = useCallback((value: string) => {
    setContent(value);
    try {
      JSON.parse(value);
      setJsonError("");
    } catch {
      setJsonError("Invalid JSON format");
    }
  }, []);

  const parsedBlocks = parseJSON<Array<Record<string, string>>>(content, []);

  async function handleSave() {
    setError("");

    if (jsonError) {
      setError("Fix JSON errors before saving");
      return;
    }

    setSaving(true);

    try {
      const payload = {
        title,
        slug,
        content,
        template,
        status,
        metaTitle: metaTitle || undefined,
        metaDesc: metaDesc || undefined,
      };

      const url = isEditing ? `/api/pages/${initialData.id}` : "/api/pages";
      const method = isEditing ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.error || "Failed to save page");
        return;
      }

      router.push("/cms/pages");
      router.refresh();
    } catch {
      setError("An error occurred while saving");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Input
            id="title"
            label="Title"
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="Page title"
          />

          <Input
            id="slug"
            label="Slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="page-url-slug"
          />

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Content (JSON Blocks)
              </label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowPreview(!showPreview)}
              >
                {showPreview ? "Edit" : "Preview"}
              </Button>
            </div>

            {showPreview ? (
              <div className="min-h-[300px] rounded-md border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                {parsedBlocks.length === 0 ? (
                  <p className="text-sm text-zinc-400">No content blocks</p>
                ) : (
                  <div className="space-y-3">
                    {parsedBlocks.map((block, i) => (
                      <div key={i}>
                        {block.type === "heading" && (
                          <h2 className="text-xl font-bold">{block.text}</h2>
                        )}
                        {block.type === "paragraph" && (
                          <p className="text-sm text-zinc-700 dark:text-zinc-300">
                            {block.text}
                          </p>
                        )}
                        {block.type === "image" && (
                          <div className="rounded-md bg-zinc-100 p-4 text-center text-sm text-zinc-500 dark:bg-zinc-800">
                            [Image: {block.src || block.url || "No source"}]
                          </div>
                        )}
                        {block.type === "divider" && (
                          <hr className="border-zinc-200 dark:border-zinc-800" />
                        )}
                        {!["heading", "paragraph", "image", "divider"].includes(
                          block.type
                        ) && (
                          <div className="rounded bg-zinc-50 p-2 text-xs text-zinc-500 dark:bg-zinc-900">
                            [{block.type}] {block.text || JSON.stringify(block)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <Textarea
                id="content"
                value={content}
                onChange={(e) => handleContentChange(e.target.value)}
                placeholder='[{"type": "heading", "text": "Hello"}]'
                rows={14}
                className="font-mono text-xs"
                error={jsonError}
              />
            )}
          </div>
        </div>

        <div className="space-y-4">
          <Select
            id="template"
            label="Template"
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            options={templateOptions}
          />

          <Select
            id="status"
            label="Status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            options={statusOptions}
          />

          <SeoFields
            metaTitle={metaTitle}
            metaDesc={metaDesc}
            onMetaTitleChange={setMetaTitle}
            onMetaDescChange={setMetaDesc}
          />

          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={saving} className="flex-1">
              {saving ? "Saving..." : isEditing ? "Update Page" : "Create Page"}
            </Button>
            <Button
              variant="outline"
              onClick={() => router.push("/cms/pages")}
            >
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
