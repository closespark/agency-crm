"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";

interface ContactActionsProps {
  contactId: string;
}

export default function ContactActions({ contactId }: ContactActionsProps) {
  const router = useRouter();
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    const res = await fetch(`/api/contacts/${contactId}`, {
      method: "DELETE",
    });
    const json = await res.json();
    if (json.data?.success) {
      router.push("/contacts");
    }
    setDeleting(false);
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => router.push(`/contacts/${contactId}/edit`)}
      >
        <Pencil className="h-4 w-4" />
        Edit
      </Button>
      <Button
        variant="destructive"
        size="sm"
        onClick={() => setShowDelete(true)}
        disabled={deleting}
      >
        <Trash2 className="h-4 w-4" />
        Delete
      </Button>

      <ConfirmDialog
        open={showDelete}
        onClose={() => setShowDelete(false)}
        onConfirm={handleDelete}
        title="Delete Contact"
        message="Are you sure you want to delete this contact? This action cannot be undone and will remove all associated data."
        confirmLabel="Delete"
        destructive
      />
    </div>
  );
}
