"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { SearchInput } from "@/components/shared/search-input";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Pagination } from "@/components/ui/pagination";
import { PageLoader, EmptyState } from "@/components/ui/loading";
import { Tabs } from "@/components/ui/tabs";
import { ProspectTable } from "@/components/prospecting/prospect-table";
import { ProspectCard } from "@/components/prospecting/prospect-card";
import { useDebounce } from "@/hooks/use-debounce";

interface Prospect {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  jobTitle: string | null;
  companyName: string | null;
  companySize: string | null;
  industry: string | null;
  location: string | null;
  fitScore: number | null;
  status: string;
}

interface SearchDetail {
  id: string;
  name: string;
  icp: string;
  status: string;
  resultsCount: number;
  createdAt: string;
  prospects: Prospect[];
}

const statusOptions = [
  { value: "", label: "All statuses" },
  { value: "new", label: "New" },
  { value: "verified", label: "Verified" },
  { value: "contacted", label: "Contacted" },
  { value: "converted", label: "Converted" },
  { value: "rejected", label: "Rejected" },
];

export default function SearchResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [searchDetail, setSearchDetail] = useState<SearchDetail | null>(null);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [minFitScore, setMinFitScore] = useState("");
  const [maxFitScore, setMaxFitScore] = useState("");
  const [sortBy, setSortBy] = useState("fitScore");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [confirmAction, setConfirmAction] = useState<{ type: string; open: boolean }>({ type: "", open: false });
  const debouncedSearch = useDebounce(search, 300);

  const fetchSearch = useCallback(async () => {
    const res = await fetch(`/api/prospecting/searches/${id}`);
    const data = await res.json();
    if (data.data) setSearchDetail(data.data);
  }, [id]);

  const fetchProspects = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      searchId: id,
      page: String(page),
      pageSize: "20",
      sortBy,
      sortDir,
    });
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (statusFilter) params.set("status", statusFilter);
    if (minFitScore) params.set("minFitScore", minFitScore);
    if (maxFitScore) params.set("maxFitScore", maxFitScore);

    const res = await fetch(`/api/prospecting/prospects?${params}`);
    const data = await res.json();
    if (data.data) {
      setProspects(data.data);
      setTotalPages(data.meta?.totalPages || 1);
    }
    setLoading(false);
  }, [id, page, sortBy, sortDir, debouncedSearch, statusFilter, minFitScore, maxFitScore]);

  useEffect(() => {
    fetchSearch();
  }, [fetchSearch]);

  useEffect(() => {
    fetchProspects();
  }, [fetchProspects]);

  function toggleSelect(prospectId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(prospectId)) next.delete(prospectId);
      else next.add(prospectId);
      return next;
    });
  }

  function toggleSelectAll() {
    if (prospects.every((p) => selectedIds.has(p.id))) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(prospects.map((p) => p.id)));
    }
  }

  function handleSort(field: string) {
    if (sortBy === field) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortDir("desc");
    }
  }

  async function handleBulkConvert() {
    if (selectedIds.size === 0) return;
    setActionLoading(true);
    try {
      const res = await fetch("/api/prospecting/bulk-convert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prospectIds: Array.from(selectedIds) }),
      });
      if (res.ok) {
        setSelectedIds(new Set());
        fetchProspects();
        fetchSearch();
      }
    } finally {
      setActionLoading(false);
      setConfirmAction({ type: "", open: false });
    }
  }

  async function handleBulkReject() {
    if (selectedIds.size === 0) return;
    setActionLoading(true);
    try {
      for (const pid of selectedIds) {
        await fetch(`/api/prospecting/prospects/${pid}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "rejected" }),
        });
      }
      setSelectedIds(new Set());
      fetchProspects();
    } finally {
      setActionLoading(false);
      setConfirmAction({ type: "", open: false });
    }
  }

  async function handleDeleteSearch() {
    const res = await fetch(`/api/prospecting/searches/${id}`, { method: "DELETE" });
    if (res.ok) router.push("/prospecting");
  }

  if (!searchDetail && loading) return <PageLoader />;

  return (
    <div>
      <PageHeader
        title={searchDetail?.name || "Search Results"}
        description={`${searchDetail?.resultsCount || 0} prospects found`}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.push("/prospecting")}>
              Back
            </Button>
            <Button
              variant="destructive"
              onClick={() => setConfirmAction({ type: "delete", open: true })}
            >
              Delete Search
            </Button>
          </div>
        }
      />

      {searchDetail && (
        <div className="mb-4">
          <Badge variant={searchDetail.status === "complete" ? "success" : "warning"}>
            {searchDetail.status}
          </Badge>
        </div>
      )}

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search prospects..."
          className="w-64"
        />
        <Select
          options={statusOptions}
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
        />
        <div className="flex items-center gap-2">
          <label className="text-xs text-zinc-500">Fit Score:</label>
          <input
            type="number"
            value={minFitScore}
            onChange={(e) => { setMinFitScore(e.target.value); setPage(1); }}
            placeholder="Min"
            className="h-9 w-16 rounded-md border border-zinc-300 px-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
          <span className="text-zinc-400">-</span>
          <input
            type="number"
            value={maxFitScore}
            onChange={(e) => { setMaxFitScore(e.target.value); setPage(1); }}
            placeholder="Max"
            className="h-9 w-16 rounded-md border border-zinc-300 px-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </div>
      </div>

      {/* Bulk actions */}
      {selectedIds.size > 0 && (
        <div className="mb-4 flex items-center gap-3 rounded-md bg-blue-50 p-3 dark:bg-blue-900/20">
          <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
            {selectedIds.size} selected
          </span>
          <Button
            size="sm"
            onClick={() => setConfirmAction({ type: "convert", open: true })}
            disabled={actionLoading}
          >
            Convert to Contacts
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => setConfirmAction({ type: "reject", open: true })}
            disabled={actionLoading}
          >
            Reject
          </Button>
        </div>
      )}

      {loading ? (
        <PageLoader />
      ) : prospects.length === 0 ? (
        <EmptyState
          title="No prospects found"
          description="Try adjusting your filters or run a new search."
        />
      ) : (
        <Tabs
          tabs={[
            {
              id: "table",
              label: "Table View",
              content: (
                <>
                  <ProspectTable
                    prospects={prospects}
                    selectedIds={selectedIds}
                    onToggleSelect={toggleSelect}
                    onToggleSelectAll={toggleSelectAll}
                    sortBy={sortBy}
                    sortDir={sortDir}
                    onSort={handleSort}
                  />
                  <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
                </>
              ),
            },
            {
              id: "grid",
              label: "Grid View",
              content: (
                <>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {prospects.map((p) => (
                      <ProspectCard
                        key={p.id}
                        prospect={p}
                        selected={selectedIds.has(p.id)}
                        onSelect={toggleSelect}
                      />
                    ))}
                  </div>
                  <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
                </>
              ),
            },
          ]}
        />
      )}

      <ConfirmDialog
        open={confirmAction.type === "convert" && confirmAction.open}
        onClose={() => setConfirmAction({ type: "", open: false })}
        onConfirm={handleBulkConvert}
        title="Convert to Contacts"
        message={`Convert ${selectedIds.size} prospect(s) to CRM contacts? This will create contact records for each.`}
        confirmLabel="Convert"
      />

      <ConfirmDialog
        open={confirmAction.type === "reject" && confirmAction.open}
        onClose={() => setConfirmAction({ type: "", open: false })}
        onConfirm={handleBulkReject}
        title="Reject Prospects"
        message={`Reject ${selectedIds.size} prospect(s)? They will be marked as rejected.`}
        confirmLabel="Reject"
        destructive
      />

      <ConfirmDialog
        open={confirmAction.type === "delete" && confirmAction.open}
        onClose={() => setConfirmAction({ type: "", open: false })}
        onConfirm={handleDeleteSearch}
        title="Delete Search"
        message="This will permanently delete this search and all its prospects."
        confirmLabel="Delete"
        destructive
      />
    </div>
  );
}
