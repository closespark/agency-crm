"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import type { EmailTemplate } from "@/types";

interface TemplatePreviewProps {
  template: EmailTemplate;
}

export function TemplatePreview({ template }: TemplatePreviewProps) {
  const [showPreview, setShowPreview] = useState(false);

  return (
    <>
      <Card className="transition-shadow hover:shadow-md">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <CardTitle className="text-base">{template.name}</CardTitle>
            <Badge variant={template.isActive ? "success" : "secondary"}>
              {template.isActive ? "Active" : "Inactive"}
            </Badge>
          </div>
          <p className="text-sm text-zinc-500">{template.subject}</p>
        </CardHeader>
        <CardContent>
          {template.category && (
            <Badge variant="outline" className="mb-3 text-xs">
              {template.category}
            </Badge>
          )}
          <div className="mb-3 max-h-24 overflow-hidden rounded border border-zinc-200 bg-zinc-50 p-2 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
            <div
              dangerouslySetInnerHTML={{
                __html: template.body.slice(0, 300),
              }}
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowPreview(true)}
          >
            Preview
          </Button>
        </CardContent>
      </Card>

      <Modal
        open={showPreview}
        onClose={() => setShowPreview(false)}
        title={`Preview: ${template.name}`}
        className="max-w-2xl"
      >
        <div className="space-y-3">
          <div>
            <p className="text-xs font-medium text-zinc-500">Subject</p>
            <p className="text-sm">{template.subject}</p>
          </div>
          <div className="rounded border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-800">
            <div dangerouslySetInnerHTML={{ __html: template.body }} />
          </div>
        </div>
      </Modal>
    </>
  );
}
