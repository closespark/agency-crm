"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SeoFields } from "@/components/cms/seo-fields";
import { slugify } from "@/lib/utils";

interface BlogPostData {
  id?: string;
  title: string;
  slug: string;
  body: string;
  excerpt: string;
  coverImage: string;
  author: string;
  tags: string;
  status: string;
  metaTitle?: string;
  metaDesc?: string;
}

interface BlogEditorProps {
  initialData?: BlogPostData;
}

const statusOptions = [
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
];

export function BlogEditor({ initialData }: BlogEditorProps) {
  const router = useRouter();
  const isEditing = !!initialData?.id;

  const [title, setTitle] = useState(initialData?.title || "");
  const [slug, setSlug] = useState(initialData?.slug || "");
  const [body, setBody] = useState(initialData?.body || "");
  const [excerpt, setExcerpt] = useState(initialData?.excerpt || "");
  const [coverImage, setCoverImage] = useState(initialData?.coverImage || "");
  const [author, setAuthor] = useState(initialData?.author || "");
  const [tags, setTags] = useState(initialData?.tags || "");
  const [tagInput, setTagInput] = useState("");
  const [status, setStatus] = useState(initialData?.status || "draft");
  const [metaTitle, setMetaTitle] = useState(initialData?.metaTitle || "");
  const [metaDesc, setMetaDesc] = useState(initialData?.metaDesc || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Auto-generate slug from title
  useEffect(() => {
    if (!isEditing && title) {
      setSlug(slugify(title));
    }
  }, [title, isEditing]);

  const tagList = tags
    ? tags.split(",").map((t) => t.trim()).filter(Boolean)
    : [];

  const handleAddTag = useCallback(() => {
    const trimmed = tagInput.trim();
    if (trimmed && !tagList.includes(trimmed)) {
      const newTags = [...tagList, trimmed].join(", ");
      setTags(newTags);
    }
    setTagInput("");
  }, [tagInput, tagList]);

  const handleRemoveTag = useCallback(
    (tagToRemove: string) => {
      const newTags = tagList.filter((t) => t !== tagToRemove).join(", ");
      setTags(newTags);
    },
    [tagList]
  );

  const handleTagKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        handleAddTag();
      }
    },
    [handleAddTag]
  );

  async function handleSave() {
    setError("");
    setSaving(true);

    try {
      const payload = {
        title,
        slug,
        body,
        excerpt: excerpt || undefined,
        coverImage: coverImage || undefined,
        author: author || undefined,
        tags: tags || undefined,
        status,
      };

      const url = isEditing
        ? `/api/blog/${initialData.id}`
        : "/api/blog";
      const method = isEditing ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.error || "Failed to save blog post");
        return;
      }

      router.push("/cms/blog");
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
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Blog post title"
          />

          <Input
            id="slug"
            label="Slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="blog-post-url-slug"
          />

          <Textarea
            id="body"
            label="Body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write your blog post content here..."
            rows={16}
          />

          <Textarea
            id="excerpt"
            label="Excerpt"
            value={excerpt}
            onChange={(e) => setExcerpt(e.target.value)}
            placeholder="A brief summary of the post..."
            rows={3}
          />
        </div>

        <div className="space-y-4">
          <Select
            id="status"
            label="Status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            options={statusOptions}
          />

          <Input
            id="author"
            label="Author"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="Author name"
          />

          <Input
            id="coverImage"
            label="Cover Image URL"
            value={coverImage}
            onChange={(e) => setCoverImage(e.target.value)}
            placeholder="https://example.com/image.jpg"
          />

          {coverImage && (
            <div className="overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-800">
              <img
                src={coverImage}
                alt="Cover preview"
                className="h-40 w-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Tags
            </label>
            <div className="flex gap-2">
              <Input
                id="tagInput"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
                placeholder="Add a tag..."
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddTag}
                className="mt-auto"
              >
                Add
              </Button>
            </div>
            {tagList.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {tagList.map((tag) => (
                  <Badge key={tag} variant="secondary" className="gap-1">
                    {tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      className="ml-1 text-xs hover:text-red-500"
                    >
                      &times;
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <SeoFields
            metaTitle={metaTitle}
            metaDesc={metaDesc}
            onMetaTitleChange={setMetaTitle}
            onMetaDescChange={setMetaDesc}
          />

          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={saving} className="flex-1">
              {saving
                ? "Saving..."
                : isEditing
                  ? "Update Post"
                  : "Create Post"}
            </Button>
            <Button
              variant="outline"
              onClick={() => router.push("/cms/blog")}
            >
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
