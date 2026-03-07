"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, type Column } from "@/components/shared/data-table";
import { SearchInput } from "@/components/shared/search-input";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { PageLoader } from "@/components/ui/loading";
import { formatDate } from "@/lib/utils";

interface BlogPostItem {
  id: string;
  title: string;
  slug: string;
  author: string | null;
  tags: string | null;
  status: string;
  viewCount: number;
  publishedAt: string | null;
  updatedAt: string;
}

const statusOptions = [
  { value: "", label: "All Statuses" },
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
];

export default function BlogListPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState<BlogPostItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: "25",
        sortBy: "updatedAt",
        sortDir: "desc",
      });
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);

      const res = await fetch(`/api/blog?${params}`);
      const json = await res.json();

      setPosts(json.data || []);
      setTotalPages(json.meta?.totalPages || 1);
    } catch {
      // silently handle
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  const columns: Column<BlogPostItem>[] = [
    {
      key: "title",
      label: "Title",
      render: (item) => (
        <div>
          <p className="font-medium text-zinc-900 dark:text-zinc-100">
            {item.title}
          </p>
          <p className="text-xs text-zinc-400">/{item.slug}</p>
        </div>
      ),
    },
    {
      key: "author",
      label: "Author",
      render: (item) => (
        <span className="text-sm text-zinc-600 dark:text-zinc-400">
          {item.author || "-"}
        </span>
      ),
    },
    {
      key: "tags",
      label: "Tags",
      render: (item) => {
        if (!item.tags) return <span className="text-sm text-zinc-400">-</span>;
        const tagList = item.tags.split(",").map((t) => t.trim()).filter(Boolean);
        return (
          <div className="flex flex-wrap gap-1">
            {tagList.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
            {tagList.length > 3 && (
              <Badge variant="secondary" className="text-xs">
                +{tagList.length - 3}
              </Badge>
            )}
          </div>
        );
      },
    },
    {
      key: "status",
      label: "Status",
      render: (item) => (
        <Badge variant={item.status === "published" ? "success" : "secondary"}>
          {item.status}
        </Badge>
      ),
    },
    {
      key: "viewCount",
      label: "Views",
      render: (item) => (
        <span className="text-sm text-zinc-500">{item.viewCount}</span>
      ),
    },
    {
      key: "updatedAt",
      label: "Updated",
      render: (item) => (
        <span className="text-sm text-zinc-500">{formatDate(item.updatedAt)}</span>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Blog Posts"
        description="AI-managed blog content"
        actions={
          <span className="text-sm text-zinc-500">Managed autonomously by AI</span>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search blog posts..."
          className="sm:w-64"
        />
        <Select
          options={statusOptions}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          placeholder="All Statuses"
        />
      </div>

      {loading ? (
        <PageLoader />
      ) : (
        <DataTable
          columns={columns}
          data={posts}
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          onRowClick={(item) =>
            router.push(`/cms/blog/${(item as unknown as BlogPostItem).id}`)
          }
          emptyMessage="No blog posts found"
        />
      )}
    </div>
  );
}
