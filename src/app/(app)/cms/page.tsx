"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { Tabs } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageLoader } from "@/components/ui/loading";
import { formatDate } from "@/lib/utils";

interface PageItem {
  id: string;
  title: string;
  slug: string;
  status: string;
  template: string;
  updatedAt: string;
}

interface BlogPostItem {
  id: string;
  title: string;
  slug: string;
  status: string;
  author: string | null;
  viewCount: number;
  updatedAt: string;
}

interface MediaAssetItem {
  id: string;
  name: string;
  type: string;
  size: number;
  createdAt: string;
}

interface Stats {
  pages: { total: number; published: number };
  blog: { total: number; published: number };
  media: { total: number };
}

export default function CmsHubPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [pages, setPages] = useState<PageItem[]>([]);
  const [posts, setPosts] = useState<BlogPostItem[]>([]);
  const [media, setMedia] = useState<MediaAssetItem[]>([]);
  const [stats, setStats] = useState<Stats>({
    pages: { total: 0, published: 0 },
    blog: { total: 0, published: 0 },
    media: { total: 0 },
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [pagesRes, postsRes, mediaRes] = await Promise.all([
        fetch("/api/pages?pageSize=5&sortBy=updatedAt&sortDir=desc"),
        fetch("/api/blog?pageSize=5&sortBy=updatedAt&sortDir=desc"),
        fetch("/api/media?pageSize=8&sortBy=createdAt&sortDir=desc"),
      ]);

      const [pagesJson, postsJson, mediaJson] = await Promise.all([
        pagesRes.json(),
        postsRes.json(),
        mediaRes.json(),
      ]);

      setPages(pagesJson.data || []);
      setPosts(postsJson.data || []);
      setMedia(mediaJson.data || []);

      // Calculate stats from totals
      const publishedPagesRes = await fetch("/api/pages?status=published&pageSize=1");
      const publishedPostsRes = await fetch("/api/blog?status=published&pageSize=1");
      const [publishedPagesJson, publishedPostsJson] = await Promise.all([
        publishedPagesRes.json(),
        publishedPostsRes.json(),
      ]);

      setStats({
        pages: {
          total: pagesJson.meta?.total || 0,
          published: publishedPagesJson.meta?.total || 0,
        },
        blog: {
          total: postsJson.meta?.total || 0,
          published: publishedPostsJson.meta?.total || 0,
        },
        media: { total: mediaJson.meta?.total || 0 },
      });
    } catch {
      // silently handle
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) return <PageLoader />;

  const statusBadge = (s: string) => (
    <Badge variant={s === "published" ? "success" : "secondary"}>{s}</Badge>
  );

  const pagesContent = (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => router.push("/cms/pages")}>
          View All Pages
        </Button>
      </div>
      {pages.length === 0 ? (
        <p className="py-8 text-center text-sm text-zinc-400">No pages yet</p>
      ) : (
        <div className="space-y-2">
          {pages.map((p) => (
            <Card
              key={p.id}
              className="cursor-pointer transition-shadow hover:shadow-md"
              onClick={() => router.push(`/cms/pages/${p.id}`)}
            >
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="font-medium text-zinc-900 dark:text-zinc-100">
                    {p.title}
                  </p>
                  <p className="text-xs text-zinc-400">/{p.slug}</p>
                </div>
                <div className="flex items-center gap-3">
                  {statusBadge(p.status)}
                  <span className="text-xs text-zinc-400">
                    {formatDate(p.updatedAt)}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );

  const blogContent = (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => router.push("/cms/blog")}>
          View All Posts
        </Button>
      </div>
      {posts.length === 0 ? (
        <p className="py-8 text-center text-sm text-zinc-400">
          No blog posts yet
        </p>
      ) : (
        <div className="space-y-2">
          {posts.map((p) => (
            <Card
              key={p.id}
              className="cursor-pointer transition-shadow hover:shadow-md"
              onClick={() => router.push(`/cms/blog/${p.id}`)}
            >
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="font-medium text-zinc-900 dark:text-zinc-100">
                    {p.title}
                  </p>
                  <p className="text-xs text-zinc-400">
                    {p.author || "No author"} &middot; {p.viewCount} views
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {statusBadge(p.status)}
                  <span className="text-xs text-zinc-400">
                    {formatDate(p.updatedAt)}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );

  const mediaContent = (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => router.push("/cms/media")}>
          View All Media
        </Button>
      </div>
      {media.length === 0 ? (
        <p className="py-8 text-center text-sm text-zinc-400">
          No media assets yet
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {media.map((m) => (
            <Card key={m.id} className="p-3 text-center">
              <p className="truncate text-sm font-medium">{m.name}</p>
              <Badge variant="secondary" className="mt-1 text-xs">
                {m.type}
              </Badge>
            </Card>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Content Management"
        description="Manage pages, blog posts, and media assets"
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-zinc-500">
              Pages
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.pages.total}</p>
            <p className="text-xs text-zinc-400">
              {stats.pages.published} published
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-zinc-500">
              Blog Posts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.blog.total}</p>
            <p className="text-xs text-zinc-400">
              {stats.blog.published} published
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-zinc-500">
              Media Assets
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.media.total}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs
        tabs={[
          { id: "pages", label: "Pages", content: pagesContent },
          { id: "blog", label: "Blog Posts", content: blogContent },
          { id: "media", label: "Media", content: mediaContent },
        ]}
      />
    </div>
  );
}
