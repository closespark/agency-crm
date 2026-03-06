"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { SearchInput } from "@/components/shared/search-input";
import { DataTable, type Column } from "@/components/shared/data-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { PageLoader } from "@/components/ui/loading";
import { api, buildQueryString } from "@/lib/api";
import { formatDate } from "@/lib/utils";

interface ListWithCount {
  id: string;
  name: string;
  type: string;
  createdAt: string;
  updatedAt: string;
  _count: { memberships: number };
  [key: string]: unknown;
}

export default function ListsPage() {
  const router = useRouter();
  const [lists, setLists] = useState<ListWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [showNewModal, setShowNewModal] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchLists = useCallback(async () => {
    setLoading(true);
    const qs = buildQueryString({ page, pageSize: 25, search });
    const res = await api.get<ListWithCount[]>(`/lists${qs}`);
    if (res.data) {
      setLists(res.data);
      setTotalPages(res.meta?.totalPages || 1);
    }
    setLoading(false);
  }, [page, search]);

  useEffect(() => {
    fetchLists();
  }, [fetchLists]);

  useEffect(() => {
    setPage(1);
  }, [search]);

  const handleCreateList = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get("name") as string,
      type: formData.get("type") as string,
    };

    const res = await api.post("/lists", data);
    if (!res.error) {
      setShowNewModal(false);
      fetchLists();
    }
    setSaving(false);
  };

  const columns: Column<ListWithCount>[] = [
    {
      key: "name",
      label: "Name",
      render: (list) => (
        <span className="font-medium">{list.name}</span>
      ),
    },
    {
      key: "type",
      label: "Type",
      render: (list) => (
        <Badge variant={list.type === "dynamic" ? "default" : "secondary"}>
          {list.type}
        </Badge>
      ),
    },
    {
      key: "members",
      label: "Members",
      render: (list) => (
        <span className="text-sm">{list._count.memberships}</span>
      ),
    },
    {
      key: "createdAt",
      label: "Created",
      render: (list) => (
        <span className="text-sm text-zinc-500">
          {formatDate(list.createdAt)}
        </span>
      ),
    },
  ];

  if (loading) return <PageLoader />;

  return (
    <div>
      <PageHeader
        title="Contact Lists"
        description="Organize contacts into targeted lists"
        actions={
          <Button onClick={() => setShowNewModal(true)}>New List</Button>
        }
      />

      <div className="mb-4">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search lists..."
          className="w-64"
        />
      </div>

      <DataTable
        columns={columns}
        data={lists}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        onRowClick={(list) => router.push(`/marketing/lists/${list.id}`)}
        emptyMessage="No contact lists found"
      />

      <Modal
        open={showNewModal}
        onClose={() => setShowNewModal(false)}
        title="New Contact List"
      >
        <form onSubmit={handleCreateList} className="space-y-4">
          <Input
            id="listName"
            name="name"
            label="List Name"
            required
            placeholder="e.g. Newsletter Subscribers"
          />
          <Select
            id="listType"
            name="type"
            label="List Type"
            options={[
              { value: "static", label: "Static" },
              { value: "dynamic", label: "Dynamic" },
            ]}
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowNewModal(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Creating..." : "Create List"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
