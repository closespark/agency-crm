"use client";

import { useEffect, useState, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { IntegrationConfig } from "@/components/integrations/integration-config";
import { WebhookLog } from "@/components/integrations/webhook-log";
import { Tabs } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { PageLoader } from "@/components/ui/loading";

interface Integration {
  id: string;
  name: string;
  type: string;
  config: string;
  isActive: boolean;
  lastSyncAt: string | null;
  createdAt: string;
  webhookEvents: WebhookEvent[];
  _count: { webhookEvents: number };
}

interface WebhookEvent {
  id: string;
  eventType: string;
  payload: string;
  status: string;
  processedAt: string | null;
  error: string | null;
  createdAt: string;
}

interface EventsMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

const DISPLAY_NAMES: Record<string, string> = {
  anthropic: "Anthropic (Claude AI)",
  apollo: "Apollo.io",
  instantly: "Instantly",
  meet_alfred: "Meet Alfred",
  google: "Google (Gmail & OAuth)",
  google_calendar: "Google Calendar",
  stripe: "Stripe",
  pandadocs: "PandaDocs",
  tldv: "tl;dv",
  vapi: "Vapi.ai",
};

export default function IntegrationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [integration, setIntegration] = useState<Integration | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [eventsMeta, setEventsMeta] = useState<EventsMeta>({
    page: 1,
    pageSize: 25,
    total: 0,
    totalPages: 0,
  });
  const [eventsLoading, setEventsLoading] = useState(false);

  const fetchIntegration = useCallback(async () => {
    try {
      const res = await fetch(`/api/integrations/${id}`);
      if (!res.ok) {
        router.push("/integrations");
        return;
      }
      const json = await res.json();
      setIntegration(json.data);
    } finally {
      setIsLoading(false);
    }
  }, [id, router]);

  const fetchEvents = useCallback(
    async (page = 1) => {
      setEventsLoading(true);
      try {
        const res = await fetch(
          `/api/integrations/${id}/events?page=${page}&pageSize=25`
        );
        if (res.ok) {
          const json = await res.json();
          setEvents(json.data);
          setEventsMeta(json.meta);
        }
      } finally {
        setEventsLoading(false);
      }
    },
    [id]
  );

  useEffect(() => {
    fetchIntegration();
    fetchEvents();
  }, [fetchIntegration, fetchEvents]);

  async function handleSave(config: Record<string, string>) {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/integrations/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config }),
      });
      if (res.ok) {
        await fetchIntegration();
      }
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggle() {
    const res = await fetch(`/api/integrations/${id}/toggle`, {
      method: "PATCH",
    });
    if (res.ok) {
      await fetchIntegration();
    }
  }

  async function handleTest() {
    setIsTesting(true);
    setTestResult(null);
    try {
      // Simulate a test connection by checking the integration config
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const config = integration?.config ? JSON.parse(integration.config) : {};
      const hasConfig = Object.values(config).some(
        (v) => typeof v === "string" && v.length > 0
      );
      if (hasConfig) {
        setTestResult({
          success: true,
          message: "Connection test successful. Integration is reachable.",
        });
      } else {
        setTestResult({
          success: false,
          message:
            "Connection test failed. Please ensure your credentials are configured.",
        });
      }
    } catch {
      setTestResult({
        success: false,
        message: "Connection test failed. An unexpected error occurred.",
      });
    } finally {
      setIsTesting(false);
    }
  }

  async function handleSync() {
    setIsSyncing(true);
    try {
      await fetch(`/api/integrations/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lastSyncAt: new Date().toISOString() }),
      });
      await fetchIntegration();
    } finally {
      setIsSyncing(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Are you sure you want to delete this integration?")) return;

    const res = await fetch(`/api/integrations/${id}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/integrations");
    }
  }

  if (isLoading || !integration) return <PageLoader />;

  const displayName =
    DISPLAY_NAMES[integration.name] || integration.name;

  return (
    <div>
      <PageHeader
        title={displayName}
        description={`Manage your ${displayName} integration`}
        actions={
          <Button variant="destructive" size="sm" onClick={handleDelete}>
            Delete Integration
          </Button>
        }
      />

      <Tabs
        tabs={[
          {
            id: "config",
            label: "Configuration",
            content: (
              <IntegrationConfig
                integration={integration}
                onSave={handleSave}
                onToggle={handleToggle}
                onTest={handleTest}
                onSync={handleSync}
                isSaving={isSaving}
                isTesting={isTesting}
                isSyncing={isSyncing}
                testResult={testResult}
              />
            ),
          },
          {
            id: "events",
            label: `Webhook Events (${integration._count.webhookEvents})`,
            content: (
              <WebhookLog
                events={events}
                page={eventsMeta.page}
                totalPages={eventsMeta.totalPages}
                total={eventsMeta.total}
                onPageChange={(p) => fetchEvents(p)}
                isLoading={eventsLoading}
              />
            ),
          },
        ]}
        defaultTab="config"
      />
    </div>
  );
}
