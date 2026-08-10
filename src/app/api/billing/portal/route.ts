import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, ensureDb } from "@/db";
import { users } from "@/db/schema";
import { authRequired, requireUser } from "@/lib/auth-guard";
import { appOrigin, getStripe, isStripeConfigured } from "@/lib/stripe";

export const runtime = "nodejs";

/** Open the Stripe Customer Portal (manage / cancel the Pro subscription). */
export async function POST(request: Request) {
  await ensureDb();
  if (!isStripeConfigured() || !authRequired()) {
    return NextResponse.json(
      { error: "Billing is not configured on this deployment." },
      { status: 503 }
    );
  }

  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const row = await db
    .select({ stripeCustomerId: users.stripeCustomerId })
    .from(users)
    .where(eq(users.id, authResult.user.id))
    .get();
  if (!row?.stripeCustomerId) {
    return NextResponse.json(
      { error: "No billing history for this account yet." },
      { status: 400 }
    );
  }

  const session = await getStripe().billingPortal.sessions.create({
    customer: row.stripeCustomerId,
    return_url: `${appOrigin(request)}/`,
  });

  return NextResponse.json({ url: session.url });
}
