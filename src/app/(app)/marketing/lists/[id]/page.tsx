"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, type Column } from "@/components/shared/data-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { PageLoader } from "@/components/ui/loading";
import { api, buildQueryString } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import type { ContactList } from "@/types";

interface ListWithCount extends ContactList {
  _count: { memberships: number };
}

interface MemberContact {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  lifecycleStage: string;
}

interface Membership {
  id: string;
  listId: string;
  contactId: string;
  createdAt: string;
  contact: MemberContact;
  [key: string]: unknown;
}

export default function ListDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [list, setList] = useState<ListWithCount | null>(null);
  const [members, setMembers] = useState<Membership[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addContactId, setAddContactId] = useState("");
  const [addError, setAddError] = useState("");

  const fetchList = useCallback(async () => {
    const res = await api.get<ListWithCount>(`/lists/${id}`);
    if (res.data) {
      setList(res.data);
    }
  }, [id]);

  const fetchMembers = useCallback(async () => {
    const qs = buildQueryString({ page, pageSize: 25 });
    const res = await api.get<Membership[]>(
      `/lists/${id}/members${qs}`
    );
    if (res.data) {
      setMembers(res.data);
      setTotalPages(res.meta?.totalPages || 1);
    }
  }, [id, page]);

  useEffect(() => {
    Promise.all([fetchList(), fetchMembers()]).then(() => setLoading(false));
  }, [fetchList, fetchMembers]);

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError("");
    const res = await api.post(`/lists/${id}/members`, {
      contactId: addContactId,
    });
    if (res.error) {
      setAddError(res.error);
      return;
    }
    setShowAddModal(false);
    setAddContactId("");
    fetchList();
    fetchMembers();
  };

  const handleRemoveMember = async (contactId: string) => {
    if (!confirm("Remove this contact from the list?")) return;
    await api.delete(`/lists/${id}/members`);
    // Note: The DELETE endpoint expects contactId in body
    await fetch(`/api/lists/${id}/members`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactId }),
    });
    fetchList();
    fetchMembers();
  };

  const handleDeleteList = async () => {
    if (!confirm("Are you sure you want to delete this list?")) return;
    await api.delete(`/lists/${id}`);
    router.push("/marketing/lists");
  };

  if (loading) return <PageLoader />;
  if (!list) {
    return (
      <div>
        <PageHeader title="List not found" />
        <Link href="/marketing/lists">
          <Button variant="outline">Back to Lists</Button>
        </Link>
      </div>
    );
  }

  const memberColumns: Column<Membership>[] = [
    {
      key: "name",
      label: "Name",
      render: (m) => (
        <span className="font-medium">
          {m.contact.firstName} {m.contact.lastName}
        </span>
      ),
    },
    {
      key: "email",
      label: "Email",
      render: (m) => (
        <span className="text-sm text-zinc-500">
          {m.contact.email || "-"}
        </span>
      ),
    },
    {
      key: "lifecycleStage",
      label: "Stage",
      render: (m) => (
        <Badge variant="outline">{m.contact.lifecycleStage}</Badge>
      ),
    },
    {
      key: "addedAt",
      label: "Added",
      render: (m) => (
        <span className="text-sm text-zinc-500">
          {formatDate(m.createdAt)}
        </span>
      ),
    },
    {
      key: "actions",
      label: "",
      render: (m) => (
        <Button
          variant="ghost"
          size="sm"
          className="text-red-500 hover:text-red-700"
          onClick={(e) => {
            e.stopPropagation();
            handleRemoveMember(m.contactId);
          }}
        >
          Remove
        </Button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title={list.name}
        actions={
          <div className="flex items-center gap-2">
            <Link href="/marketing/lists">
              <Button variant="outline">Back</Button>
            </Link>
            <Button variant="destructive" onClick={handleDeleteList}>
              Delete
            </Button>
          </div>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-zinc-500">
              Type
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant={list.type === "dynamic" ? "default" : "secondary"}>
              {list.type}
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-zinc-500">
              Members
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{list._count.memberships}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-zinc-500">
              Created
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{formatDate(list.createdAt)}</p>
          </CardContent>
        </Card>
      </div>

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Members</h2>
        <Button size="sm" onClick={() => setShowAddModal(true)}>
          Add Member
        </Button>
      </div>

      <DataTable
        columns={memberColumns}
        data={members}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        emptyMessage="No members in this list"
      />

      <Modal
        open={showAddModal}
        onClose={() => {
          setShowAddModal(false);
          setAddError("");
        }}
        title="Add Member"
      >
        <form onSubmit={handleAddMember} className="space-y-4">
          {addError && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">
              {addError}
            </div>
          )}
          <Input
            label="Contact ID"
            value={addContactId}
            onChange={(e) => setAddContactId(e.target.value)}
            required
            placeholder="Enter contact ID"
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowAddModal(false)}
            >
              Cancel
            </Button>
            <Button type="submit">Add</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
