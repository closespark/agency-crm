"use client";

import { useEffect, useState, useCallback } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { IntegrationCard } from "@/components/integrations/integration-card";
import { PageLoader } from "@/components/ui/loading";

interface Integration {
  id: string;
  name: string;
  type: string;
  config: string;
  isActive: boolean;
  lastSyncAt: string | null;
  createdAt: string;
  _count?: { webhookEvents: number };
}

const AVAILABLE_INTEGRATIONS = [
  { name: "anthropic", type: "api_key" },
  { name: "apollo", type: "api_key" },
  { name: "instantly", type: "api_key" },
  { name: "meet_alfred", type: "api_key" },
  { name: "google", type: "oauth" },
  { name: "google_calendar", type: "oauth" },
  { name: "stripe", type: "api_key" },
  { name: "pandadocs", type: "api_key" },
  { name: "tldv", type: "api_key" },
  { name: "vapi", type: "api_key" },
  { name: "zapier_linkedin", type: "webhook" },
  { name: "zapier_twitter", type: "webhook" },
  { name: "zapier_generic", type: "webhook" },
];

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchIntegrations = useCallback(async () => {
    try {
      const res = await fetch("/api/integrations");
      if (res.ok) {
        const json = await res.json();
        setIntegrations(json.data);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchIntegrations();
  }, [fetchIntegrations]);

  async function handleConnect(name: string, type: string) {
    const res = await fetch("/api/integrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, type, config: {} }),
    });

    if (res.ok) {
      fetchIntegrations();
    }
  }

  if (isLoading) return <PageLoader />;

  const connectedNames = new Set(integrations.map((i) => i.name));
  const unconnected = AVAILABLE_INTEGRATIONS.filter(
    (a) => !connectedNames.has(a.name)
  );

  return (
    <div>
      <PageHeader
        title="Integrations"
        description="Connect your favorite tools to streamline your workflow"
      />

      {integrations.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Connected
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {integrations.map((integration) => (
              <IntegrationCard
                key={integration.id}
                integration={integration}
              />
            ))}
          </div>
        </div>
      )}

      {unconnected.length > 0 && (
        <div>
          <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Available Integrations
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {unconnected.map((item) => (
              <IntegrationCard
                key={item.name}
                available={item}
                onConnect={handleConnect}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
