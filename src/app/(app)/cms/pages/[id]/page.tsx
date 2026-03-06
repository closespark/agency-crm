"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { PageEditor } from "@/components/cms/page-editor";
import { PageLoader } from "@/components/ui/loading";

export default function EditPagePage() {
  const params = useParams();
  const id = params.id as string;

  const [loading, setLoading] = useState(true);
  const [pageData, setPageData] = useState<{
    id: string;
    title: string;
    slug: string;
    content: string;
    template: string;
    status: string;
    metaTitle: string;
    metaDesc: string;
  } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchPage() {
      try {
        const res = await fetch(`/api/pages/${id}`);
        const json = await res.json();

        if (!res.ok) {
          setError(json.error || "Failed to load page");
          return;
        }

        setPageData({
          id: json.data.id,
          title: json.data.title,
          slug: json.data.slug,
          content: json.data.content,
          template: json.data.template,
          status: json.data.status,
          metaTitle: json.data.metaTitle || "",
          metaDesc: json.data.metaDesc || "",
        });
      } catch {
        setError("Failed to load page");
      } finally {
        setLoading(false);
      }
    }

    fetchPage();
  }, [id]);

  if (loading) return <PageLoader />;

  if (error) {
    return (
      <div className="rounded-md bg-red-50 p-4 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
        {error}
      </div>
    );
  }

  if (!pageData) return null;

  return (
    <div>
      <PageHeader
        title="Edit Page"
        description={`Editing: ${pageData.title}`}
      />
      <PageEditor initialData={pageData} />
    </div>
  );
}
