"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { PageLoader } from "@/components/ui/loading";
import { api } from "@/lib/api";
import { slugify } from "@/lib/utils";
import { ArrowLeft } from "lucide-react";

const articleSchema = z.object({
  title: z.string().min(1, "Title is required"),
  slug: z.string().min(1, "Slug is required"),
  body: z.string().min(1, "Body is required"),
  category: z.string().optional(),
  status: z.string().default("draft"),
});

type ArticleFormData = z.infer<typeof articleSchema>;

interface ArticleData {
  id: string;
  title: string;
  slug: string;
  body: string;
  category: string | null;
  status: string;
}

const CATEGORY_OPTIONS = [
  { value: "", label: "Select Category" },
  { value: "getting-started", label: "Getting Started" },
  { value: "billing", label: "Billing" },
  { value: "technical", label: "Technical" },
  { value: "integrations", label: "Integrations" },
  { value: "troubleshooting", label: "Troubleshooting" },
  { value: "faq", label: "FAQ" },
];

const STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
];

export default function NewKnowledgeArticlePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");
  const isEditing = !!editId;

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [loadingEdit, setLoadingEdit] = useState(isEditing);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ArticleFormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(articleSchema) as any,
    defaultValues: {
      status: "draft",
    },
  });

  const title = watch("title");

  useEffect(() => {
    if (title && !isEditing) {
      setValue("slug", slugify(title));
    }
  }, [title, setValue, isEditing]);

  useEffect(() => {
    if (!editId) return;
    async function loadArticle() {
      const res = await api.get<ArticleData>(`/knowledge/${editId}`);
      if (res.data) {
        setValue("title", res.data.title);
        setValue("slug", res.data.slug);
        setValue("body", res.data.body);
        setValue("category", res.data.category || "");
        setValue("status", res.data.status);
      }
      setLoadingEdit(false);
    }
    loadArticle();
  }, [editId, setValue]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function onSubmit(data: any) {
    setSubmitting(true);
    setError("");

    const payload = {
      ...data,
      category: data.category || undefined,
    };

    let res;
    if (isEditing) {
      res = await api.put<ArticleData>(`/knowledge/${editId}`, payload);
    } else {
      res = await api.post<ArticleData>("/knowledge", payload);
    }

    if (res.error) {
      setError(res.error);
      setSubmitting(false);
      return;
    }

    if (res.data) {
      router.push(`/knowledge/${res.data.slug}`);
    }
  }

  if (loadingEdit) return <PageLoader />;

  return (
    <div>
      <PageHeader
        title={isEditing ? "Edit Article" : "New Article"}
        description={isEditing ? "Update this knowledge base article" : "Create a new knowledge base article"}
        actions={
          <Button variant="outline" onClick={() => router.push("/knowledge")}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        }
      />

      <Card>
        <CardContent className="p-6">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {error && (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">{error}</div>
            )}

            <Input
              label="Title"
              id="title"
              placeholder="Article title"
              error={errors.title?.message}
              {...register("title")}
            />

            <Input
              label="Slug"
              id="slug"
              placeholder="article-slug"
              error={errors.slug?.message}
              {...register("slug")}
            />

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Select
                label="Category"
                id="category"
                options={CATEGORY_OPTIONS}
                error={errors.category?.message}
                {...register("category")}
              />
              <Select
                label="Status"
                id="status"
                options={STATUS_OPTIONS}
                error={errors.status?.message}
                {...register("status")}
              />
            </div>

            <Textarea
              label="Body"
              id="body"
              placeholder="Write your article content here..."
              rows={15}
              error={errors.body?.message}
              {...register("body")}
            />

            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push("/knowledge")}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting
                  ? isEditing
                    ? "Saving..."
                    : "Creating..."
                  : isEditing
                    ? "Save Changes"
                    : "Create Article"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
