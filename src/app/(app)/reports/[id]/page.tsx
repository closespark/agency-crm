"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/loading";
import { formatDate, parseJSON } from "@/lib/utils";

interface SavedReport {
  id: string;
  name: string;
  type: string;
  config: string;
  createdAt: string;
  updatedAt: string;
}

interface ReportConfig {
  objects?: string[];
  filters?: Record<string, unknown>;
  groupBy?: string;
  metrics?: string[];
  description?: string;
}

export default function ReportDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [report, setReport] = useState<SavedReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/reports/${id}`)
      .then((res) => {
        if (!res.ok) throw new Error("Report not found");
        return res.json();
      })
      .then((res) => setReport(res.data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="flex h-96 flex-col items-center justify-center">
        <p className="text-lg font-medium text-zinc-900 dark:text-zinc-100">
          {error || "Report not found"}
        </p>
        <button
          onClick={() => router.push("/reports")}
          className="mt-4 text-sm text-indigo-600 hover:underline"
        >
          Back to Reports
        </button>
      </div>
    );
  }

  const config = parseJSON<ReportConfig>(report.config, {});

  const typeLabels: Record<string, string> = {
    single_object: "Single Object Report",
    cross_object: "Cross Object Report",
    attribution: "Attribution Report",
  };

  return (
    <div>
      <PageHeader
        title={report.name}
        description={typeLabels[report.type] || report.type}
        actions={
          <button
            onClick={() => router.push("/reports")}
            className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Back to Reports
          </button>
        }
      />

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Report Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <dt className="text-xs font-medium text-zinc-500">Type</dt>
                <dd className="mt-1 text-sm text-zinc-900 dark:text-zinc-100">
                  {typeLabels[report.type] || report.type}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-zinc-500">Created</dt>
                <dd className="mt-1 text-sm text-zinc-900 dark:text-zinc-100">
                  {formatDate(report.createdAt)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-zinc-500">Last Updated</dt>
                <dd className="mt-1 text-sm text-zinc-900 dark:text-zinc-100">
                  {formatDate(report.updatedAt)}
                </dd>
              </div>
              {config.groupBy && (
                <div>
                  <dt className="text-xs font-medium text-zinc-500">Grouped By</dt>
                  <dd className="mt-1 text-sm text-zinc-900 dark:text-zinc-100">
                    {config.groupBy}
                  </dd>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>

        {config.description && (
          <Card>
            <CardHeader>
              <CardTitle>Description</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-zinc-700 dark:text-zinc-300">
                {config.description}
              </p>
            </CardContent>
          </Card>
        )}

        {config.objects && config.objects.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Data Sources</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {config.objects.map((obj) => (
                  <span
                    key={obj}
                    className="inline-flex items-center rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                  >
                    {obj}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {config.metrics && config.metrics.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Metrics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {config.metrics.map((metric) => (
                  <span
                    key={metric}
                    className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                  >
                    {metric}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {config.filters && Object.keys(config.filters).length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Filters</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="overflow-x-auto rounded-lg bg-zinc-50 p-4 text-xs text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                {JSON.stringify(config.filters, null, 2)}
              </pre>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
