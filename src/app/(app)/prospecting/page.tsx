"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { SearchInput } from "@/components/shared/search-input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pagination } from "@/components/ui/pagination";
import { PageLoader, EmptyState } from "@/components/ui/loading";
import { formatDate } from "@/lib/utils";
import { useDebounce } from "@/hooks/use-debounce";

interface ProspectSearch {
  id: string;
  name: string;
  icp: string;
  status: string;
  resultsCount: number;
  createdAt: string;
  _count: { prospects: number };
}

interface Stats {
  totalProspects: number;
  totalSearches: number;
  avgFitScore: number;
  conversionRate: number;
}

const statusVariant: Record<string, "default" | "success" | "warning" | "secondary"> = {
  draft: "secondary",
  searching: "warning",
  enriching: "warning",
  complete: "success",
};

export default function ProspectingPage() {
  const [searches, setSearches] = useState<ProspectSearch[]>([]);
  const [stats, setStats] = useState<Stats>({ totalProspects: 0, totalSearches: 0, avgFitScore: 0, conversionRate: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const debouncedSearch = useDebounce(search, 300);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "10" });
      if (debouncedSearch) params.set("search", debouncedSearch);

      const [searchesRes, statsRes] = await Promise.all([
        fetch(`/api/prospecting/searches?${params}`),
        fetch("/api/prospecting/prospects?pageSize=1"),
      ]);

      const searchesData = await searchesRes.json();
      const statsData = await statsRes.json();

      if (searchesData.data) {
        setSearches(searchesData.data);
        setTotalPages(searchesData.meta?.totalPages || 1);
      }

      // Calculate stats from all prospects
      const totalProspects = statsData.meta?.total || 0;

      // Fetch additional stats
      const [convertedRes, allProspectsRes] = await Promise.all([
        fetch("/api/prospecting/prospects?status=converted&pageSize=1"),
        fetch("/api/prospecting/prospects?pageSize=100"),
      ]);
      const convertedData = await convertedRes.json();
      const allProspectsData = await allProspectsRes.json();

      const convertedCount = convertedData.meta?.total || 0;
      const allProspects = allProspectsData.data || [];
      const scoresWithValue = allProspects.filter((p: { fitScore: number | null }) => p.fitScore != null);
      const avgFit = scoresWithValue.length > 0
        ? Math.round(scoresWithValue.reduce((sum: number, p: { fitScore: number }) => sum + p.fitScore, 0) / scoresWithValue.length)
        : 0;

      setStats({
        totalProspects,
        totalSearches: searchesData.meta?.total || 0,
        avgFitScore: avgFit,
        conversionRate: totalProspects > 0 ? Math.round((convertedCount / totalProspects) * 100) : 0,
      });
    } catch {
      // silently handle
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading && searches.length === 0) return <PageLoader />;

  return (
    <div>
      <PageHeader
        title="Prospecting"
        description="AI-powered prospect discovery and enrichment"
        actions={
          <Link href="/prospecting/search/new">
            <Button>New ICP Search</Button>
          </Link>
        }
      />

      {/* Stats */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Total Prospects</p>
            <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{stats.totalProspects}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Searches</p>
            <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{stats.totalSearches}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Avg Fit Score</p>
            <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{stats.avgFitScore || "--"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Conversion Rate</p>
            <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{stats.conversionRate}%</p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="mb-6">
        <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-100">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <Link href="/prospecting/search/new">
            <Button variant="outline">New ICP Search</Button>
          </Link>
          <Link href="/prospecting/search/new?source=apollo">
            <Button variant="outline">Search Apollo.io</Button>
          </Link>
          <Link href="/prospecting/search/new?source=import">
            <Button variant="outline">Import Prospects</Button>
          </Link>
        </div>
      </div>

      {/* Searches List */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Prospect Searches</h2>
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search by name..."
            className="w-64"
          />
        </div>

        {searches.length === 0 ? (
          <EmptyState
            title="No searches yet"
            description="Create your first ICP search to start discovering prospects."
            action={
              <Link href="/prospecting/search/new">
                <Button>Create Search</Button>
              </Link>
            }
          />
        ) : (
          <>
            <div className="space-y-3">
              {searches.map((s) => (
                <Link key={s.id} href={`/prospecting/search/${s.id}`}>
                  <Card className="transition-shadow hover:shadow-md">
                    <CardContent className="flex items-center justify-between p-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium text-zinc-900 dark:text-zinc-100">{s.name}</h3>
                          <Badge variant={statusVariant[s.status] || "secondary"}>{s.status}</Badge>
                        </div>
                        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                          {s._count.prospects} prospects &middot; Created {formatDate(s.createdAt)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                          {s.resultsCount}
                        </p>
                        <p className="text-xs text-zinc-500">results</p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </>
        )}
      </div>
    </div>
  );
}
