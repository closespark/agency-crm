"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { BlogEditor } from "@/components/cms/blog-editor";
import { PageLoader } from "@/components/ui/loading";

export default function EditBlogPostPage() {
  const params = useParams();
  const id = params.id as string;

  const [loading, setLoading] = useState(true);
  const [postData, setPostData] = useState<{
    id: string;
    title: string;
    slug: string;
    body: string;
    excerpt: string;
    coverImage: string;
    author: string;
    tags: string;
    status: string;
  } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchPost() {
      try {
        const res = await fetch(`/api/blog/${id}`);
        const json = await res.json();

        if (!res.ok) {
          setError(json.error || "Failed to load blog post");
          return;
        }

        setPostData({
          id: json.data.id,
          title: json.data.title,
          slug: json.data.slug,
          body: json.data.body,
          excerpt: json.data.excerpt || "",
          coverImage: json.data.coverImage || "",
          author: json.data.author || "",
          tags: json.data.tags || "",
          status: json.data.status,
        });
      } catch {
        setError("Failed to load blog post");
      } finally {
        setLoading(false);
      }
    }

    fetchPost();
  }, [id]);

  if (loading) return <PageLoader />;

  if (error) {
    return (
      <div className="rounded-md bg-red-50 p-4 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
        {error}
      </div>
    );
  }

  if (!postData) return null;

  return (
    <div>
      <PageHeader
        title="Edit Blog Post"
        description={`Editing: ${postData.title}`}
      />
      <BlogEditor initialData={postData} />
    </div>
  );
}
