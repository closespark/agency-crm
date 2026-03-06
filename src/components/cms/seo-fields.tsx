"use client";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface SeoFieldsProps {
  metaTitle: string;
  metaDesc: string;
  onMetaTitleChange: (value: string) => void;
  onMetaDescChange: (value: string) => void;
}

export function SeoFields({
  metaTitle,
  metaDesc,
  onMetaTitleChange,
  onMetaDescChange,
}: SeoFieldsProps) {
  const titleLength = metaTitle.length;
  const descLength = metaDesc.length;

  return (
    <div className="space-y-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        SEO Settings
      </h3>

      <div className="space-y-1">
        <Input
          id="metaTitle"
          label="Meta Title"
          value={metaTitle}
          onChange={(e) => onMetaTitleChange(e.target.value)}
          placeholder="Page title for search engines"
          maxLength={70}
        />
        <p className="text-xs text-zinc-400">
          {titleLength}/70 characters
          {titleLength > 60 && titleLength <= 70 && (
            <span className="ml-1 text-yellow-500">- Approaching limit</span>
          )}
          {titleLength > 70 && (
            <span className="ml-1 text-red-500">- Too long</span>
          )}
        </p>
      </div>

      <div className="space-y-1">
        <Textarea
          id="metaDesc"
          label="Meta Description"
          value={metaDesc}
          onChange={(e) => onMetaDescChange(e.target.value)}
          placeholder="Brief description for search engine results"
          rows={3}
          maxLength={160}
        />
        <p className="text-xs text-zinc-400">
          {descLength}/160 characters
          {descLength > 140 && descLength <= 160 && (
            <span className="ml-1 text-yellow-500">- Approaching limit</span>
          )}
          {descLength > 160 && (
            <span className="ml-1 text-red-500">- Too long</span>
          )}
        </p>
      </div>

      {(metaTitle || metaDesc) && (
        <div className="rounded-md bg-zinc-50 p-3 dark:bg-zinc-900">
          <p className="text-xs text-zinc-400">Search preview</p>
          <p className="mt-1 text-sm font-medium text-blue-700 dark:text-blue-400">
            {metaTitle || "Page Title"}
          </p>
          <p className="mt-0.5 text-xs text-green-700 dark:text-green-400">
            example.com/page
          </p>
          <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
            {metaDesc || "Page description will appear here..."}
          </p>
        </div>
      )}
    </div>
  );
}
