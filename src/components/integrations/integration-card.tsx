"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/utils";

const INTEGRATION_ICONS: Record<string, string> = {
  instantly: "Instantly",
  slack: "Slack",
  google_calendar: "Google Calendar",
  stripe: "Stripe",
  mailgun: "Mailgun",
  zapier: "Zapier",
};

const INTEGRATION_DESCRIPTIONS: Record<string, string> = {
  instantly: "Cold email outreach and lead generation",
  slack: "Team messaging and notifications",
  google_calendar: "Calendar sync and meeting scheduling",
  stripe: "Payment processing and invoicing",
  mailgun: "Transactional email delivery",
  zapier: "Connect with 5,000+ apps via automation",
};

interface IntegrationCardProps {
  integration?: {
    id: string;
    name: string;
    type: string;
    isActive: boolean;
    lastSyncAt: string | null;
    _count?: { webhookEvents: number };
  };
  available?: {
    name: string;
    type: string;
  };
  onConnect?: (name: string, type: string) => void;
}

export function IntegrationCard({
  integration,
  available,
  onConnect,
}: IntegrationCardProps) {
  if (available) {
    return (
      <Card className="flex flex-col">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              {INTEGRATION_ICONS[available.name] || available.name}
            </CardTitle>
            <Badge variant="secondary">{available.type}</Badge>
          </div>
        </CardHeader>
        <CardContent className="flex-1">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {INTEGRATION_DESCRIPTIONS[available.name] ||
              "Connect this service to your CRM"}
          </p>
        </CardContent>
        <CardFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onConnect?.(available.name, available.type)}
          >
            Connect
          </Button>
        </CardFooter>
      </Card>
    );
  }

  if (!integration) return null;

  const displayName =
    INTEGRATION_ICONS[integration.name] || integration.name;

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{displayName}</CardTitle>
          <Badge variant={integration.isActive ? "success" : "secondary"}>
            {integration.isActive ? "Active" : "Inactive"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex-1 space-y-2">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {INTEGRATION_DESCRIPTIONS[integration.name] ||
            "Connected integration"}
        </p>
        <div className="space-y-1 text-xs text-zinc-400 dark:text-zinc-500">
          <p>
            Type:{" "}
            <span className="text-zinc-600 dark:text-zinc-300">
              {integration.type}
            </span>
          </p>
          {integration.lastSyncAt && (
            <p>
              Last sync:{" "}
              <span className="text-zinc-600 dark:text-zinc-300">
                {formatDateTime(integration.lastSyncAt)}
              </span>
            </p>
          )}
          {integration._count && (
            <p>
              Webhook events:{" "}
              <span className="text-zinc-600 dark:text-zinc-300">
                {integration._count.webhookEvents}
              </span>
            </p>
          )}
        </div>
      </CardContent>
      <CardFooter>
        <Link href={`/integrations/${integration.id}`}>
          <Button variant="outline" size="sm">
            Configure
          </Button>
        </Link>
      </CardFooter>
    </Card>
  );
}
