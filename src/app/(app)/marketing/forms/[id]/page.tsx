"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, type Column } from "@/components/shared/data-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageLoader } from "@/components/ui/loading";
import { api, buildQueryString } from "@/lib/api";
import { formatDate, formatDateTime, parseJSON } from "@/lib/utils";
import type { Form } from "@/types";

interface FormWithCount extends Form {
  _count: { submissions: number };
}

interface SubmissionContact {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
}

interface Submission {
  id: string;
  formId: string;
  contactId: string | null;
  data: string;
  createdAt: string;
  contact: SubmissionContact | null;
  [key: string]: unknown;
}

export default function FormDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [form, setForm] = useState<FormWithCount | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [subPage, setSubPage] = useState(1);
  const [subTotalPages, setSubTotalPages] = useState(1);

  const fetchForm = useCallback(async () => {
    const res = await api.get<FormWithCount>(`/forms/${id}`);
    if (res.data) {
      setForm(res.data);
    }
  }, [id]);

  const fetchSubmissions = useCallback(async () => {
    const qs = buildQueryString({ page: subPage, pageSize: 25 });
    const res = await api.get<Submission[]>(
      `/forms/${id}/submissions${qs}`
    );
    if (res.data) {
      setSubmissions(res.data);
      setSubTotalPages(res.meta?.totalPages || 1);
    }
  }, [id, subPage]);

  useEffect(() => {
    Promise.all([fetchForm(), fetchSubmissions()]).then(() =>
      setLoading(false)
    );
  }, [fetchForm, fetchSubmissions]);

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this form?")) return;
    await api.delete(`/forms/${id}`);
    router.push("/marketing/forms");
  };

  if (loading) return <PageLoader />;
  if (!form) {
    return (
      <div>
        <PageHeader title="Form not found" />
        <Link href="/marketing/forms">
          <Button variant="outline">Back to Forms</Button>
        </Link>
      </div>
    );
  }

  const fields = parseJSON<
    { id: string; label: string; type: string; required: boolean }[]
  >(form.fields, []);

  const submissionColumns: Column<Submission>[] = [
    {
      key: "contact",
      label: "Contact",
      render: (sub) =>
        sub.contact ? (
          <span className="font-medium">
            {sub.contact.firstName} {sub.contact.lastName}
          </span>
        ) : (
          <span className="text-zinc-400">Anonymous</span>
        ),
    },
    {
      key: "data",
      label: "Data",
      render: (sub) => {
        const data = parseJSON<Record<string, unknown>>(sub.data, {});
        const entries = Object.entries(data).slice(0, 3);
        return (
          <div className="max-w-xs truncate text-sm text-zinc-500">
            {entries
              .map(([k, v]) => `${k}: ${v}`)
              .join(", ")}
            {Object.keys(data).length > 3 && "..."}
          </div>
        );
      },
    },
    {
      key: "createdAt",
      label: "Submitted",
      render: (sub) => (
        <span className="text-sm text-zinc-500">
          {formatDateTime(sub.createdAt)}
        </span>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title={form.name}
        actions={
          <div className="flex items-center gap-2">
            <Link href="/marketing/forms">
              <Button variant="outline">Back</Button>
            </Link>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Form Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-sm font-medium text-zinc-500">Status</p>
              <Badge variant={form.isActive ? "success" : "secondary"}>
                {form.isActive ? "Active" : "Inactive"}
              </Badge>
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-500">
                Submit Button
              </p>
              <p className="text-sm">{form.submitLabel}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-500">Submissions</p>
              <p className="text-sm">{form._count.submissions}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-500">Created</p>
              <p className="text-sm">{formatDate(form.createdAt)}</p>
            </div>
            {form.redirectUrl && (
              <div>
                <p className="text-sm font-medium text-zinc-500">
                  Redirect URL
                </p>
                <p className="truncate text-sm">{form.redirectUrl}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Fields ({fields.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {fields.length === 0 ? (
              <p className="text-sm text-zinc-400">No fields defined</p>
            ) : (
              <div className="space-y-2">
                {fields.map((field) => (
                  <div
                    key={field.id}
                    className="flex items-center justify-between rounded border border-zinc-100 p-2 dark:border-zinc-800"
                  >
                    <div>
                      <p className="text-sm font-medium">{field.label}</p>
                      <p className="text-xs text-zinc-400">{field.type}</p>
                    </div>
                    {field.required && (
                      <Badge variant="outline" className="text-xs">
                        Required
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-6">
        <h2 className="mb-4 text-lg font-semibold">Submissions</h2>
        <DataTable
          columns={submissionColumns}
          data={submissions}
          page={subPage}
          totalPages={subTotalPages}
          onPageChange={setSubPage}
          emptyMessage="No submissions yet"
        />
      </div>
    </div>
  );
}
