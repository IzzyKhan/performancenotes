import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { db, ensureDb } from "@/db";
import { users } from "@/db/schema";
import { setUserPlan } from "@/lib/quotas";
import {
  getStripe,
  isStripeConfigured,
  planForPriceId,
  type CheckoutPlan,
} from "@/lib/stripe";

export const runtime = "nodejs";

/**
 * Stripe webhook (Stage 4). Point Stripe to POST /api/billing/webhook with:
 * checkout.session.completed, customer.subscription.updated,
 * customer.subscription.deleted.
 *
 * Grants only the launch checkout plans (Solo, Pro). The Agent tier
 * is never granted here until Stage 7.
 */
export async function POST(request: Request) {
  await ensureDb();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!isStripeConfigured() || !webhookSecret) {
    return NextResponse.json(
      { error: "Billing webhook is not configured.", received: false },
      { status: 503 }
    );
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe-signature header", received: false },
      { status: 400 }
    );
  }

  const payload = await request.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(
      payload,
      signature,
      webhookSecret
    );
  } catch (err) {
    console.warn(
      `[billing/webhook] Signature verification failed: ${err instanceof Error ? err.message : err}`
    );
    return NextResponse.json(
      { error: "Invalid signature", received: false },
      { status: 400 }
    );
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      if (session.mode !== "subscription") break;
      const userId =
        session.metadata?.userId || session.client_reference_id || null;
      const customerId =
        typeof session.customer === "string"
          ? session.customer
          : (session.customer?.id ?? undefined);
      if (userId) {
        const plan = checkoutPlanFromMetadata(session.metadata) ?? "pro";
        await setUserPlan(userId, plan, customerId);
        console.info(`[billing/webhook] ${userId} → ${plan} (checkout)`);
      } else {
        console.warn(
          `[billing/webhook] checkout.session.completed without userId (${session.id})`
        );
      }
      break;
    }

    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object;
      const userId = await findUserIdForSubscription(sub);
      if (!userId) {
        console.warn(
          `[billing/webhook] No user for subscription ${sub.id} (customer ${sub.customer})`
        );
        break;
      }
      const active =
        event.type !== "customer.subscription.deleted" &&
        (sub.status === "active" ||
          sub.status === "trialing" ||
          sub.status === "past_due");
      const paidPlan = planForSubscription(sub);
      await setUserPlan(userId, active ? paidPlan : "free");
      console.info(
        `[billing/webhook] ${userId} → ${active ? paidPlan : "free"} (subscription ${sub.status})`
      );
      break;
    }

    default:
      break;
  }

  return NextResponse.json({ received: true });
}

function checkoutPlanFromMetadata(
  metadata: Stripe.Metadata | null | undefined
): CheckoutPlan | null {
  const plan = metadata?.plan;
  if (plan === "solo") return "solo";
  if (plan === "pro" || plan === "organize") return "pro";
  return null;
}

/** Which paid plan does this subscription grant? Metadata first, then price ID. */
function planForSubscription(sub: Stripe.Subscription): CheckoutPlan {
  const fromMetadata = checkoutPlanFromMetadata(sub.metadata);
  if (fromMetadata) return fromMetadata;
  const priceId = sub.items?.data?.[0]?.price?.id;
  return (priceId && planForPriceId(priceId)) || "pro";
}

async function findUserIdForSubscription(
  sub: Stripe.Subscription
): Promise<string | null> {
  if (sub.metadata?.userId) return sub.metadata.userId;
  const customerId =
    typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
  if (!customerId) return null;
  const row = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.stripeCustomerId, customerId))
    .get();
  return row?.id ?? null;
}
