// PandaDocs API client for document signing & proposal management
// API v2 — https://api.pandadoc.com/public/v2
// Auth: Bearer token via PANDADOCS_API_KEY

import { prisma } from "@/lib/prisma";
import { advanceDealStage } from "@/lib/ai/lifecycle-engine";

const PANDADOCS_BASE = "https://api.pandadoc.com/public/v2";
const PANDADOCS_KEY = () => process.env.PANDADOCS_API_KEY || "";

// Template IDs configured via environment
const PROPOSAL_TEMPLATE_ID = () => process.env.PANDADOCS_PROPOSAL_TEMPLATE_ID || "";
const CONTRACT_TEMPLATE_ID = () => process.env.PANDADOCS_CONTRACT_TEMPLATE_ID || "";

// ---------------------------------------------------------------------------
// Rate limiter — PandaDocs allows 5 req/s. Token bucket at 5 req/s.
// ---------------------------------------------------------------------------

class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  constructor(private maxTokens: number, private refillRate: number) {
    this.tokens = maxTokens;
    this.lastRefill = Date.now();
  }

  async waitForToken(): Promise<void> {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }
    // Wait until a token is available
    const waitMs = ((1 - this.tokens) / this.refillRate) * 1000;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    this.refill();
    this.tokens -= 1;
  }

  private refill() {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;
  }
}

const pandadocsLimiter = new RateLimiter(5, 5); // 5 tokens max, refill 5/sec

// ---------------------------------------------------------------------------
// Generic fetch wrapper
// ---------------------------------------------------------------------------

interface PandaDocsRequestOptions {
  method?: string;
  body?: unknown;
  params?: Record<string, string>;
}

async function pandadocsFetch<T>(
  endpoint: string,
  options: PandaDocsRequestOptions = {}
): Promise<T> {
  await pandadocsLimiter.waitForToken();

  const url = new URL(`${PANDADOCS_BASE}${endpoint}`);
  if (options.params) {
    for (const [k, v] of Object.entries(options.params)) {
      url.searchParams.set(k, v);
    }
  }

  const res = await fetch(url.toString(), {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${PANDADOCS_KEY()}`,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`PandaDocs API error (${res.status}): ${error}`);
  }

  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Recipient {
  email: string;
  firstName: string;
  lastName: string;
  role: string;
}

interface PricingTableItem {
  name: string;
  price: number;
  qty: number;
}

interface PricingTable {
  name: string;
  items: PricingTableItem[];
}

interface CreateDocumentParams {
  dealId: string;
  templateId?: string;
  name: string;
  recipients: Recipient[];
  fields?: Record<string, string>;
  pricingTables?: PricingTable[];
}

interface PandaDocsDocumentResponse {
  id: string;
  name: string;
  status: string;
  date_created: string;
  date_modified: string;
  expiration_date: string | null;
  version: string;
}

interface PandaDocsStatusResponse {
  id: string;
  name: string;
  status: string;
  date_created: string;
  date_modified: string;
  expiration_date: string | null;
}

interface PandaDocsDownloadResponse {
  url: string;
}

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/**
 * Creates a document from a PandaDocs template (or blank) and stores it in the
 * PandaDocument table. If a templateId is provided, the document is created from
 * that template; otherwise a blank document is created.
 */
export async function createDocument(params: CreateDocumentParams) {
  const { dealId, templateId, name, recipients, fields, pricingTables } = params;

  // Verify deal exists and get contact info
  const deal = await prisma.deal.findUnique({ where: { id: dealId } });
  if (!deal) throw new Error(`Deal not found: ${dealId}`);

  // Build PandaDocs API payload
  const apiPayload: Record<string, unknown> = {
    name,
    recipients: recipients.map((r) => ({
      email: r.email,
      first_name: r.firstName,
      last_name: r.lastName,
      role: r.role,
    })),
  };

  if (templateId) {
    apiPayload.template_uuid = templateId;
  }

  // Map fields to tokens (PandaDocs template variable format)
  if (fields && Object.keys(fields).length > 0) {
    apiPayload.tokens = Object.entries(fields).map(([key, value]) => ({
      name: key,
      value,
    }));
  }

  // Pricing tables
  if (pricingTables && pricingTables.length > 0) {
    apiPayload.pricing_tables = pricingTables.map((table) => ({
      name: table.name,
      sections: [
        {
          default: true,
          rows: table.items.map((item) => ({
            options: {
              optional: false,
              optional_selected: true,
              qty_editable: false,
            },
            data: {
              name: item.name,
              price: item.price,
              qty: item.qty,
            },
          })),
        },
      ],
    }));
  }

  const response = await pandadocsFetch<PandaDocsDocumentResponse>("/documents", {
    method: "POST",
    body: apiPayload,
  });

  // Calculate total amount from pricing tables
  let totalAmount = deal.amount;
  if (pricingTables && pricingTables.length > 0) {
    totalAmount = pricingTables.reduce(
      (sum, table) =>
        sum + table.items.reduce((tSum, item) => tSum + item.price * item.qty, 0),
      0
    );
  }

  // Store in local database
  const pandaDocument = await prisma.pandaDocument.create({
    data: {
      pandaDocId: response.id,
      dealId,
      contactId: deal.contactId,
      name: response.name,
      status: "document.draft",
      templateId: templateId || null,
      amount: totalAmount,
      expiresAt: response.expiration_date ? new Date(response.expiration_date) : null,
      metadata: JSON.stringify({
        recipients,
        fields: fields || {},
        pricingTables: pricingTables || [],
      }),
    },
  });

  return pandaDocument;
}

/**
 * Sends a document for signature via PandaDocs. Updates the local record
 * status to document.sent and sets sentAt.
 */
export async function sendDocument(
  pandaDocId: string,
  message?: string,
  expiresInDays?: number
) {
  const localDoc = await prisma.pandaDocument.findUnique({
    where: { pandaDocId },
  });
  if (!localDoc) throw new Error(`PandaDocument not found for pandaDocId: ${pandaDocId}`);

  const sendPayload: Record<string, unknown> = {
    silent: false,
  };

  if (message) {
    sendPayload.message = message;
  }

  if (expiresInDays) {
    // PandaDocs expects expiration_date as ISO string
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);
    sendPayload.expiration_date = expiresAt.toISOString().split("T")[0];
  }

  await pandadocsFetch(`/documents/${pandaDocId}/send`, {
    method: "POST",
    body: sendPayload,
  });

  const now = new Date();
  const expiresAt = expiresInDays
    ? new Date(now.getTime() + expiresInDays * 24 * 60 * 60 * 1000)
    : localDoc.expiresAt;

  const updated = await prisma.pandaDocument.update({
    where: { pandaDocId },
    data: {
      status: "document.sent",
      sentAt: now,
      expiresAt,
    },
  });

  return updated;
}

/**
 * Fetches the current document status from PandaDocs API and syncs it
 * to the local PandaDocument record.
 */
export async function getDocumentStatus(pandaDocId: string) {
  const response = await pandadocsFetch<PandaDocsStatusResponse>(
    `/documents/${pandaDocId}`
  );

  // Map PandaDocs status to our status enum
  const statusMap: Record<string, string> = {
    "document.draft": "document.draft",
    "document.sent": "document.sent",
    "document.viewed": "document.viewed",
    "document.waiting_approval": "document.sent",
    "document.approved": "document.sent",
    "document.waiting_pay": "document.sent",
    "document.paid": "document.completed",
    "document.completed": "document.completed",
    "document.voided": "document.voided",
    "document.declined": "document.voided",
  };

  const mappedStatus = statusMap[response.status] || response.status;

  const updated = await prisma.pandaDocument.update({
    where: { pandaDocId },
    data: {
      status: mappedStatus,
      ...(mappedStatus === "document.viewed" ? { viewedAt: new Date() } : {}),
      ...(mappedStatus === "document.completed" ? { completedAt: new Date() } : {}),
    },
  });

  return {
    pandaDocId,
    apiStatus: response.status,
    localStatus: mappedStatus,
    name: response.name,
    record: updated,
  };
}

/**
 * Returns a download URL for the completed document.
 */
export async function downloadDocument(pandaDocId: string) {
  const response = await pandadocsFetch<PandaDocsDownloadResponse>(
    `/documents/${pandaDocId}/download`,
    { method: "GET" }
  );

  // Update local record with download URL
  await prisma.pandaDocument.update({
    where: { pandaDocId },
    data: { downloadUrl: response.url },
  });

  return response.url;
}

/**
 * Voids (cancels) a document via PandaDocs API and updates local status.
 */
export async function voidDocument(pandaDocId: string) {
  await pandadocsFetch(`/documents/${pandaDocId}`, {
    method: "DELETE",
  });

  const updated = await prisma.pandaDocument.update({
    where: { pandaDocId },
    data: { status: "document.voided" },
  });

  return updated;
}

/**
 * High-level: Creates a proposal document from a deal. Reads the deal, contact,
 * and company, then creates a PandaDocs document with pricing table derived from
 * the deal's amount and scope of work.
 *
 * After creation, advances the deal to proposal_sent via the lifecycle engine.
 */
export async function createProposalFromDeal(dealId: string) {
  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    include: {
      contact: true,
      company: true,
    },
  });

  if (!deal) throw new Error(`Deal not found: ${dealId}`);
  if (!deal.contact) throw new Error(`Deal ${dealId} has no associated contact`);

  const contact = deal.contact;
  const company = deal.company;

  const templateId = PROPOSAL_TEMPLATE_ID();
  if (!templateId) throw new Error("PANDADOCS_PROPOSAL_TEMPLATE_ID is not configured");

  // Build pricing table from deal amount and scope
  const pricingTables: PricingTable[] = [];
  if (deal.amount) {
    const scopeItems = deal.scopeOfWork
      ? parseScopeOfWorkToLineItems(deal.scopeOfWork, deal.amount)
      : [{ name: deal.name, price: deal.amount, qty: 1 }];

    pricingTables.push({
      name: "Pricing",
      items: scopeItems,
    });
  }

  // Build template fields from deal/contact/company data
  const fields: Record<string, string> = {
    "client.firstName": contact.firstName,
    "client.lastName": contact.lastName,
    "client.email": contact.email || "",
    "client.company": company?.name || "",
    "deal.name": deal.name,
    "deal.amount": deal.amount?.toFixed(2) || "0.00",
    "deal.scopeOfWork": deal.scopeOfWork || "",
    "deal.paymentTerms": deal.paymentTerms || "",
  };

  if (contact.jobTitle) {
    fields["client.title"] = contact.jobTitle;
  }
  if (company?.address) {
    fields["client.address"] = company.address;
  }

  const pandaDocument = await createDocument({
    dealId,
    templateId,
    name: `Proposal - ${deal.name}`,
    recipients: [
      {
        email: contact.email || "",
        firstName: contact.firstName,
        lastName: contact.lastName,
        role: "Client",
      },
    ],
    fields,
    pricingTables,
  });

  // Update deal with proposal doc reference and required fields for stage gate
  await prisma.deal.update({
    where: { id: dealId },
    data: {
      proposalDoc: pandaDocument.pandaDocId,
      pricingBreakdown: deal.pricingBreakdown || JSON.stringify(pricingTables),
    },
  });

  // Advance deal to proposal_sent via lifecycle engine
  await advanceDealStage(
    dealId,
    "proposal_sent",
    "pandadocs_integration",
    `Proposal document created: ${pandaDocument.pandaDocId}`
  );

  return pandaDocument;
}

/**
 * High-level: Creates a contract document from a deal. Similar to proposal but
 * uses the contract template and sets contract-stage fields.
 *
 * After creation, advances the deal to contract_sent via the lifecycle engine.
 */
export async function createContractFromDeal(dealId: string) {
  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    include: {
      contact: true,
      company: true,
    },
  });

  if (!deal) throw new Error(`Deal not found: ${dealId}`);
  if (!deal.contact) throw new Error(`Deal ${dealId} has no associated contact`);

  const contact = deal.contact;
  const company = deal.company;

  const templateId = CONTRACT_TEMPLATE_ID();
  if (!templateId) throw new Error("PANDADOCS_CONTRACT_TEMPLATE_ID is not configured");

  // Build pricing table from deal amount
  const pricingTables: PricingTable[] = [];
  const contractAmount = deal.actualAmount || deal.amount;
  if (contractAmount) {
    pricingTables.push({
      name: "Contract Value",
      items: [
        {
          name: deal.name,
          price: contractAmount,
          qty: 1,
        },
      ],
    });
  }

  // Build template fields
  const fields: Record<string, string> = {
    "client.firstName": contact.firstName,
    "client.lastName": contact.lastName,
    "client.email": contact.email || "",
    "client.company": company?.name || "",
    "deal.name": deal.name,
    "deal.amount": contractAmount?.toFixed(2) || "0.00",
    "deal.scopeOfWork": deal.scopeOfWork || "",
    "deal.paymentTerms": deal.paymentTerms || "Net 30",
    "deal.contractLength": deal.contractLength?.toString() || "",
    "deal.startDate": deal.startDate?.toISOString().split("T")[0] || "",
  };

  if (contact.jobTitle) {
    fields["client.title"] = contact.jobTitle;
  }
  if (company?.address) {
    fields["client.address"] = company.address;
  }

  // Determine contract version
  const existingContracts = await prisma.pandaDocument.count({
    where: { dealId, templateId },
  });
  const contractVersion = `v${existingContracts + 1}`;

  const pandaDocument = await createDocument({
    dealId,
    templateId,
    name: `Contract - ${deal.name} (${contractVersion})`,
    recipients: [
      {
        email: contact.email || "",
        firstName: contact.firstName,
        lastName: contact.lastName,
        role: "Client",
      },
    ],
    fields,
    pricingTables,
  });

  const now = new Date();

  // Update deal with contract fields required by stage gate
  await prisma.deal.update({
    where: { id: dealId },
    data: {
      contractSentAt: now,
      contractVersion,
    },
  });

  // Advance deal to contract_sent via lifecycle engine
  await advanceDealStage(
    dealId,
    "contract_sent",
    "pandadocs_integration",
    `Contract document created: ${pandaDocument.pandaDocId} (${contractVersion})`
  );

  return pandaDocument;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parses scope of work text into line items for the pricing table.
 * Attempts to split by newlines or bullet points. Falls back to a single
 * line item with the full deal amount if parsing yields nothing useful.
 */
function parseScopeOfWorkToLineItems(
  scopeOfWork: string,
  totalAmount: number
): PricingTableItem[] {
  // Try to split by common delimiters: newlines, bullet points, numbered lists
  const lines = scopeOfWork
    .split(/[\n\r]+/)
    .map((line) => line.replace(/^[\s\-\*\d\.]+/, "").trim())
    .filter((line) => line.length > 0);

  if (lines.length <= 1) {
    return [{ name: scopeOfWork.trim() || "Services", price: totalAmount, qty: 1 }];
  }

  // Distribute amount equally across line items
  const pricePerItem = Math.round((totalAmount / lines.length) * 100) / 100;
  // Handle rounding: put remainder on the last item
  const items: PricingTableItem[] = lines.map((line, i) => ({
    name: line,
    price: i === lines.length - 1
      ? Math.round((totalAmount - pricePerItem * (lines.length - 1)) * 100) / 100
      : pricePerItem,
    qty: 1,
  }));

  return items;
}

// ---------------------------------------------------------------------------
// Exported namespace for consistent pattern with other integrations
// ---------------------------------------------------------------------------

export const pandadocs = {
  createDocument,
  sendDocument,
  getDocumentStatus,
  downloadDocument,
  voidDocument,
  createProposalFromDeal,
  createContractFromDeal,
};
