"use client";

import { PageHeader } from "@/components/shared/page-header";
import { BlogEditor } from "@/components/cms/blog-editor";

export default function NewBlogPostPage() {
  return (
    <div>
      <PageHeader
        title="New Blog Post"
        description="Create a new blog post"
      />
      <BlogEditor />
    </div>
  );
}
