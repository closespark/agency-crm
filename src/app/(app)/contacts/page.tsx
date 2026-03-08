"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, type Column } from "@/components/shared/data-table";
import { SearchInput } from "@/components/shared/search-input";
import { PageLoader } from "@/components/ui/loading";
import { Avatar } from "@/components/ui/avatar";
import { useDebounce } from "@/hooks/use-debounce";
import { usePagination } from "@/hooks/use-pagination";
import { buildQueryString } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { LIFECYCLE_STAGES } from "@/types";

interface ContactRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  lifecycleStage: string;
  leadStatus: string | null;
  createdAt: string;
  company: { id: string; name: string } | null;
  owner: { id: string; name: string | null; image: string | null } | null;
}

const LEAD_STATUSES = [
  { value: "", label: "All Lead Statuses" },
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "interested", label: "Interested" },
  { value: "unqualified", label: "Unqualified" },
  { value: "bad_timing", label: "Bad Timing" },
];

const LIFECYCLE_OPTIONS = [
  { value: "", label: "All Lifecycle Stages" },
  ...LIFECYCLE_STAGES.map((s) => ({
    value: s,
    label: s.charAt(0).toUpperCase() + s.slice(1),
  })),
];

function getLifecycleBadgeVariant(stage: string) {
  switch (stage) {
    case "customer":
    case "evangelist":
      return "success" as const;
    case "opportunity":
    case "sql":
      return "warning" as const;
    case "mql":
      return "default" as const;
    default:
      return "secondary" as const;
  }
}

export default function ContactsPage() {
  const router = useRouter();
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [lifecycleStage, setLifecycleStage] = useState("");
  const [leadStatus, setLeadStatus] = useState("");
  const { page, setPage, pageSize } = usePagination();
  const debouncedSearch = useDebounce(search);

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    const qs = buildQueryString({
      page,
      pageSize,
      search: debouncedSearch,
      filters: {
        ...(lifecycleStage && { lifecycleStage }),
        ...(leadStatus && { leadStatus }),
      },
    });

    try {
      const res = await fetch(`/api/contacts${qs}`);
      const json = await res.json();
      if (json.data) {
        setContacts(json.data);
        setTotalPages(json.meta?.totalPages || 1);
      }
    } catch (err) {
      console.error("Failed to fetch contacts:", err);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, debouncedSearch, lifecycleStage, leadStatus]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, lifecycleStage, leadStatus, setPage]);

  const columns: Column<ContactRow>[] = [
    {
      key: "name",
      label: "Name",
      render: (contact) => (
        <div className="flex items-center gap-3">
          <Avatar
            name={`${contact.firstName} ${contact.lastName}`}
            size="sm"
          />
          <div>
            <div className="font-medium">
              {contact.firstName} {contact.lastName}
            </div>
            {contact.email && (
              <div className="text-xs text-zinc-500">{contact.email}</div>
            )}
          </div>
        </div>
      ),
    },
    {
      key: "company",
      label: "Company",
      render: (contact) => contact.company?.name || "-",
    },
    {
      key: "lifecycleStage",
      label: "Lifecycle Stage",
      render: (contact) => (
        <Badge variant={getLifecycleBadgeVariant(contact.lifecycleStage)}>
          {contact.lifecycleStage}
        </Badge>
      ),
    },
    {
      key: "leadStatus",
      label: "Lead Status",
      render: (contact) =>
        contact.leadStatus ? (
          <Badge variant="outline">{contact.leadStatus.replace(/_/g, " ")}</Badge>
        ) : (
          "-"
        ),
    },
    {
      key: "owner",
      label: "Owner",
      render: (contact) => contact.owner?.name || "-",
    },
    {
      key: "createdAt",
      label: "Created",
      render: (contact) => formatDate(contact.createdAt),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Contacts"
        description="Auto-created from prospect conversion and integrations"
        actions={
          <span className="text-sm text-zinc-500">Managed autonomously by AI</span>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search contacts..."
          className="w-64"
        />
        <Select
          options={LIFECYCLE_OPTIONS}
          value={lifecycleStage}
          onChange={(e) => setLifecycleStage(e.target.value)}
        />
        <Select
          options={LEAD_STATUSES}
          value={leadStatus}
          onChange={(e) => setLeadStatus(e.target.value)}
        />
      </div>

      {loading ? (
        <PageLoader />
      ) : (
        <DataTable
          columns={columns}
          data={contacts}
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          onRowClick={(item) => router.push(`/contacts/${item.id}`)}
          emptyMessage="No contacts found"
        />
      )}
    </div>
  );
}
