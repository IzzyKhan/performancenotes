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
