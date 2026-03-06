"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, type Column } from "@/components/shared/data-table";
import { SearchInput } from "@/components/shared/search-input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { PageLoader } from "@/components/ui/loading";
import { formatDate } from "@/lib/utils";

interface PageItem {
  id: string;
  title: string;
  slug: string;
  template: string;
  status: string;
  updatedAt: string;
  publishedAt: string | null;
}

const statusOptions = [
  { value: "", label: "All Statuses" },
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
];

export default function PagesListPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [pages, setPages] = useState<PageItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const fetchPages = useCallback(async () => {
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

      const res = await fetch(`/api/pages?${params}`);
      const json = await res.json();

      setPages(json.data || []);
      setTotalPages(json.meta?.totalPages || 1);
    } catch {
      // silently handle
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter]);

  useEffect(() => {
    fetchPages();
  }, [fetchPages]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  const columns: Column<PageItem>[] = [
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
      key: "template",
      label: "Template",
      render: (item) => (
        <span className="text-sm capitalize">{item.template}</span>
      ),
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
        title="Pages"
        description="Manage your website pages"
        actions={
          <Button onClick={() => router.push("/cms/pages/new")}>
            New Page
          </Button>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search pages..."
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
          data={pages}
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          onRowClick={(item) =>
            router.push(`/cms/pages/${(item as unknown as PageItem).id}`)
          }
          emptyMessage="No pages found"
        />
      )}
    </div>
  );
}
