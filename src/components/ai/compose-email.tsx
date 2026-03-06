"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/loading";

const PURPOSE_OPTIONS = [
  { value: "cold_outreach", label: "Cold Outreach" },
  { value: "follow_up", label: "Follow Up" },
  { value: "nurture", label: "Nurture" },
  { value: "meeting_request", label: "Meeting Request" },
  { value: "proposal", label: "Proposal" },
  { value: "thank_you", label: "Thank You" },
];

const TONE_OPTIONS = [
  { value: "professional", label: "Professional" },
  { value: "casual", label: "Casual" },
  { value: "friendly", label: "Friendly" },
];

interface ComposeEmailProps {
  open: boolean;
  onClose: () => void;
  contactId: string;
  contactName?: string;
  onSend?: (subject: string, body: string) => void;
}

export function ComposeEmail({
  open,
  onClose,
  contactId,
  contactName,
  onSend,
}: ComposeEmailProps) {
  const [purpose, setPurpose] = useState("follow_up");
  const [tone, setTone] = useState("professional");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generated, setGenerated] = useState(false);

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/compose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId, purpose, tone }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to compose email");
      setSubject(json.data.subject);
      setBody(json.data.body);
      setGenerated(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setGenerating(false);
    }
  }

  function handleSend() {
    if (onSend && subject && body) {
      onSend(subject, body);
      onClose();
    }
  }

  function handleClose() {
    setSubject("");
    setBody("");
    setGenerated(false);
    setError(null);
    onClose();
  }

  return (
    <Modal open={open} onClose={handleClose} title="AI Email Composer" className="max-w-2xl">
      <div className="space-y-4">
        {contactName && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            To: <span className="font-medium text-zinc-900 dark:text-zinc-100">{contactName}</span>
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Purpose"
            options={PURPOSE_OPTIONS}
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
          />
          <Select
            label="Tone"
            options={TONE_OPTIONS}
            value={tone}
            onChange={(e) => setTone(e.target.value)}
          />
        </div>

        {!generated && (
          <div className="flex justify-center py-4">
            <Button onClick={generate} disabled={generating}>
              {generating ? (
                <>
                  <Spinner size="sm" /> Generating...
                </>
              ) : (
                "Generate Email"
              )}
            </Button>
          </div>
        )}

        {generated && (
          <>
            <Input
              label="Subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
            <Textarea
              label="Body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={10}
            />
            <div className="flex items-center justify-between">
              <Button variant="outline" onClick={generate} disabled={generating}>
                {generating ? (
                  <>
                    <Spinner size="sm" /> Regenerating...
                  </>
                ) : (
                  "Regenerate"
                )}
              </Button>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={handleClose}>
                  Cancel
                </Button>
                {onSend && (
                  <Button onClick={handleSend} disabled={!subject || !body}>
                    Use This Email
                  </Button>
                )}
              </div>
            </div>
          </>
        )}

        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>
    </Modal>
  );
}
