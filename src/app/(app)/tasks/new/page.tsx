"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { taskSchema, type TaskFormData } from "@/lib/validations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { TASK_STATUSES, PRIORITIES } from "@/types";

const TYPE_OPTIONS = [
  { value: "todo", label: "To Do" },
  { value: "call", label: "Call" },
  { value: "email", label: "Email" },
  { value: "follow_up", label: "Follow Up" },
];

const STATUS_OPTIONS = TASK_STATUSES.map((s) => ({
  value: s,
  label: s
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" "),
}));

const PRIORITY_OPTIONS = PRIORITIES.map((p) => ({
  value: p,
  label: p.charAt(0).toUpperCase() + p.slice(1),
}));

interface ContactOption {
  id: string;
  firstName: string;
  lastName: string;
}

export default function NewTaskPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [contacts, setContacts] = useState<ContactOption[]>([]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TaskFormData>({
    resolver: zodResolver(taskSchema) as any,
    defaultValues: {
      type: "todo",
      priority: "medium",
      status: "pending",
    },
  });

  useEffect(() => {
    fetch("/api/contacts?pageSize=100")
      .then((res) => res.json())
      .then((json) => {
        if (json.data) {
          setContacts(
            json.data.map((c: ContactOption) => ({
              id: c.id,
              firstName: c.firstName,
              lastName: c.lastName,
            }))
          );
        }
      })
      .catch(() => {});
  }, []);

  const onSubmit = async (data: TaskFormData) => {
    setSubmitting(true);
    setError("");

    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    const json = await res.json();

    if (json.error) {
      setError(json.error);
      setSubmitting(false);
      return;
    }

    router.push("/tasks");
  };

  return (
    <div>
      <PageHeader
        title="New Task"
        description="Create a new task"
      />

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Task Information</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {error && (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">
                {error}
              </div>
            )}

            <Input
              label="Title"
              id="title"
              error={errors.title?.message}
              {...register("title")}
            />

            <Textarea
              label="Description"
              id="description"
              error={errors.description?.message}
              {...register("description")}
            />

            <div className="grid grid-cols-3 gap-4">
              <Select
                label="Type"
                id="type"
                options={TYPE_OPTIONS}
                error={errors.type?.message}
                {...register("type")}
              />
              <Select
                label="Priority"
                id="priority"
                options={PRIORITY_OPTIONS}
                error={errors.priority?.message}
                {...register("priority")}
              />
              <Select
                label="Status"
                id="status"
                options={STATUS_OPTIONS}
                error={errors.status?.message}
                {...register("status")}
              />
            </div>

            <Input
              label="Due Date"
              id="dueDate"
              type="date"
              error={errors.dueDate?.message}
              {...register("dueDate")}
            />

            <Select
              label="Contact"
              id="contactId"
              options={contacts.map((c) => ({
                value: c.id,
                label: `${c.firstName} ${c.lastName}`,
              }))}
              placeholder="Select a contact (optional)"
              {...register("contactId")}
            />

            <div className="flex items-center gap-2 pt-4">
              <Button type="submit" disabled={submitting}>
                {submitting ? "Creating..." : "Create Task"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
              >
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
