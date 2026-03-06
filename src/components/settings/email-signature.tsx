"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";

interface SignatureFormData {
  name: string;
  title: string;
  company: string;
  phone: string;
  email: string;
  website: string;
  bookingUrl: string;
  linkedIn: string;
  twitter: string;
  logoUrl: string;
}

export function EmailSignatureSettings() {
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { isSubmitting },
  } = useForm<SignatureFormData>({
    defaultValues: {
      name: "",
      title: "",
      company: "",
      phone: "",
      email: "",
      website: "",
      bookingUrl: "",
      linkedIn: "",
      twitter: "",
      logoUrl: "",
    },
  });

  const values = watch();

  // Load existing signature config
  useEffect(() => {
    fetch("/api/settings/email-signature")
      .then((r) => r.json())
      .then((data) => {
        if (data.config) {
          reset(data.config);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [reset]);

  async function onSubmit(data: SignatureFormData) {
    setStatus(null);
    setError(null);
    try {
      const res = await fetch("/api/settings/email-signature", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Failed to save signature");
      }
      setStatus("Email signature saved successfully");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-zinc-500">
          Loading signature settings...
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Email Signature</CardTitle>
          <CardDescription>
            This signature is automatically appended to every outbound email —
            booking confirmations, meeting reminders, follow-ups, sequence
            emails, and AI-generated messages.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <CardContent className="space-y-4">
            {status && <p className="text-sm text-green-600">{status}</p>}
            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="grid grid-cols-2 gap-4">
              <Input
                id="sig-name"
                label="Full Name *"
                placeholder="Chris Tabb"
                {...register("name", { required: true })}
              />
              <Input
                id="sig-title"
                label="Title *"
                placeholder="Founder"
                {...register("title", { required: true })}
              />
            </div>

            <Input
              id="sig-company"
              label="Company *"
              placeholder="Nexus Ops"
              {...register("company", { required: true })}
            />

            <div className="grid grid-cols-2 gap-4">
              <Input
                id="sig-email"
                label="Email"
                type="email"
                placeholder="chris@nexusops.com"
                {...register("email")}
              />
              <Input
                id="sig-phone"
                label="Phone"
                placeholder="+1 (555) 123-4567"
                {...register("phone")}
              />
            </div>

            <Input
              id="sig-website"
              label="Website"
              placeholder="https://nexusops.com"
              {...register("website")}
            />

            <Input
              id="sig-booking"
              label="Booking URL"
              placeholder="https://nexusops.com/book"
              {...register("bookingUrl")}
            />

            <div className="grid grid-cols-2 gap-4">
              <Input
                id="sig-linkedin"
                label="LinkedIn"
                placeholder="https://linkedin.com/in/christabb"
                {...register("linkedIn")}
              />
              <Input
                id="sig-twitter"
                label="Twitter / X"
                placeholder="https://x.com/christabb"
                {...register("twitter")}
              />
            </div>

            <Input
              id="sig-logo"
              label="Logo URL"
              placeholder="https://nexusops.com/logo.png"
              {...register("logoUrl")}
            />
          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save Signature"}
            </Button>
          </CardFooter>
        </form>
      </Card>

      {/* Live Preview */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Preview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg p-4 bg-white dark:bg-zinc-900">
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-3 italic">
              ...end of email body
            </p>
            <hr className="border-zinc-200 dark:border-zinc-700 mb-3" />
            <div className="font-sans text-sm">
              {values.logoUrl && (
                <img
                  src={values.logoUrl}
                  alt={values.company || "Logo"}
                  className="h-8 mb-2"
                />
              )}
              <p className="font-semibold text-zinc-900 dark:text-zinc-100">
                {values.name || "Your Name"}
              </p>
              <p className="text-zinc-500 text-xs">
                {values.title || "Title"} at{" "}
                {values.company || "Company"}
              </p>
              {(values.phone || values.email || values.website) && (
                <p className="text-xs text-zinc-500 mt-1">
                  {[values.phone, values.email, values.website?.replace(/^https?:\/\//, "")]
                    .filter(Boolean)
                    .join(" | ")}
                </p>
              )}
              {(values.linkedIn || values.twitter) && (
                <p className="text-xs mt-1">
                  {values.linkedIn && (
                    <span className="text-blue-600 mr-3">LinkedIn</span>
                  )}
                  {values.twitter && (
                    <span className="text-blue-600">Twitter</span>
                  )}
                </p>
              )}
              {values.bookingUrl && (
                <div className="mt-2">
                  <span className="inline-block px-3 py-1 bg-blue-600 text-white text-xs font-semibold rounded">
                    Book a Meeting
                  </span>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
