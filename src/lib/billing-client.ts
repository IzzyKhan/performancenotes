"use client";

import { toast } from "sonner";

async function redirectToBillingUrl(
  endpoint: string,
  failLabel: string,
  body?: object
) {
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      ...(body
        ? {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        : {}),
    });
    const data = (await res.json().catch(() => ({}))) as {
      url?: string;
      error?: string;
    };
    if (!res.ok || !data.url) {
      throw new Error(data.error || failLabel);
    }
    window.location.assign(data.url);
  } catch (e) {
    toast.error(e instanceof Error ? e.message : failLabel);
  }
}

/** Send the user to Stripe Checkout for a paid plan. */
export function startCheckout(plan: "solo" | "pro") {
  return redirectToBillingUrl("/api/billing/checkout", "Could not start checkout", {
    plan,
  });
}

/** Send the user to Stripe Checkout for the Pro $15/mo subscription. */
export function startProCheckout() {
  return startCheckout("pro");
}

/** Send the user to the Stripe Customer Portal (manage / cancel). */
export function openBillingPortal() {
  return redirectToBillingUrl(
    "/api/billing/portal",
    "Could not open billing portal"
  );
}
