"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageLoader } from "@/components/ui/loading";
import { FitScoreBadge, FitScoreBar } from "@/components/prospecting/fit-score-badge";
import { AIAnalysisPanel } from "@/components/prospecting/ai-analysis-panel";
import { formatDate, parseJSON } from "@/lib/utils";

interface Prospect {
  id: string;
  searchId: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  linkedinUrl: string | null;
  jobTitle: string | null;
  companyName: string | null;
  companyDomain: string | null;
  companySize: string | null;
  industry: string | null;
  location: string | null;
  enrichedData: string | null;
  aiAnalysis: string | null;
  fitScore: number | null;
  status: string;
  contactId: string | null;
  createdAt: string;
  updatedAt: string;
  search: { id: string; name: string; icp: string };
}

const statusVariant: Record<string, "default" | "success" | "warning" | "danger" | "secondary"> = {
  new: "default",
  verified: "success",
  contacted: "warning",
  converted: "success",
  rejected: "danger",
};

export default function ProspectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [prospect, setProspect] = useState<Prospect | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState("");
  const [error, setError] = useState("");
  const [convertOpen, setConvertOpen] = useState(false);

  const fetchProspect = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/prospecting/prospects/${id}`);
      const data = await res.json();
      if (data.data) setProspect(data.data);
      else setError(data.error || "Not found");
    } catch {
      setError("Failed to load prospect");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchProspect();
  }, [fetchProspect]);

  async function handleConvert() {
    setActionLoading("convert");
    try {
      const res = await fetch(`/api/prospecting/prospects/${id}/convert`, { method: "POST" });
      const data = await res.json();
      if (res.ok && data.data?.contact) {
        router.push(`/contacts/${data.data.contact.id}`);
      } else {
        setError(data.error || "Conversion failed");
      }
    } catch {
      setError("Conversion failed");
    } finally {
      setActionLoading("");
      setConvertOpen(false);
    }
  }

  async function handleEnrich() {
    setActionLoading("enrich");
    setError("");
    try {
      const res = await fetch(`/api/prospecting/prospects/${id}/enrich`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setProspect(data.data);
      } else {
        setError(data.error || "Enrichment failed");
      }
    } catch {
      setError("Enrichment failed");
    } finally {
      setActionLoading("");
    }
  }

  async function handleReject() {
    setActionLoading("reject");
    try {
      const res = await fetch(`/api/prospecting/prospects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "rejected" }),
      });
      const data = await res.json();
      if (res.ok) setProspect(data.data);
    } finally {
      setActionLoading("");
    }
  }

  if (loading) return <PageLoader />;

  if (!prospect) {
    return (
      <div className="py-12 text-center">
        <p className="text-zinc-500">{error || "Prospect not found"}</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push("/prospecting")}>
          Back to Prospecting
        </Button>
      </div>
    );
  }

  const fullName = [prospect.firstName, prospect.lastName].filter(Boolean).join(" ") || "Unknown";
  const enrichedData = parseJSON<Record<string, unknown>>(prospect.enrichedData, {});

  return (
    <div>
      <PageHeader
        title={fullName}
        description={[prospect.jobTitle, prospect.companyName].filter(Boolean).join(" at ")}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.push(`/prospecting/search/${prospect.searchId}`)}>
              Back to Search
            </Button>
            {prospect.status !== "converted" && (
              <>
                <Button
                  variant="outline"
                  onClick={handleEnrich}
                  disabled={actionLoading === "enrich"}
                >
                  {actionLoading === "enrich" ? "Enriching..." : "Enrich with Apollo"}
                </Button>
                <Button
                  onClick={() => setConvertOpen(true)}
                  disabled={actionLoading === "convert"}
                >
                  {actionLoading === "convert" ? "Converting..." : "Convert to Contact"}
                </Button>
                {prospect.status !== "rejected" && (
                  <Button
                    variant="destructive"
                    onClick={handleReject}
                    disabled={actionLoading === "reject"}
                  >
                    Reject
                  </Button>
                )}
              </>
            )}
            {prospect.status === "converted" && prospect.contactId && (
              <Link href={`/contacts/${prospect.contactId}`}>
                <Button>View Contact</Button>
              </Link>
            )}
          </div>
        }
      />

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column: info */}
        <div className="space-y-6 lg:col-span-2">
          {/* Basic Info */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Prospect Information</CardTitle>
                <Badge variant={statusVariant[prospect.status] || "secondary"}>
                  {prospect.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Full Name</dt>
                  <dd className="mt-1 text-sm text-zinc-900 dark:text-zinc-100">{fullName}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Email</dt>
                  <dd className="mt-1 text-sm text-zinc-900 dark:text-zinc-100">
                    {prospect.email ? (
                      <a href={`mailto:${prospect.email}`} className="text-blue-600 hover:underline">
                        {prospect.email}
                      </a>
                    ) : (
                      "-"
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Phone</dt>
                  <dd className="mt-1 text-sm text-zinc-900 dark:text-zinc-100">{prospect.phone || "-"}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">LinkedIn</dt>
                  <dd className="mt-1 text-sm">
                    {prospect.linkedinUrl ? (
                      <a href={prospect.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                        Profile
                      </a>
                    ) : (
                      <span className="text-zinc-900 dark:text-zinc-100">-</span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Job Title</dt>
                  <dd className="mt-1 text-sm text-zinc-900 dark:text-zinc-100">{prospect.jobTitle || "-"}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Location</dt>
                  <dd className="mt-1 text-sm text-zinc-900 dark:text-zinc-100">{prospect.location || "-"}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          {/* Company Info */}
          <Card>
            <CardHeader>
              <CardTitle>Company Information</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Company</dt>
                  <dd className="mt-1 text-sm text-zinc-900 dark:text-zinc-100">{prospect.companyName || "-"}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Domain</dt>
                  <dd className="mt-1 text-sm">
                    {prospect.companyDomain ? (
                      <a href={`https://${prospect.companyDomain}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                        {prospect.companyDomain}
                      </a>
                    ) : (
                      <span className="text-zinc-900 dark:text-zinc-100">-</span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Company Size</dt>
                  <dd className="mt-1 text-sm text-zinc-900 dark:text-zinc-100">{prospect.companySize || "-"}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Industry</dt>
                  <dd className="mt-1 text-sm text-zinc-900 dark:text-zinc-100">{prospect.industry || "-"}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          {/* AI Analysis */}
          <div>
            <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-100">AI Analysis</h2>
            <AIAnalysisPanel analysis={prospect.aiAnalysis} />
          </div>

          {/* Enrichment Data */}
          {Object.keys(enrichedData).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Enrichment Data</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="max-h-64 overflow-auto rounded-md bg-zinc-50 p-3 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                  {JSON.stringify(enrichedData, null, 2)}
                </pre>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right sidebar */}
        <div className="space-y-6">
          {/* Fit Score */}
          <Card>
            <CardHeader>
              <CardTitle>Fit Score</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center gap-3">
                <FitScoreBadge score={prospect.fitScore} size="lg" showLabel />
                <FitScoreBar score={prospect.fitScore} />
              </div>
            </CardContent>
          </Card>

          {/* Search Info */}
          <Card>
            <CardHeader>
              <CardTitle>Source Search</CardTitle>
            </CardHeader>
            <CardContent>
              <Link
                href={`/prospecting/search/${prospect.search.id}`}
                className="text-sm text-blue-600 hover:underline"
              >
                {prospect.search.name}
              </Link>
              <p className="mt-1 text-xs text-zinc-500">Added {formatDate(prospect.createdAt)}</p>
            </CardContent>
          </Card>

          {/* Dates */}
          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-zinc-500 dark:text-zinc-400">Created</dt>
                  <dd className="text-zinc-900 dark:text-zinc-100">{formatDate(prospect.createdAt)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-zinc-500 dark:text-zinc-400">Updated</dt>
                  <dd className="text-zinc-900 dark:text-zinc-100">{formatDate(prospect.updatedAt)}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={convertOpen}
        onClose={() => setConvertOpen(false)}
        onConfirm={handleConvert}
        title="Convert to Contact"
        message={`Convert ${fullName} to a CRM contact? This will create a new contact record.`}
        confirmLabel="Convert"
      />
    </div>
  );
}
