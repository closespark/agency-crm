"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { parseJSON } from "@/lib/utils";

interface IntegrationConfigProps {
  integration: {
    id: string;
    name: string;
    type: string;
    config: string;
    isActive: boolean;
    lastSyncAt: string | null;
  };
  onSave: (config: Record<string, string>) => Promise<void>;
  onToggle: () => Promise<void>;
  onTest: () => Promise<void>;
  onSync: () => Promise<void>;
  isSaving: boolean;
  isTesting: boolean;
  isSyncing: boolean;
  testResult: { success: boolean; message: string } | null;
}

const CONFIG_FIELDS: Record<string, { label: string; placeholder: string; type: string }[]> = {
  anthropic: [
    { label: "API Key", placeholder: "sk-ant-...", type: "password" },
  ],
  apollo: [
    { label: "API Key", placeholder: "Enter your Apollo.io API key", type: "password" },
  ],
  instantly: [
    { label: "API Key", placeholder: "Enter your Instantly API key", type: "password" },
    { label: "Base URL", placeholder: "https://api.instantly.ai/api/v2", type: "text" },
  ],
  meet_alfred: [
    { label: "API Key", placeholder: "Enter your Meet Alfred API key", type: "password" },
    { label: "Base URL", placeholder: "https://app.meetalfred.com/api", type: "text" },
  ],
  google: [
    { label: "Client ID", placeholder: "Enter Google OAuth client ID", type: "text" },
    { label: "Client Secret", placeholder: "Enter Google OAuth client secret", type: "password" },
  ],
  google_calendar: [
    { label: "Client ID", placeholder: "Enter OAuth client ID", type: "text" },
    { label: "Client Secret", placeholder: "Enter client secret", type: "password" },
    { label: "Calendar ID", placeholder: "primary", type: "text" },
  ],
  stripe: [
    { label: "Secret Key", placeholder: "sk_live_...", type: "password" },
    { label: "Webhook Secret", placeholder: "whsec_...", type: "password" },
  ],
  pandadocs: [
    { label: "API Key", placeholder: "Enter your PandaDocs API key", type: "password" },
    { label: "Proposal Template ID", placeholder: "Template ID for proposals", type: "text" },
    { label: "Contract Template ID", placeholder: "Template ID for contracts", type: "text" },
  ],
  tldv: [
    { label: "API Key", placeholder: "Enter your tl;dv API key", type: "password" },
  ],
  vapi: [
    { label: "API Key", placeholder: "Enter your Vapi.ai API key", type: "password" },
  ],
};

function toFieldKey(label: string): string {
  return label.toLowerCase().replace(/\s+/g, "_");
}

export function IntegrationConfig({
  integration,
  onSave,
  onToggle,
  onTest,
  onSync,
  isSaving,
  isTesting,
  isSyncing,
  testResult,
}: IntegrationConfigProps) {
  const existingConfig = parseJSON<Record<string, string>>(integration.config, {});
  const [config, setConfig] = useState<Record<string, string>>(existingConfig);

  const fields = CONFIG_FIELDS[integration.name] || [
    { label: "API Key", placeholder: "Enter API key", type: "password" },
  ];

  const webhookUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/webhooks/${integration.id}`
      : `/api/webhooks/${integration.id}`;

  function handleFieldChange(key: string, value: string) {
    setConfig((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Configuration</CardTitle>
            <Badge variant={integration.isActive ? "success" : "secondary"}>
              {integration.isActive ? "Active" : "Inactive"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {fields.map((field) => {
            const key = toFieldKey(field.label);
            return (
              <Input
                key={key}
                id={key}
                label={field.label}
                type={field.type}
                placeholder={field.placeholder}
                value={config[key] || ""}
                onChange={(e) => handleFieldChange(key, e.target.value)}
              />
            );
          })}

          <div className="space-y-1">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Webhook URL
            </label>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={webhookUrl}
                className="flex h-9 w-full rounded-md border border-zinc-300 bg-zinc-50 px-3 py-1 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigator.clipboard.writeText(webhookUrl)}
              >
                Copy
              </Button>
            </div>
            <p className="text-xs text-zinc-400">
              Use this URL to receive webhooks from{" "}
              {integration.name.replace("_", " ")}
            </p>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button onClick={() => onSave(config)} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save Configuration"}
            </Button>
            <Button variant="outline" onClick={onToggle}>
              {integration.isActive ? "Deactivate" : "Activate"}
            </Button>
            {integration.name === "google_calendar" && (
              <Button
                variant="outline"
                onClick={() => {
                  window.location.href = "/api/integrations/google-calendar/authorize";
                }}
              >
                Authorize with Google
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={onTest} disabled={isTesting}>
              {isTesting ? "Testing..." : "Test Connection"}
            </Button>
            <Button variant="outline" onClick={onSync} disabled={isSyncing}>
              {isSyncing ? "Syncing..." : "Sync Now"}
            </Button>
          </div>

          {testResult && (
            <div
              className={`rounded-md p-3 text-sm ${
                testResult.success
                  ? "bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-300"
                  : "bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-300"
              }`}
            >
              {testResult.message}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
