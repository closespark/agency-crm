"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs } from "@/components/ui/tabs";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PageLoader } from "@/components/ui/loading";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { SequenceTimeline } from "@/components/sequences/sequence-timeline";
import { EnrollmentTable } from "@/components/sequences/enrollment-table";
import { api } from "@/lib/api";
import { formatDate, parseJSON } from "@/lib/utils";

interface SequenceStep {
  stepNumber: number;
  channel: "email" | "linkedin" | "call";
  delayDays: number;
  subject?: string;
  body: string;
  notes?: string;
}

interface EnrollmentContact {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  jobTitle?: string | null;
  company?: { id: string; name: string } | null;
}

interface Enrollment {
  id: string;
  sequenceId: string;
  contactId: string;
  status: string;
  currentStep: number;
  channel: string;
  nextActionAt: string | null;
  completedAt: string | null;
  createdAt: string;
  metadata: string | null;
  contact: EnrollmentContact;
}

interface StepMetric {
  stepNumber: number;
  channel: string;
  subject: string;
  reached: number;
  openRate: number;
  replyRate: number;
  bounceRate: number;
}

interface SequenceDetail {
  id: string;
  name: string;
  description: string | null;
  steps: string;
  isActive: boolean;
  aiGenerated: boolean;
  createdAt: string;
  updatedAt: string;
  parsedSteps: SequenceStep[];
  enrollments: Enrollment[];
  stepMetrics: StepMetric[];
}

export default function SequenceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [sequence, setSequence] = useState<SequenceDetail | null>(null);
  const [enrollModalOpen, setEnrollModalOpen] = useState(false);
  const [contactIdsText, setContactIdsText] = useState("");
  const [enrollChannel, setEnrollChannel] = useState("email");
  const [enrolling, setEnrolling] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [pushingInstantly, setPushingInstantly] = useState(false);
  const [pushingAlfred, setPushingAlfred] = useState(false);

  const fetchSequence = useCallback(async () => {
    setLoading(true);
    const res = await api.get<SequenceDetail>(`/sequences/${id}`);
    if (res.data) {
      setSequence(res.data);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchSequence();
  }, [fetchSequence]);

  async function handleEnroll() {
    if (!contactIdsText.trim()) return;

    const contactIds = contactIdsText
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (contactIds.length === 0) return;

    setEnrolling(true);
    try {
      const res = await api.post(`/sequences/${id}/enroll`, {
        contactIds,
        channel: enrollChannel,
      });

      if (!res.error) {
        setEnrollModalOpen(false);
        setContactIdsText("");
        fetchSequence();
      }
    } finally {
      setEnrolling(false);
    }
  }

  async function handleDelete() {
    await api.delete(`/sequences/${id}`);
    router.push("/sequences");
  }

  async function handleToggleActive() {
    if (!sequence) return;
    await api.put(`/sequences/${id}`, {
      name: sequence.name,
      description: sequence.description,
      steps: sequence.steps,
      isActive: !sequence.isActive,
    });
    fetchSequence();
  }

  async function handlePushInstantly() {
    setPushingInstantly(true);
    try {
      await api.post("/sequences/instantly/push", { sequenceId: id });
    } finally {
      setPushingInstantly(false);
    }
  }

  async function handlePushAlfred() {
    setPushingAlfred(true);
    try {
      // Push LinkedIn steps to Meet Alfred
      if (!sequence) return;
      const linkedinSteps = sequence.parsedSteps.filter(
        (s) => s.channel === "linkedin"
      );
      if (linkedinSteps.length === 0) {
        alert("No LinkedIn steps in this sequence to push to Alfred.");
        return;
      }
      // The Meet Alfred integration would be called here
      // For now, we prepare the data that would be sent
      alert(
        `Ready to push ${linkedinSteps.length} LinkedIn steps to Meet Alfred. Integration will handle the campaign creation.`
      );
    } finally {
      setPushingAlfred(false);
    }
  }

  if (loading) {
    return <PageLoader />;
  }

  if (!sequence) {
    return (
      <div className="py-12 text-center">
        <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">
          Sequence not found
        </h2>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => router.push("/sequences")}
        >
          Back to Sequences
        </Button>
      </div>
    );
  }

  const totalEnrollments = sequence.enrollments.length;
  const activeEnrollments = sequence.enrollments.filter(
    (e) => e.status === "active"
  ).length;
  const completedEnrollments = sequence.enrollments.filter(
    (e) => e.status === "completed"
  ).length;
  const repliedEnrollments = sequence.enrollments.filter(
    (e) => e.status === "replied"
  ).length;

  // Calculate total steps for enrollment table
  const enrichedEnrollments = sequence.enrollments.map((e) => ({
    ...e,
    totalSteps: sequence.parsedSteps.length,
  }));

  const tabItems = [
    {
      id: "timeline",
      label: "Steps Timeline",
      content: (
        <div className="mt-4">
          <SequenceTimeline steps={sequence.parsedSteps} />
        </div>
      ),
    },
    {
      id: "enrollments",
      label: `Enrollments (${totalEnrollments})`,
      content: (
        <div className="mt-4">
          <EnrollmentTable
            enrollments={enrichedEnrollments}
            onRefresh={fetchSequence}
          />
        </div>
      ),
    },
    {
      id: "performance",
      label: "Performance",
      content: (
        <div className="mt-4 space-y-4">
          {/* Summary stats */}
          <div className="grid grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                  {totalEnrollments}
                </p>
                <p className="text-xs text-zinc-500">Total Enrolled</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-blue-600">
                  {activeEnrollments}
                </p>
                <p className="text-xs text-zinc-500">Active</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-green-600">
                  {completedEnrollments}
                </p>
                <p className="text-xs text-zinc-500">Completed</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-purple-600">
                  {repliedEnrollments}
                </p>
                <p className="text-xs text-zinc-500">Replied</p>
              </CardContent>
            </Card>
          </div>

          {/* Per-step metrics */}
          <Card>
            <CardHeader>
              <CardTitle>Step-by-Step Performance</CardTitle>
            </CardHeader>
            <CardContent>
              {sequence.stepMetrics.length === 0 ? (
                <p className="py-8 text-center text-sm text-zinc-500">
                  No performance data yet. Enroll contacts to start tracking.
                </p>
              ) : (
                <div className="space-y-3">
                  {sequence.stepMetrics.map((metric) => (
                    <div
                      key={metric.stepNumber}
                      className="flex items-center gap-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 text-sm font-bold dark:bg-zinc-800">
                        {metric.stepNumber}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">{metric.channel}</Badge>
                          {metric.subject && (
                            <span className="text-sm text-zinc-600 dark:text-zinc-400">
                              {metric.subject}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-6 text-center text-sm">
                        <div>
                          <p className="font-medium text-zinc-900 dark:text-zinc-100">
                            {metric.reached}
                          </p>
                          <p className="text-xs text-zinc-500">Reached</p>
                        </div>
                        <div>
                          <p className="font-medium text-green-600">
                            {metric.openRate}%
                          </p>
                          <p className="text-xs text-zinc-500">Open Rate</p>
                        </div>
                        <div>
                          <p className="font-medium text-purple-600">
                            {metric.replyRate}%
                          </p>
                          <p className="text-xs text-zinc-500">Reply Rate</p>
                        </div>
                        <div>
                          <p className="font-medium text-red-600">
                            {metric.bounceRate}%
                          </p>
                          <p className="text-xs text-zinc-500">Bounce Rate</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title={sequence.name}
        description={sequence.description || undefined}
        actions={
          <div className="flex items-center gap-2">
            {sequence.aiGenerated && <Badge variant="default">AI Generated</Badge>}
            <Button variant="outline" size="sm" onClick={handleToggleActive}>
              {sequence.isActive ? "Pause" : "Resume"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push(`/sequences/new?edit=${id}`)}
            >
              Edit Steps
            </Button>
            <Button size="sm" onClick={() => setEnrollModalOpen(true)}>
              Enroll Contacts
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handlePushInstantly}
              disabled={pushingInstantly}
            >
              {pushingInstantly ? "Pushing..." : "Push to Instantly"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handlePushAlfred}
              disabled={pushingAlfred}
            >
              {pushingAlfred ? "Pushing..." : "Push to Alfred"}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setDeleteDialogOpen(true)}
            >
              Delete
            </Button>
          </div>
        }
      />

      <div className="mb-4 flex items-center gap-3 text-sm text-zinc-500">
        <span>{sequence.parsedSteps.length} steps</span>
        <span>|</span>
        <span>Created {formatDate(sequence.createdAt)}</span>
        {sequence.isActive ? (
          <Badge variant="success">Active</Badge>
        ) : (
          <Badge variant="secondary">Inactive</Badge>
        )}
      </div>

      <Tabs tabs={tabItems} defaultTab="timeline" />

      {/* Enroll Contacts Modal */}
      <Modal
        open={enrollModalOpen}
        onClose={() => setEnrollModalOpen(false)}
        title="Enroll Contacts"
        className="max-w-md"
      >
        <div className="space-y-4">
          <Textarea
            label="Contact IDs"
            placeholder="Enter contact IDs separated by commas or new lines..."
            rows={4}
            value={contactIdsText}
            onChange={(e) => setContactIdsText(e.target.value)}
          />
          <Input
            label="Channel"
            value={enrollChannel}
            onChange={(e) => setEnrollChannel(e.target.value)}
            placeholder="email, linkedin, or multi"
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setEnrollModalOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleEnroll} disabled={enrolling}>
              {enrolling ? "Enrolling..." : "Enroll"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={handleDelete}
        title="Delete Sequence"
        message="Are you sure you want to delete this sequence? All enrollments will also be removed. This cannot be undone."
        confirmLabel="Delete"
        destructive
      />
    </div>
  );
}
