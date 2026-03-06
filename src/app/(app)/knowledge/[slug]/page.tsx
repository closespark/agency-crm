"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageLoader } from "@/components/ui/loading";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/utils";
import { ArrowLeft, Pencil, Trash2, Eye, ThumbsUp } from "lucide-react";

interface ArticleData {
  id: string;
  title: string;
  slug: string;
  body: string;
  category: string | null;
  status: string;
  viewCount: number;
  helpfulCount: number;
  createdAt: string;
  updatedAt: string;
}

export default function KnowledgeArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const router = useRouter();
  const [article, setArticle] = useState<ArticleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    async function load() {
      const res = await api.get<ArticleData>(`/knowledge/${slug}`);
      if (res.data) {
        setArticle(res.data);
      }
      setLoading(false);
    }
    load();
  }, [slug]);

  async function handleDelete() {
    if (!article) return;
    await api.delete(`/knowledge/${article.id}`);
    router.push("/knowledge");
  }

  if (loading) return <PageLoader />;

  if (!article) {
    return (
      <div>
        <PageHeader title="Article Not Found" />
        <p className="text-zinc-500">The article you are looking for does not exist.</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push("/knowledge")}>
          Back to Knowledge Base
        </Button>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={article.title}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.push("/knowledge")}>
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <Button variant="outline" onClick={() => router.push(`/knowledge/new?edit=${article.id}`)}>
              <Pencil className="h-4 w-4" />
              Edit
            </Button>
            <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Badge variant={article.status === "published" ? "success" : "secondary"}>
          {article.status}
        </Badge>
        {article.category && <Badge variant="outline">{article.category}</Badge>}
        <span className="flex items-center gap-1 text-sm text-zinc-500">
          <Eye className="h-3.5 w-3.5" />
          {article.viewCount} views
        </span>
        <span className="flex items-center gap-1 text-sm text-zinc-500">
          <ThumbsUp className="h-3.5 w-3.5" />
          {article.helpfulCount} helpful
        </span>
        <span className="text-sm text-zinc-500">
          Updated {formatDateTime(article.updatedAt)}
        </span>
      </div>

      <Card>
        <CardContent className="prose prose-zinc dark:prose-invert max-w-none p-6">
          <div className="whitespace-pre-wrap">{article.body}</div>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        title="Delete Article"
        message="Are you sure you want to delete this article? This action cannot be undone."
        confirmLabel="Delete"
        destructive
      />
    </div>
  );
}
