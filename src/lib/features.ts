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

/** Paid-tier (Solo/Pro) Checkout + upgrade CTAs (Stage 4). Off until Stripe is live. */
export function isBillingCheckoutEnabled(): boolean {
  return (
    process.env.NEXT_PUBLIC_ENABLE_BILLING_CHECKOUT === "true" ||
    process.env.NEXT_PUBLIC_ENABLE_ORGANIZE_CHECKOUT === "true"
  );
}

/**
 * Recruiter / portfolio demo: no sign-in. Anyone with the URL sees every
 * project on this database and can click around (including edits).
 * Set NEXT_PUBLIC_OPEN_ACCESS=true and redeploy. Turn off after.
 */
export function isOpenAccess(): boolean {
  return process.env.NEXT_PUBLIC_OPEN_ACCESS === "true";
}
