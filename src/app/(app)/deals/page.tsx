"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { formatDate, formatCurrency } from "@/lib/utils";
import { DEAL_STAGES } from "@/types";

interface DealRow {
  id: string;
  name: string;
  amount: number | null;
  currency: string;
  stage: string;
  probability: number | null;
  closeDate: string | null;
  createdAt: string;
  owner: { id: string; name: string | null; image: string | null } | null;
  contact: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
  } | null;
  company: { id: string; name: string } | null;
}

const STAGE_OPTIONS = [
  { value: "", label: "All Stages" },
  ...DEAL_STAGES.map((s) => ({
    value: s,
    label: s
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" "),
  })),
];

function getStageBadgeVariant(stage: string) {
  switch (stage) {
    case "closed_won":
      return "success" as const;
    case "closed_lost":
      return "danger" as const;
    case "proposal_sent":
    case "negotiation":
    case "contract_sent":
      return "warning" as const;
    default:
      return "default" as const;
  }
}

export default function DealsPage() {
  const router = useRouter();
  const [deals, setDeals] = useState<DealRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState("");
  const { page, setPage, pageSize } = usePagination();
  const debouncedSearch = useDebounce(search);

  const fetchDeals = useCallback(async () => {
    setLoading(true);
    const qs = buildQueryString({
      page,
      pageSize,
      search: debouncedSearch,
      filters: {
        ...(stage && { stage }),
      },
    });

    const res = await fetch(`/api/deals${qs}`);
    const json = await res.json();
    if (json.data) {
      setDeals(json.data);
      setTotalPages(json.meta?.totalPages || 1);
    }
    setLoading(false);
  }, [page, pageSize, debouncedSearch, stage]);

  useEffect(() => {
    fetchDeals();
  }, [fetchDeals]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, stage, setPage]);

  const columns: Column<DealRow>[] = [
    {
      key: "name",
      label: "Deal Name",
      render: (deal) => <span className="font-medium">{deal.name}</span>,
    },
    {
      key: "amount",
      label: "Amount",
      render: (deal) =>
        deal.amount ? formatCurrency(deal.amount, deal.currency) : "-",
    },
    {
      key: "stage",
      label: "Stage",
      render: (deal) => (
        <Badge variant={getStageBadgeVariant(deal.stage)}>
          {deal.stage.replace("_", " ")}
        </Badge>
      ),
    },
    {
      key: "contact",
      label: "Contact",
      render: (deal) =>
        deal.contact
          ? `${deal.contact.firstName} ${deal.contact.lastName}`
          : "-",
    },
    {
      key: "company",
      label: "Company",
      render: (deal) => deal.company?.name || "-",
    },
    {
      key: "owner",
      label: "Owner",
      render: (deal) =>
        deal.owner ? (
          <div className="flex items-center gap-2">
            <Avatar
              name={deal.owner.name || ""}
              src={deal.owner.image}
              size="sm"
            />
            <span className="text-sm">{deal.owner.name}</span>
          </div>
        ) : (
          "-"
        ),
    },
    {
      key: "closeDate",
      label: "Close Date",
      render: (deal) => (deal.closeDate ? formatDate(deal.closeDate) : "-"),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Deals"
        description="Track your sales pipeline"
        actions={
          <Button onClick={() => router.push("/deals/new")}>
            <Plus className="h-4 w-4" />
            Add Deal
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search deals..."
          className="w-64"
        />
        <Select
          options={STAGE_OPTIONS}
          value={stage}
          onChange={(e) => setStage(e.target.value)}
        />
      </div>

      {loading ? (
        <PageLoader />
      ) : (
        <DataTable
          columns={columns}
          data={deals}
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          onRowClick={(item) => router.push(`/deals/${item.id}`)}
          emptyMessage="No deals found"
        />
      )}
    </div>
  );
}
