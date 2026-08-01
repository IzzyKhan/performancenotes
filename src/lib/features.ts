/**
 * Product feature flags.
 *
 * Org-first launch defaults: agent/dramaturg is OFF unless explicitly enabled.
 * Client components must use NEXT_PUBLIC_* so the value is available in the browser.
 */

/** Dramaturg chat, Distill, and cheat-sheet-first export path. */
export function isAgentEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_AGENT === "true";
}

/** Organize $15 Checkout + upgrade CTAs (Stage 4). Off until Stripe is live. */
export function isOrganizeCheckoutEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_ORGANIZE_CHECKOUT === "true";
}
