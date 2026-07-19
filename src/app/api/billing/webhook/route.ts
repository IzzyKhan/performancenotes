import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Stripe webhook (Phase 4 scaffold).
 *
 * To enable:
 * 1. npm install stripe
 * 2. Set STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET
 * 3. Point Stripe to POST /api/billing/webhook
 * 4. Implement event handlers using setUserPlan() from @/lib/quotas
 *    (see docs/ROADMAP.md Phase 4)
 */
export async function POST() {
  return NextResponse.json(
    {
      error:
        "Billing webhook scaffold only. Install stripe and wire STRIPE_* env vars — see docs/ROADMAP.md Phase 4.",
      received: false,
    },
    { status: 503 }
  );
}
