"use client";

import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { SearchInput } from "@/components/shared/search-input";
import { Select } from "@/components/ui/select";
import { PageLoader } from "@/components/ui/loading";
import { EnrollmentTable } from "@/components/sequences/enrollment-table";
import { api, buildQueryString } from "@/lib/api";

interface EnrollmentContact {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  jobTitle?: string | null;
  company?: { id: string; name: string } | null;
}

interface EnrollmentSequence {
  id: string;
  name: string;
  steps: string;
}

interface Enrollment {
  id: string;
  sequenceId: string;
  contactId: string;
  status: string;
  currentStep: number;
  channel: string;
  nextActionAt: string | null;
  completedAt: string | null;
  createdAt: string;
  totalSteps: number;
  contact: EnrollmentContact;
  sequence: EnrollmentSequence;
}

const statusOptions = [
  { value: "", label: "All Statuses" },
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "completed", label: "Completed" },
  { value: "bounced", label: "Bounced" },
  { value: "replied", label: "Replied" },
  { value: "unsubscribed", label: "Unsubscribed" },
];

export default function EnrollmentsPage() {
  const [loading, setLoading] = useState(true);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchEnrollments = useCallback(async () => {
    setLoading(true);
    const qs = buildQueryString({
      page,
      search,
      filters: status ? { status } : {},
    });
    const res = await api.get<Enrollment[]>(`/sequences/enrollments${qs}`);

    if (res.data) {
      setEnrollments(res.data);
      setTotalPages(res.meta?.totalPages || 1);
    }
    setLoading(false);
  }, [page, search, status]);

  useEffect(() => {
    fetchEnrollments();
  }, [fetchEnrollments]);

  if (loading && enrollments.length === 0) {
    return <PageLoader />;
  }

  return (
    <div>
      <PageHeader
        title="All Enrollments"
        description="Global view of all sequence enrollments"
      />

      <div className="mb-4 flex items-center gap-4">
        <SearchInput
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          placeholder="Search by contact or sequence..."
          className="flex-1"
        />
        <Select
          options={statusOptions}
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          placeholder="Filter by status"
        />
      </div>

      <EnrollmentTable
        enrollments={enrollments}
        showSequence
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        onRefresh={fetchEnrollments}
      />
    </div>
  );
}
