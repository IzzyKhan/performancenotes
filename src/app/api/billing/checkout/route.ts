import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, ensureDb } from "@/db";
import { users } from "@/db/schema";
import { authRequired, requireUser } from "@/lib/auth-guard";
import { normalizePlan } from "@/lib/entitlements";
import {
  appOrigin,
  getStripe,
  isStripeConfigured,
  priceIdForPlan,
  type CheckoutPlan,
} from "@/lib/stripe";

export const runtime = "nodejs";

/**
 * Start a Stripe Checkout session for a paid subscription.
 * JSON body: { plan?: "solo" | "pro" } — defaults to "pro".
 */
export async function POST(request: Request) {
  await ensureDb();
  if (!isStripeConfigured()) {
    return NextResponse.json(
      { error: "Billing is not configured on this deployment." },
      { status: 503 }
    );
  }
  if (!authRequired()) {
    return NextResponse.json(
      { error: "Billing requires accounts (AUTH_SECRET) to be enabled." },
      { status: 503 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as { plan?: unknown };
  const requestedPlan: CheckoutPlan =
    body.plan === "solo" ? "solo" : "pro";
  const priceId = priceIdForPlan(requestedPlan);
  if (!priceId) {
    return NextResponse.json(
      { error: "This plan is not available on this deployment." },
      { status: 503 }
    );
  }

  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;
  const { id: userId, email } = authResult.user;

  const row = await db
    .select({ plan: users.plan, stripeCustomerId: users.stripeCustomerId })
    .from(users)
    .where(eq(users.id, userId))
    .get();
  if (!row) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const plan = normalizePlan(row.plan);
  if (plan !== "free") {
    return NextResponse.json(
      { error: "You already have an active plan. Use Manage billing instead." },
      { status: 400 }
    );
  }

  const stripe = getStripe();

  // Reuse the Stripe customer if we have one so history stays in one place.
  let customerId = row.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email,
      metadata: { userId },
    });
    customerId = customer.id;
    await db
      .update(users)
      .set({ stripeCustomerId: customerId })
      .where(eq(users.id, userId))
      .run();
  }

  const origin = appOrigin(request);
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: userId,
    metadata: { userId, plan: requestedPlan },
    subscription_data: { metadata: { userId, plan: requestedPlan } },
    allow_promotion_codes: true,
    success_url: `${origin}/?billing=success`,
    cancel_url: `${origin}/?billing=cancelled`,
  });

  if (!session.url) {
    return NextResponse.json(
      { error: "Stripe did not return a checkout URL." },
      { status: 502 }
    );
  }
  return NextResponse.json({ url: session.url });
}
