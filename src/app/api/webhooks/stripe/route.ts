import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseWebhook } from "@/lib/integrations/stripe";
import type Stripe from "stripe";

/**
 * Stripe webhook handler.
 *
 * IMPORTANT: Stripe requires the raw body for signature verification.
 * Next.js App Router gives us the raw body via request.text().
 *
 * Events handled:
 *  - invoice.paid
 *  - invoice.payment_failed
 *  - customer.subscription.updated
 *  - customer.subscription.deleted
 *  - checkout.session.completed
 */
export async function POST(request: NextRequest) {
  let rawBody: string;
  let event: Stripe.Event;

  try {
    rawBody = await request.text();
  } catch (err) {
    console.error("Stripe webhook: failed to read request body:", err);
    return NextResponse.json({ error: "Failed to read body" }, { status: 400 });
  }

  // Log raw event BEFORE signature verification — replayable even if sig logic has bugs
  const rawLog = await prisma.rawEventLog.create({
    data: {
      source: "stripe",
      eventType: "pending_verification",
      rawPayload: rawBody,
    },
  });

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    await prisma.rawEventLog.update({
      where: { id: rawLog.id },
      data: { processingError: "Missing stripe-signature header" },
    });
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  try {
    event = parseWebhook(rawBody, signature);
  } catch (err) {
    console.error("Stripe webhook: signature verification failed:", err);
    await prisma.rawEventLog.update({
      where: { id: rawLog.id },
      data: { processingError: "Signature verification failed" },
    });
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // Update event type now that we know it
  await prisma.rawEventLog.update({
    where: { id: rawLog.id },
    data: { eventType: event.type },
  });

  const markProcessed = (contactId?: string | null, error?: string) =>
    prisma.rawEventLog.update({
      where: { id: rawLog.id },
      data: {
        processed: !error,
        processedAt: new Date(),
        contactId: contactId || null,
        processingError: error || null,
      },
    });

  try {
    switch (event.type) {
      case "invoice.paid":
        await handleInvoicePaid(event.data.object as Stripe.Invoice);
        break;

      case "invoice.payment_failed":
        await handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      case "customer.subscription.updated":
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;

      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;

      default:
        // Acknowledge events we don't handle to prevent retries
        await markProcessed();
        return NextResponse.json({ status: "ok", event: event.type, action: "ignored" });
    }

    await markProcessed();
    return NextResponse.json({ status: "ok", event: event.type });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown processing error";
    console.error(`Stripe webhook processing error (${event.type}):`, err);
    await markProcessed(null, message);
    // Return 200 to prevent Stripe from retrying — the error is logged for replay
    return NextResponse.json({ status: "error", event: event.type, error: message });
  }
}

// ============================================
// HELPERS
// ============================================

/** Extract Stripe customer ID string from the customer field (string or expanded object). */
function resolveCustomerId(customer: string | Stripe.Customer | Stripe.DeletedCustomer | null): string | null {
  if (!customer) return null;
  if (typeof customer === "string") return customer;
  return customer.id;
}

/** Extract subscription ID from invoice parent (Stripe v20+: invoice.parent.subscription_details). */
function resolveSubscriptionIdFromInvoice(invoice: Stripe.Invoice): string | null {
  const parent = invoice.parent;
  if (!parent) return null;
  const subDetails = parent.subscription_details;
  if (!subDetails?.subscription) return null;
  return typeof subDetails.subscription === "string"
    ? subDetails.subscription
    : subDetails.subscription.id;
}

// ============================================
// EVENT HANDLERS
// ============================================

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  const stripeCustomerId = resolveCustomerId(invoice.customer);

  if (!stripeCustomerId) {
    console.error("Stripe webhook: invoice.paid missing customer ID, invoice:", invoice.id);
    return;
  }

  // Cross-check: verify invoice state directly with Stripe API to prevent forged amounts
  try {
    const { syncInvoiceStatus } = await import("@/lib/integrations/stripe");
    const verified = await syncInvoiceStatus(invoice.id);
    if (verified.status !== "paid") {
      console.error(`Stripe webhook: invoice ${invoice.id} claims paid but Stripe API says ${verified.status}`);
      return;
    }
  } catch (err) {
    console.error(`Stripe webhook: failed to verify invoice ${invoice.id} via API:`, err);
    // Continue with webhook data if verification fails — better than blocking all payments
  }

  const subscriptionId = resolveSubscriptionIdFromInvoice(invoice);

  // Update or create local invoice record
  const existingInvoice = await prisma.stripeInvoice.findUnique({
    where: { stripeInvoiceId: invoice.id },
  });

  if (existingInvoice) {
    await prisma.stripeInvoice.update({
      where: { stripeInvoiceId: invoice.id },
      data: {
        status: "paid",
        paidAt: new Date(),
        hostedUrl: invoice.hosted_invoice_url || null,
        pdfUrl: invoice.invoice_pdf || null,
      },
    });
  } else {
    // Invoice was created outside the CRM (e.g., Stripe dashboard) — store it
    await prisma.stripeInvoice.create({
      data: {
        stripeInvoiceId: invoice.id,
        stripeCustomerId,
        subscriptionId: subscriptionId || null,
        status: "paid",
        amount: invoice.amount_paid || 0,
        currency: invoice.currency || "usd",
        description: invoice.description || null,
        dueDate: invoice.due_date ? new Date(invoice.due_date * 1000) : null,
        paidAt: new Date(),
        hostedUrl: invoice.hosted_invoice_url || null,
        pdfUrl: invoice.invoice_pdf || null,
      },
    });
  }

  // Resolve contact from StripeCustomer
  const customer = await prisma.stripeCustomer.findUnique({
    where: { stripeCustomerId },
  });

  if (!customer) {
    console.error("Stripe webhook: no local StripeCustomer for", stripeCustomerId);
    return;
  }

  // Create Activity for the payment
  const adminUser = await prisma.user.findFirst({ where: { role: "admin" } });
  if (adminUser) {
    const amountFormatted = (invoice.amount_paid / 100).toFixed(2);
    await prisma.activity.create({
      data: {
        type: "note",
        subject: `Payment received: ${invoice.currency?.toUpperCase()} ${amountFormatted}`,
        body: `Invoice ${invoice.id} paid. ${invoice.description || ""}`.trim(),
        userId: adminUser.id,
        contactId: customer.contactId || null,
        dealId: existingInvoice?.dealId || null,
      },
    });
  }

  // Bump client health score on successful payment
  if (customer.contactId) {
    const lifecycle = await prisma.clientLifecycle.findFirst({
      where: { contactId: customer.contactId },
      orderBy: { createdAt: "desc" },
    });

    if (lifecycle) {
      const newHealth = Math.min(100, lifecycle.healthScore + 5);
      await prisma.clientLifecycle.update({
        where: { id: lifecycle.id },
        data: {
          healthScore: newHealth,
          lastActivityAt: new Date(),
        },
      });
    }
  }
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const stripeCustomerId = resolveCustomerId(invoice.customer);

  if (!stripeCustomerId) {
    console.error("Stripe webhook: invoice.payment_failed missing customer ID, invoice:", invoice.id);
    return;
  }

  // Update local invoice status
  const existingInvoice = await prisma.stripeInvoice.findUnique({
    where: { stripeInvoiceId: invoice.id },
  });

  if (existingInvoice) {
    await prisma.stripeInvoice.update({
      where: { stripeInvoiceId: invoice.id },
      data: { status: "open" },
    });
  }

  // Resolve customer
  const customer = await prisma.stripeCustomer.findUnique({
    where: { stripeCustomerId },
  });

  if (!customer) {
    console.error("Stripe webhook: no local StripeCustomer for", stripeCustomerId);
    return;
  }

  // Create notification for the team
  const adminUser = await prisma.user.findFirst({ where: { role: "admin" } });
  if (adminUser) {
    const amountFormatted = (invoice.amount_due / 100).toFixed(2);
    await prisma.notification.create({
      data: {
        userId: adminUser.id,
        title: `Payment failed: ${invoice.currency?.toUpperCase()} ${amountFormatted}`,
        body: `Invoice ${invoice.id} for ${customer.name || customer.email} failed. Stripe will retry automatically.`,
        type: "deal_update",
        resourceType: "stripeInvoice",
        resourceId: invoice.id,
      },
    });
  }

  // Create AIInsight for churn risk
  const resourceId = customer.contactId || customer.companyId || customer.id;
  const resourceType = customer.contactId ? "contact" : customer.companyId ? "company" : "contact";

  await prisma.aIInsight.create({
    data: {
      type: "churn_warning",
      title: `Payment failed for ${customer.name || customer.email}`,
      description: `Invoice ${invoice.id} payment failed (${invoice.currency?.toUpperCase()} ${(invoice.amount_due / 100).toFixed(2)}). This is an early churn indicator — reach out to the client to resolve billing issues before the relationship degrades.`,
      reasoning: "Failed payments are the strongest leading indicator of involuntary churn. Proactive outreach within 24 hours recovers 60-80% of failed payments.",
      priority: "high",
      resourceType,
      resourceId,
      actionItems: JSON.stringify([
        "Contact client about payment method",
        "Check if credit card on file is expired",
        "Offer alternative payment method if needed",
        "Schedule follow-up in 3 days if unresolved",
      ]),
      status: "new",
    },
  });

  // Degrade client health
  if (customer.contactId) {
    const lifecycle = await prisma.clientLifecycle.findFirst({
      where: { contactId: customer.contactId },
      orderBy: { createdAt: "desc" },
    });

    if (lifecycle) {
      const newHealth = Math.max(0, lifecycle.healthScore - 15);
      const churnRisk = newHealth < 40 ? "critical" : newHealth < 60 ? "high" : "medium";
      await prisma.clientLifecycle.update({
        where: { id: lifecycle.id },
        data: {
          healthScore: newHealth,
          churnRiskLevel: churnRisk,
          lastActivityAt: new Date(),
        },
      });
    }
  }
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const stripeCustomerId = resolveCustomerId(subscription.customer);

  if (!stripeCustomerId) {
    console.error("Stripe webhook: subscription.updated missing customer ID, sub:", subscription.id);
    return;
  }

  // In Stripe v20+, period fields are on items, not the subscription root
  const item = subscription.items.data[0];
  const amount = item?.price?.unit_amount || 0;
  const currency = item?.price?.currency || "usd";
  const interval = item?.price?.recurring?.interval || "month";
  const priceId = item?.price?.id || null;
  const periodStart = item ? new Date(item.current_period_start * 1000) : null;
  const periodEnd = item ? new Date(item.current_period_end * 1000) : null;

  // Upsert: the subscription may have been created outside the CRM
  const existing = await prisma.stripeSubscription.findUnique({
    where: { stripeSubscriptionId: subscription.id },
  });

  if (existing) {
    await prisma.stripeSubscription.update({
      where: { stripeSubscriptionId: subscription.id },
      data: {
        status: subscription.status,
        priceId,
        amount,
        currency,
        interval,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        canceledAt: subscription.canceled_at
          ? new Date(subscription.canceled_at * 1000)
          : null,
      },
    });
  } else {
    await prisma.stripeSubscription.create({
      data: {
        stripeSubscriptionId: subscription.id,
        stripeCustomerId,
        dealId: (subscription.metadata?.dealId as string) || null,
        clientLifecycleId: (subscription.metadata?.clientLifecycleId as string) || null,
        status: subscription.status,
        priceId,
        amount,
        currency,
        interval,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        canceledAt: subscription.canceled_at
          ? new Date(subscription.canceled_at * 1000)
          : null,
      },
    });
  }
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const stripeCustomerId = resolveCustomerId(subscription.customer);

  // Update local subscription record
  const existing = await prisma.stripeSubscription.findUnique({
    where: { stripeSubscriptionId: subscription.id },
  });

  if (existing) {
    await prisma.stripeSubscription.update({
      where: { stripeSubscriptionId: subscription.id },
      data: {
        status: "canceled",
        canceledAt: subscription.canceled_at
          ? new Date(subscription.canceled_at * 1000)
          : new Date(),
      },
    });
  }

  // Resolve customer and create churn signal
  if (!stripeCustomerId) return;

  const customer = await prisma.stripeCustomer.findUnique({
    where: { stripeCustomerId },
  });

  if (!customer?.contactId) return;

  const lifecycle = await prisma.clientLifecycle.findFirst({
    where: {
      contactId: customer.contactId,
      ...(existing?.clientLifecycleId ? { id: existing.clientLifecycleId } : {}),
    },
    orderBy: { createdAt: "desc" },
  });

  if (!lifecycle) return;

  // Append churn signal to ClientLifecycle
  const { safeParseJSON } = await import("@/lib/safe-json");
  const existingSignals: Array<{ signal: string; date: string; severity: string }> = safeParseJSON(lifecycle.churnSignals, []);

  existingSignals.push({
    signal: "subscription_canceled",
    date: new Date().toISOString(),
    severity: "critical",
  });

  const newHealth = Math.max(0, lifecycle.healthScore - 25);

  await prisma.clientLifecycle.update({
    where: { id: lifecycle.id },
    data: {
      churnSignals: JSON.stringify(existingSignals),
      churnRiskLevel: "critical",
      healthScore: newHealth,
      lastActivityAt: new Date(),
    },
  });

  // Create AIInsight for the churn event
  await prisma.aIInsight.create({
    data: {
      type: "churn_warning",
      title: `Subscription canceled for ${customer.name || customer.email}`,
      description: `Stripe subscription ${subscription.id} has been deleted. This client's retainer has ended — immediate retention outreach recommended.`,
      reasoning: "Subscription cancellation is a definitive churn signal. Win-back success rate drops sharply after 14 days.",
      priority: "critical",
      resourceType: "client_lifecycle",
      resourceId: lifecycle.id,
      actionItems: JSON.stringify([
        "Schedule exit interview within 48 hours",
        "Identify root cause (budget, satisfaction, scope)",
        "Prepare win-back offer if applicable",
        "Update pipeline forecast to reflect lost MRR",
      ]),
      status: "new",
    },
  });
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const stripeCustomerId = resolveCustomerId(session.customer);

  if (!stripeCustomerId) {
    console.error("Stripe webhook: checkout.session.completed missing customer ID, session:", session.id);
    return;
  }

  // If the checkout created a subscription, ensure we have a local record
  if (session.subscription) {
    const subscriptionId = typeof session.subscription === "string"
      ? session.subscription
      : session.subscription.id;

    const existing = await prisma.stripeSubscription.findUnique({
      where: { stripeSubscriptionId: subscriptionId },
    });

    if (!existing) {
      // The subscription.updated event will handle the full sync,
      // but we log an activity for the checkout conversion
      const customer = await prisma.stripeCustomer.findUnique({
        where: { stripeCustomerId },
      });

      if (customer?.contactId) {
        const adminUser = await prisma.user.findFirst({ where: { role: "admin" } });
        if (adminUser) {
          await prisma.activity.create({
            data: {
              type: "note",
              subject: "Checkout completed — new subscription",
              body: `Client completed Stripe checkout (session ${session.id}). Subscription ${subscriptionId} created.`,
              userId: adminUser.id,
              contactId: customer.contactId,
            },
          });
        }
      }
    }
  }

  // If the checkout was for a one-time payment, the invoice.paid event handles the rest.
  // Log the checkout completion as an activity if we can resolve the customer.
  if (session.mode === "payment") {
    const customer = await prisma.stripeCustomer.findUnique({
      where: { stripeCustomerId },
    });

    if (customer?.contactId) {
      const adminUser = await prisma.user.findFirst({ where: { role: "admin" } });
      if (adminUser) {
        const amountFormatted = session.amount_total
          ? (session.amount_total / 100).toFixed(2)
          : "N/A";
        await prisma.activity.create({
          data: {
            type: "note",
            subject: `Checkout completed: ${session.currency?.toUpperCase()} ${amountFormatted}`,
            body: `Client completed one-time payment checkout (session ${session.id}).`,
            userId: adminUser.id,
            contactId: customer.contactId,
          },
        });
      }
    }
  }
}
