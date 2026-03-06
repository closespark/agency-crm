"use client";

import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { SearchInput } from "@/components/shared/search-input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { MediaGrid } from "@/components/cms/media-grid";
import { PageLoader } from "@/components/ui/loading";

const typeOptions = [
  { value: "", label: "All Types" },
  { value: "image", label: "Images" },
  { value: "video", label: "Videos" },
  { value: "document", label: "Documents" },
];

export default function MediaPage() {
  const [loading, setLoading] = useState(true);
  const [assets, setAssets] = useState<
    Array<{
      id: string;
      name: string;
      url: string;
      type: string;
      size: number;
      mimeType: string;
      createdAt: string;
    }>
  >([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);

  // New asset form state
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newType, setNewType] = useState("image");
  const [newSize, setNewSize] = useState("");
  const [newMimeType, setNewMimeType] = useState("");
  const [addError, setAddError] = useState("");
  const [adding, setAdding] = useState(false);

  const fetchMedia = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: "24",
        sortBy: "createdAt",
        sortDir: "desc",
      });
      if (search) params.set("search", search);
      if (typeFilter) params.set("type", typeFilter);

      const res = await fetch(`/api/media?${params}`);
      const json = await res.json();

      setAssets(json.data || []);
      setTotalPages(json.meta?.totalPages || 1);
    } catch {
      // silently handle
    } finally {
      setLoading(false);
    }
  }, [page, search, typeFilter]);

  useEffect(() => {
    fetchMedia();
  }, [fetchMedia]);

  useEffect(() => {
    setPage(1);
  }, [search, typeFilter]);

  async function handleAddAsset() {
    setAddError("");
    setAdding(true);

    try {
      const res = await fetch("/api/media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName,
          url: newUrl,
          type: newType,
          size: parseInt(newSize) || 0,
          mimeType: newMimeType || `${newType}/*`,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setAddError(json.error || "Failed to add media asset");
        return;
      }

      setShowAddModal(false);
      setNewName("");
      setNewUrl("");
      setNewType("image");
      setNewSize("");
      setNewMimeType("");
      fetchMedia();
    } catch {
      setAddError("An error occurred");
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this media asset?")) return;

    try {
      const res = await fetch(`/api/media/${id}`, { method: "DELETE" });
      if (res.ok) {
        fetchMedia();
      }
    } catch {
      // silently handle
    }
  }

  const addTypeOptions = [
    { value: "image", label: "Image" },
    { value: "video", label: "Video" },
    { value: "document", label: "Document" },
  ];

  return (
    <div>
      <PageHeader
        title="Media Library"
        description="Manage your media assets"
        actions={
          <Button onClick={() => setShowAddModal(true)}>
            Add Media
          </Button>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search media..."
          className="sm:w-64"
        />
        <Select
          options={typeOptions}
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          placeholder="All Types"
        />
      </div>

      {loading ? (
        <PageLoader />
      ) : (
        <MediaGrid
          assets={assets}
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          onDelete={handleDelete}
        />
      )}

      <Modal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Add Media Asset"
      >
        <div className="space-y-4">
          {addError && (
            <div className="rounded-md bg-red-50 p-2 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
              {addError}
            </div>
          )}

          <Input
            id="mediaName"
            label="Name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Asset name"
          />

          <Input
            id="mediaUrl"
            label="URL"
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            placeholder="https://example.com/file.jpg"
          />

          <Select
            id="mediaType"
            label="Type"
            value={newType}
            onChange={(e) => setNewType(e.target.value)}
            options={addTypeOptions}
          />

          <Input
            id="mediaSize"
            label="File Size (bytes)"
            type="number"
            value={newSize}
            onChange={(e) => setNewSize(e.target.value)}
            placeholder="1024"
          />

          <Input
            id="mediaMimeType"
            label="MIME Type"
            value={newMimeType}
            onChange={(e) => setNewMimeType(e.target.value)}
            placeholder="image/jpeg"
          />

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowAddModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddAsset} disabled={adding}>
              {adding ? "Adding..." : "Add Asset"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
