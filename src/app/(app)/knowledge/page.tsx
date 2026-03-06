"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { SearchInput } from "@/components/shared/search-input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Pagination } from "@/components/ui/pagination";
import { PageLoader, EmptyState } from "@/components/ui/loading";
import { useDebounce } from "@/hooks/use-debounce";
import { api, buildQueryString } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { Plus, FileText, Eye, ThumbsUp } from "lucide-react";

interface ArticleRow {
  id: string;
  title: string;
  slug: string;
  category: string | null;
  status: string;
  viewCount: number;
  helpfulCount: number;
  createdAt: string;
  updatedAt: string;
}

const CATEGORY_OPTIONS = [
  { value: "", label: "All Categories" },
  { value: "getting-started", label: "Getting Started" },
  { value: "billing", label: "Billing" },
  { value: "technical", label: "Technical" },
  { value: "integrations", label: "Integrations" },
  { value: "troubleshooting", label: "Troubleshooting" },
  { value: "faq", label: "FAQ" },
];

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
];

export default function KnowledgePage() {
  const router = useRouter();
  const [articles, setArticles] = useState<ArticleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const debouncedSearch = useDebounce(search, 300);

  const fetchArticles = useCallback(async () => {
    setLoading(true);
    const qs = buildQueryString({
      page,
      pageSize: 20,
      search: debouncedSearch,
      filters: {
        ...(category && { category }),
        ...(status && { status }),
      },
    });
    const res = await api.get<ArticleRow[]>(`/knowledge${qs}`);
    if (res.data) {
      setArticles(res.data);
      if (res.meta) {
        setTotalPages(res.meta.totalPages);
      }
    }
    setLoading(false);
  }, [page, debouncedSearch, category, status]);

  useEffect(() => {
    fetchArticles();
  }, [fetchArticles]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, category, status]);

  return (
    <div>
      <PageHeader
        title="Knowledge Base"
        description="Help articles and documentation"
        actions={
          <Button onClick={() => router.push("/knowledge/new")}>
            <Plus className="h-4 w-4" />
            New Article
          </Button>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search articles..."
          className="w-64"
        />
        <Select
          options={CATEGORY_OPTIONS}
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        />
        <Select
          options={STATUS_OPTIONS}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        />
      </div>

      {loading ? (
        <PageLoader />
      ) : articles.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-12 w-12" />}
          title="No articles found"
          description="Create your first knowledge base article to help your customers."
          action={
            <Button onClick={() => router.push("/knowledge/new")}>
              <Plus className="h-4 w-4" />
              New Article
            </Button>
          }
        />
      ) : (
        <div>
          <div className="grid gap-4">
            {articles.map((article) => (
              <Card
                key={article.id}
                className="cursor-pointer transition-shadow hover:shadow-md"
                onClick={() => router.push(`/knowledge/${article.slug}`)}
              >
                <CardContent className="flex items-center justify-between p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate font-medium text-zinc-900 dark:text-zinc-100">
                        {article.title}
                      </h3>
                      <Badge variant={article.status === "published" ? "success" : "secondary"}>
                        {article.status}
                      </Badge>
                      {article.category && (
                        <Badge variant="outline">{article.category}</Badge>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-zinc-500">
                      Updated {formatDate(article.updatedAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-zinc-500">
                    <span className="flex items-center gap-1">
                      <Eye className="h-3.5 w-3.5" />
                      {article.viewCount}
                    </span>
                    <span className="flex items-center gap-1">
                      <ThumbsUp className="h-3.5 w-3.5" />
                      {article.helpfulCount}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </div>
      )}
    </div>
  );
}
