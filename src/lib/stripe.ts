/**
 * Stripe server helpers (Stage 4 — Solo + Pro subscriptions).
 *
 * Env:
 * - STRIPE_SECRET_KEY      sk_live_… / sk_test_…
 * - STRIPE_WEBHOOK_SECRET  whsec_… (webhook signature verification)
 * - STRIPE_PRICE_SOLO      price_… for the Solo subscription
 * - STRIPE_PRICE_PRO       price_… for the Pro $15/mo subscription
 * - AUTH_URL               public app origin, used for redirect URLs
 *
 * STRIPE_PRICE_ORGANIZE is accepted as a legacy alias for STRIPE_PRICE_PRO.
 */

import Stripe from "stripe";

/** Paid plans purchasable via Checkout. */
export type CheckoutPlan = "solo" | "pro";

let client: Stripe | null = null;

function proPriceEnv(): string | undefined {
  return process.env.STRIPE_PRICE_PRO || process.env.STRIPE_PRICE_ORGANIZE;
}

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && proPriceEnv());
}

export function getStripe(): Stripe {
  if (!client) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
    client = new Stripe(key);
  }
  return client;
}

export function priceIdForPlan(plan: CheckoutPlan): string | null {
  const price =
    plan === "solo" ? process.env.STRIPE_PRICE_SOLO : proPriceEnv();
  return price || null;
}

/** Reverse lookup for webhook events: which plan does this Stripe price grant? */
export function planForPriceId(priceId: string): CheckoutPlan | null {
  if (priceId && priceId === process.env.STRIPE_PRICE_SOLO) return "solo";
  const proPrice = proPriceEnv();
  if (priceId && proPrice && priceId === proPrice) return "pro";
  return null;
}

/** Public app origin for Checkout/Portal redirects. */
export function appOrigin(request: Request): string {
  const envUrl = process.env.AUTH_URL || process.env.APP_URL;
  if (envUrl) return envUrl.replace(/\/$/, "");
  return new URL(request.url).origin;
}
