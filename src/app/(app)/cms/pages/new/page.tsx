"use client";

import { PageHeader } from "@/components/shared/page-header";
import { PageEditor } from "@/components/cms/page-editor";

export default function NewPagePage() {
  return (
    <div>
      <PageHeader
        title="New Page"
        description="Create a new website page"
      />
      <PageEditor />
    </div>
  );
}
