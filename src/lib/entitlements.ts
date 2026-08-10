/**
 * Billing plan entitlements — single source of truth for launch tiers.
 *
 * Launch model (short-film-first):
 * - Free   — one project, one script, first 15 scenes unlocked (demo for
 *            longer-form directors; covers most true shorts).
 * - Solo   — one project, one script, unlimited scenes (feature directors).
 * - Pro    — unlimited projects and scripts (series blocks, multiple films).
 * - Agent  — reserved for Stage 7, never sold at launch.
 */

/** Canonical plan slug after normalization. */
export type PlanSlug = "free" | "solo" | "pro" | "dramaturg";

/** Raw value persisted on users.plan (null = free). Legacy slugs normalized on read. */
export type StoredPlan = PlanSlug | "organize" | "prep" | null;

export type PlanEntitlements = {
  label: string;
  maxProjects: number | null;
  maxScriptsPerProject: number | null;
  /**
   * Project-wide scene cap. Scenes beyond the cap are still created on
   * import (headings are not sensitive) but are locked in the UI, and
   * manual scene adds are rejected once the cap is reached.
   */
  maxScenesPerProject: number | null;
  agentEnabled: boolean;
  storesFullScript: boolean;
  agentMonthlyActions: number;
};

/** Free-tier scene cap — sized to cover most short films (~10–15 pages). */
export const FREE_SCENE_CAP = 15;

export const PLAN_ENTITLEMENTS: Record<PlanSlug, PlanEntitlements> = {
  free: {
    label: "Free",
    maxProjects: 1,
    maxScriptsPerProject: 1,
    maxScenesPerProject: FREE_SCENE_CAP,
    agentEnabled: false,
    storesFullScript: false,
    agentMonthlyActions: 0,
  },
  solo: {
    label: "Solo",
    maxProjects: 1,
    maxScriptsPerProject: 1,
    maxScenesPerProject: null,
    agentEnabled: false,
    storesFullScript: false,
    agentMonthlyActions: 0,
  },
  pro: {
    label: "Pro",
    maxProjects: null,
    maxScriptsPerProject: null,
    maxScenesPerProject: null,
    agentEnabled: false,
    storesFullScript: false,
    agentMonthlyActions: 0,
  },
  dramaturg: {
    label: "Agent",
    maxProjects: null,
    maxScriptsPerProject: null,
    maxScenesPerProject: null,
    agentEnabled: true,
    storesFullScript: false,
    agentMonthlyActions: 180,
  },
};

/** Normalize DB / legacy values to a canonical plan slug. */
export function normalizePlan(raw: string | null | undefined): PlanSlug {
  if (raw === "pro" || raw === "organize" || raw === "prep") return "pro";
  if (raw === "solo") return "solo";
  if (raw === "dramaturg") return "dramaturg";
  return "free";
}

export function entitlementsForPlan(raw: string | null | undefined): PlanEntitlements {
  return PLAN_ENTITLEMENTS[normalizePlan(raw)];
}

/** Plans that can be purchased at initial launch (Stage 4). */
export const LAUNCH_CHECKOUT_PLANS: PlanSlug[] = ["solo", "pro"];

/** Agent tier — reserved for post-launch Stage 7; never sold at Gate 6. */
export const AGENT_PLAN: PlanSlug = "dramaturg";
