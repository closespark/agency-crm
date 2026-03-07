"use client";

import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { SearchInput } from "@/components/shared/search-input";
import { Pagination } from "@/components/ui/pagination";
import { PageLoader, EmptyState } from "@/components/ui/loading";
import { TemplatePreview } from "@/components/marketing/template-preview";
import { api, buildQueryString } from "@/lib/api";
import type { EmailTemplate } from "@/types";

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    const qs = buildQueryString({ page, pageSize: 12, search });
    const res = await api.get<EmailTemplate[]>(`/templates${qs}`);
    if (res.data) {
      setTemplates(res.data);
      setTotalPages(res.meta?.totalPages || 1);
    }
    setLoading(false);
  }, [page, search]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  useEffect(() => {
    setPage(1);
  }, [search]);

  return (
    <div>
      <PageHeader
        title="Email Templates"
        description="AI-generated email templates"
        actions={
          <span className="text-sm text-zinc-500">Managed autonomously by AI</span>
        }
      />

      <div className="mb-4">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search templates..."
          className="w-64"
        />
      </div>

      {loading ? (
        <PageLoader />
      ) : templates.length === 0 ? (
        <EmptyState
          title="No templates found"
          description="Managed autonomously by AI. Templates will appear after the next autopilot cycle."
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((template) => (
              <TemplatePreview key={template.id} template={template} />
            ))}
          </div>
          <Pagination
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
}
