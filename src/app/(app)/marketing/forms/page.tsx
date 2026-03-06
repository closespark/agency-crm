"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { SearchInput } from "@/components/shared/search-input";
import { DataTable, type Column } from "@/components/shared/data-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageLoader } from "@/components/ui/loading";
import { api, buildQueryString } from "@/lib/api";
import { formatDate } from "@/lib/utils";

interface FormWithCount {
  id: string;
  name: string;
  isActive: boolean;
  submitLabel: string;
  createdAt: string;
  updatedAt: string;
  _count: { submissions: number };
  [key: string]: unknown;
}

export default function FormsPage() {
  const router = useRouter();
  const [forms, setForms] = useState<FormWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchForms = useCallback(async () => {
    setLoading(true);
    const qs = buildQueryString({ page, pageSize: 25, search });
    const res = await api.get<FormWithCount[]>(`/forms${qs}`);
    if (res.data) {
      setForms(res.data);
      setTotalPages(res.meta?.totalPages || 1);
    }
    setLoading(false);
  }, [page, search]);

  useEffect(() => {
    fetchForms();
  }, [fetchForms]);

  useEffect(() => {
    setPage(1);
  }, [search]);

  const columns: Column<FormWithCount>[] = [
    {
      key: "name",
      label: "Name",
      render: (form) => (
        <span className="font-medium">{form.name}</span>
      ),
    },
    {
      key: "isActive",
      label: "Status",
      render: (form) => (
        <Badge variant={form.isActive ? "success" : "secondary"}>
          {form.isActive ? "Active" : "Inactive"}
        </Badge>
      ),
    },
    {
      key: "submissions",
      label: "Submissions",
      render: (form) => (
        <span className="text-sm">{form._count.submissions}</span>
      ),
    },
    {
      key: "createdAt",
      label: "Created",
      render: (form) => (
        <span className="text-sm text-zinc-500">
          {formatDate(form.createdAt)}
        </span>
      ),
    },
  ];

  if (loading) return <PageLoader />;

  return (
    <div>
      <PageHeader
        title="Forms"
        description="Build forms to capture leads and submissions"
        actions={
          <Link href="/marketing/forms/new">
            <Button>New Form</Button>
          </Link>
        }
      />

      <div className="mb-4">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search forms..."
          className="w-64"
        />
      </div>

      <DataTable
        columns={columns}
        data={forms}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        onRowClick={(form) => router.push(`/marketing/forms/${form.id}`)}
        emptyMessage="No forms found"
      />
    </div>
  );
}
