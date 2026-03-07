// Stripe integration — billing, invoicing, and subscription management
// Used when deals close (closed_won) to create customers, send invoices,
// and manage recurring retainer subscriptions.
//
// Auth: STRIPE_SECRET_KEY env var
// Webhooks: STRIPE_WEBHOOK_SECRET for signature verification

import Stripe from "stripe";
import { prisma } from "@/lib/prisma";

// ============================================
// STRIPE CLIENT
// ============================================

let _stripe: Stripe | null = null;
function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not configured. Set it in Settings → Integrations → Stripe.");
    _stripe = new Stripe(key);
  }
  return _stripe;
}

// Called by integration-keys after DB load to reinitialize with DB-stored key
export function resetStripeClient(): void {
  _stripe = null;
}

// Keep `stripe` export for existing code — lazily initialized
const stripe = new Proxy({} as Stripe, {
  get(_, prop) {
    if (prop === "then") return undefined;
    const instance = getStripe();
    const value = (instance as unknown as Record<string | symbol, unknown>)[prop];
    return typeof value === "function" ? value.bind(instance) : value;
  },
});

// ============================================
// CUSTOMER MANAGEMENT
// ============================================

interface CreateCustomerParams {
  email: string;
  name: string;
  contactId?: string;
  companyId?: string;
  metadata?: Record<string, string>;
}

/**
 * Creates a Stripe customer and stores the mapping in the local database.
 * If a local StripeCustomer already exists for this contactId or companyId,
 * returns the existing record instead of creating a duplicate.
 */
export async function createCustomer(params: CreateCustomerParams) {
  // Check for existing local customer to avoid duplicates
  if (params.contactId) {
    const existing = await prisma.stripeCustomer.findFirst({
      where: { contactId: params.contactId },
    });
    if (existing) return existing;
  }
  if (params.companyId) {
    const existing = await prisma.stripeCustomer.findFirst({
      where: { companyId: params.companyId },
    });
    if (existing) return existing;
  }

  const stripeCustomer = await stripe.customers.create({
    email: params.email,
    name: params.name,
    metadata: {
      ...params.metadata,
      ...(params.contactId ? { contactId: params.contactId } : {}),
      ...(params.companyId ? { companyId: params.companyId } : {}),
      source: "agency-crm",
    },
  });

  const localCustomer = await prisma.stripeCustomer.create({
    data: {
      stripeCustomerId: stripeCustomer.id,
      email: params.email,
      name: params.name,
      contactId: params.contactId || null,
      companyId: params.companyId || null,
    },
  });

  return localCustomer;
}

// ============================================
// INVOICE MANAGEMENT
// ============================================

interface CreateInvoiceParams {
  stripeCustomerId: string; // Stripe customer ID (cus_xxx)
  amount: number; // Amount in smallest currency unit (cents)
  currency?: string;
  description: string;
  dealId?: string;
  dueInDays?: number; // Days until due, defaults to 30
}

/**
 * Creates a one-time invoice with a single line item, finalizes it,
 * and sends it to the customer. Stores the invoice in the local database.
 */
export async function createInvoice(params: CreateInvoiceParams) {
  const currency = params.currency || "usd";
  const dueInDays = params.dueInDays ?? 30;

  // Create the invoice
  const invoice = await stripe.invoices.create({
    customer: params.stripeCustomerId,
    collection_method: "send_invoice",
    days_until_due: dueInDays,
    metadata: {
      ...(params.dealId ? { dealId: params.dealId } : {}),
      source: "agency-crm",
    },
  });

  // Add line item
  await stripe.invoiceItems.create({
    customer: params.stripeCustomerId,
    invoice: invoice.id,
    amount: params.amount,
    currency,
    description: params.description,
  });

  // Finalize and send
  const finalizedInvoice = await stripe.invoices.finalizeInvoice(invoice.id);
  await stripe.invoices.sendInvoice(invoice.id);

  // Store locally
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + dueInDays);

  const localInvoice = await prisma.stripeInvoice.create({
    data: {
      stripeInvoiceId: finalizedInvoice.id,
      stripeCustomerId: params.stripeCustomerId,
      dealId: params.dealId || null,
      status: finalizedInvoice.status || "open",
      amount: params.amount,
      currency,
      description: params.description,
      dueDate,
      hostedUrl: finalizedInvoice.hosted_invoice_url || null,
      pdfUrl: finalizedInvoice.invoice_pdf || null,
    },
  });

  return localInvoice;
}

// ============================================
// SUBSCRIPTION MANAGEMENT
// ============================================

interface CreateSubscriptionParams {
  stripeCustomerId: string; // Stripe customer ID (cus_xxx)
  priceId: string; // Stripe price ID (price_xxx)
  dealId?: string;
  clientLifecycleId?: string;
}

/**
 * Creates a recurring subscription for a retainer client.
 * The priceId should reference an existing Stripe Price object
 * configured with the correct interval and amount.
 */
export async function createSubscription(params: CreateSubscriptionParams) {
  const subscription = await stripe.subscriptions.create({
    customer: params.stripeCustomerId,
    items: [{ price: params.priceId }],
    metadata: {
      ...(params.dealId ? { dealId: params.dealId } : {}),
      ...(params.clientLifecycleId ? { clientLifecycleId: params.clientLifecycleId } : {}),
      source: "agency-crm",
    },
  });

  // Extract amount and period from the first subscription item
  const item = subscription.items.data[0];
  const amount = item?.price?.unit_amount || 0;
  const currency = item?.price?.currency || "usd";
  const interval = item?.price?.recurring?.interval || "month";

  const localSubscription = await prisma.stripeSubscription.create({
    data: {
      stripeSubscriptionId: subscription.id,
      stripeCustomerId: params.stripeCustomerId,
      dealId: params.dealId || null,
      clientLifecycleId: params.clientLifecycleId || null,
      status: subscription.status,
      priceId: params.priceId,
      amount,
      currency,
      interval,
      currentPeriodStart: item ? new Date(item.current_period_start * 1000) : null,
      currentPeriodEnd: item ? new Date(item.current_period_end * 1000) : null,
    },
  });

  return localSubscription;
}

/**
 * Cancels a subscription at the end of the current billing period.
 * Does not immediately terminate — the customer retains access until period end.
 */
export async function cancelSubscription(stripeSubscriptionId: string) {
  const subscription = await stripe.subscriptions.update(stripeSubscriptionId, {
    cancel_at_period_end: true,
  });

  const localSubscription = await prisma.stripeSubscription.update({
    where: { stripeSubscriptionId },
    data: {
      status: subscription.status,
      canceledAt: new Date(),
    },
  });

  return localSubscription;
}

// ============================================
// CUSTOMER LOOKUPS
// ============================================

/**
 * Looks up the local StripeCustomer record by CRM contact ID.
 */
export async function getCustomerByContact(contactId: string) {
  return prisma.stripeCustomer.findFirst({
    where: { contactId },
    include: { invoices: true, subscriptions: true },
  });
}

/**
 * Looks up the local StripeCustomer record by CRM company ID.
 */
export async function getCustomerByCompany(companyId: string) {
  return prisma.stripeCustomer.findFirst({
    where: { companyId },
    include: { invoices: true, subscriptions: true },
  });
}

// ============================================
// INVOICE SYNC
// ============================================

/**
 * Fetches the latest invoice state from Stripe and updates the local record.
 * Useful for reconciliation or manual sync triggers.
 */
export async function syncInvoiceStatus(stripeInvoiceId: string) {
  const stripeInvoice = await stripe.invoices.retrieve(stripeInvoiceId);

  const localInvoice = await prisma.stripeInvoice.update({
    where: { stripeInvoiceId },
    data: {
      status: stripeInvoice.status || "open",
      hostedUrl: stripeInvoice.hosted_invoice_url || null,
      pdfUrl: stripeInvoice.invoice_pdf || null,
      paidAt: stripeInvoice.status === "paid" && stripeInvoice.status_transitions?.paid_at
        ? new Date(stripeInvoice.status_transitions.paid_at * 1000)
        : undefined,
    },
  });

  return localInvoice;
}

// ============================================
// WEBHOOK VERIFICATION
// ============================================

/**
 * Verifies a Stripe webhook signature and returns the typed event.
 * Should be called with the raw request body (Buffer/string) and
 * the Stripe-Signature header value.
 */
export function parseWebhook(payload: string | Buffer, signature: string): Stripe.Event {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not configured");
  }

  return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
}

// ============================================
// EXPORTED STRIPE INSTANCE (for advanced usage)
// ============================================

export { stripe };
