"use client";

import { FileText, Film, Image, File } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState } from "@/components/ui/loading";
import { formatDate } from "@/lib/utils";

interface MediaAsset {
  id: string;
  name: string;
  url: string;
  type: string;
  size: number;
  mimeType: string;
  createdAt: string;
}

interface MediaGridProps {
  assets: MediaAsset[];
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onDelete?: (id: string) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function TypeIcon({ type }: { type: string }) {
  switch (type) {
    case "image":
      return <Image className="h-8 w-8 text-blue-500" />;
    case "video":
      return <Film className="h-8 w-8 text-purple-500" />;
    case "document":
      return <FileText className="h-8 w-8 text-orange-500" />;
    default:
      return <File className="h-8 w-8 text-zinc-400" />;
  }
}

function typeBadgeVariant(type: string) {
  switch (type) {
    case "image":
      return "default" as const;
    case "video":
      return "secondary" as const;
    case "document":
      return "warning" as const;
    default:
      return "secondary" as const;
  }
}

export function MediaGrid({
  assets,
  page,
  totalPages,
  onPageChange,
  onDelete,
}: MediaGridProps) {
  if (assets.length === 0) {
    return (
      <EmptyState
        title="No media assets"
        description="Add media assets to get started"
      />
    );
  }

  return (
    <div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {assets.map((asset) => (
          <Card key={asset.id} className="overflow-hidden">
            <div className="flex h-36 items-center justify-center bg-zinc-50 dark:bg-zinc-900">
              {asset.type === "image" ? (
                <img
                  src={asset.url}
                  alt={asset.name}
                  className="h-full w-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                    (e.target as HTMLImageElement).parentElement!.innerHTML =
                      '<div class="flex h-full w-full items-center justify-center"><svg class="h-8 w-8 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg></div>';
                  }}
                />
              ) : (
                <TypeIcon type={asset.type} />
              )}
            </div>
            <div className="p-3">
              <p
                className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100"
                title={asset.name}
              >
                {asset.name}
              </p>
              <div className="mt-1 flex items-center justify-between">
                <Badge variant={typeBadgeVariant(asset.type)} className="text-xs">
                  {asset.type}
                </Badge>
                <span className="text-xs text-zinc-400">
                  {formatFileSize(asset.size)}
                </span>
              </div>
              <p className="mt-1 text-xs text-zinc-400">
                {formatDate(asset.createdAt)}
              </p>
              <div className="mt-2 flex items-center gap-1">
                <a
                  href={asset.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:underline dark:text-blue-400"
                >
                  Open
                </a>
                {onDelete && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto h-6 text-xs text-red-500 hover:text-red-700"
                    onClick={() => onDelete(asset.id)}
                  >
                    Delete
                  </Button>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>
      <Pagination page={page} totalPages={totalPages} onPageChange={onPageChange} />
    </div>
  );
}
