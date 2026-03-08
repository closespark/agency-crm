"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, type Column } from "@/components/shared/data-table";
import { SearchInput } from "@/components/shared/search-input";
import { PageLoader } from "@/components/ui/loading";
import { useDebounce } from "@/hooks/use-debounce";
import { usePagination } from "@/hooks/use-pagination";
import { buildQueryString } from "@/lib/api";
import { formatDate } from "@/lib/utils";

interface CompanyRow {
  id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  size: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  createdAt: string;
  _count: { contacts: number; deals: number };
}

const INDUSTRY_OPTIONS = [
  { value: "", label: "All Industries" },
  { value: "Technology", label: "Technology" },
  { value: "Finance", label: "Finance" },
  { value: "Healthcare", label: "Healthcare" },
  { value: "Education", label: "Education" },
  { value: "Retail", label: "Retail" },
  { value: "Manufacturing", label: "Manufacturing" },
  { value: "Services", label: "Services" },
  { value: "Other", label: "Other" },
];

const SIZE_OPTIONS = [
  { value: "", label: "All Sizes" },
  { value: "1-10", label: "1-10" },
  { value: "11-50", label: "11-50" },
  { value: "51-200", label: "51-200" },
  { value: "201-500", label: "201-500" },
  { value: "501-1000", label: "501-1000" },
  { value: "1001+", label: "1001+" },
];

export default function CompaniesPage() {
  const router = useRouter();
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [industry, setIndustry] = useState("");
  const [size, setSize] = useState("");
  const { page, setPage, pageSize } = usePagination();
  const debouncedSearch = useDebounce(search);

  const fetchCompanies = useCallback(async () => {
    setLoading(true);
    const qs = buildQueryString({
      page,
      pageSize,
      search: debouncedSearch,
      filters: {
        ...(industry && { industry }),
        ...(size && { size }),
      },
    });

    try {
      const res = await fetch(`/api/companies${qs}`);
      const json = await res.json();
      if (json.data) {
        setCompanies(json.data);
        setTotalPages(json.meta?.totalPages || 1);
      }
    } catch (err) {
      console.error("Failed to fetch companies:", err);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, debouncedSearch, industry, size]);

  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, industry, size, setPage]);

  const columns: Column<CompanyRow>[] = [
    {
      key: "name",
      label: "Company",
      render: (company) => (
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
            <Building2 className="h-4 w-4 text-zinc-500" />
          </div>
          <div>
            <div className="font-medium">{company.name}</div>
            {company.domain && (
              <div className="text-xs text-zinc-500">{company.domain}</div>
            )}
          </div>
        </div>
      ),
    },
    {
      key: "industry",
      label: "Industry",
      render: (company) =>
        company.industry ? (
          <Badge variant="secondary">{company.industry}</Badge>
        ) : (
          "-"
        ),
    },
    {
      key: "size",
      label: "Size",
      render: (company) => company.size || "-",
    },
    {
      key: "location",
      label: "Location",
      render: (company) => {
        const parts = [company.city, company.state, company.country].filter(
          Boolean
        );
        return parts.length > 0 ? parts.join(", ") : "-";
      },
    },
    {
      key: "contacts",
      label: "Contacts",
      render: (company) => company._count.contacts,
    },
    {
      key: "deals",
      label: "Deals",
      render: (company) => company._count.deals,
    },
    {
      key: "createdAt",
      label: "Created",
      render: (company) => formatDate(company.createdAt),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Companies"
        description="Auto-created from prospect data"
        actions={
          <span className="text-sm text-zinc-500">Managed autonomously by AI</span>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search companies..."
          className="w-64"
        />
        <Select
          options={INDUSTRY_OPTIONS}
          value={industry}
          onChange={(e) => setIndustry(e.target.value)}
        />
        <Select
          options={SIZE_OPTIONS}
          value={size}
          onChange={(e) => setSize(e.target.value)}
        />
      </div>

      {loading ? (
        <PageLoader />
      ) : (
        <DataTable
          columns={columns}
          data={companies}
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          onRowClick={(item) => router.push(`/companies/${item.id}`)}
          emptyMessage="No companies found"
        />
      )}
    </div>
  );
}
