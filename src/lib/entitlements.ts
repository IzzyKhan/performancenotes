/**
 * Billing plan entitlements — single source of truth for launch tiers.
 *
 * Stage 0: types + launch matrix locked.
 * Stage 2: enforce limits in API + UI.
 * Stage 7: grant `dramaturg` via Stripe when Agent ships.
 */

/** Canonical plan slug after normalization. */
export type PlanSlug = "free" | "organize" | "dramaturg";

/** Raw value persisted on users.plan (null = free). */
export type StoredPlan = PlanSlug | "prep" | null;

export type PlanEntitlements = {
  label: string;
  maxProjects: number | null;
  maxScriptsPerProject: number | null;
  agentEnabled: boolean;
  storesFullScript: boolean;
  agentMonthlyActions: number;
};

/** Launch matrix — Free + Organize only at Gates 0–6. */
export const PLAN_ENTITLEMENTS: Record<PlanSlug, PlanEntitlements> = {
  free: {
    label: "Free",
    maxProjects: 1,
    maxScriptsPerProject: 1,
    agentEnabled: false,
    storesFullScript: false,
    agentMonthlyActions: 0,
  },
  organize: {
    label: "Organize",
    maxProjects: null,
    maxScriptsPerProject: null,
    agentEnabled: false,
    storesFullScript: false,
    agentMonthlyActions: 0,
  },
  dramaturg: {
    label: "Agent",
    maxProjects: null,
    maxScriptsPerProject: null,
    agentEnabled: true,
    storesFullScript: false,
    agentMonthlyActions: 180,
  },
};

/** Normalize DB / legacy values to a canonical plan slug. */
export function normalizePlan(raw: string | null | undefined): PlanSlug {
  if (raw === "organize" || raw === "prep") return "organize";
  if (raw === "dramaturg") return "dramaturg";
  if (raw === "free") return "free";
  return "free";
}

export function entitlementsForPlan(raw: string | null | undefined): PlanEntitlements {
  return PLAN_ENTITLEMENTS[normalizePlan(raw)];
}

/** Plans that can be purchased at initial launch (Stage 4). */
export const LAUNCH_CHECKOUT_PLANS: PlanSlug[] = ["organize"];

/** Agent tier — reserved for post-launch Stage 7; never sold at Gate 6. */
export const AGENT_PLAN: PlanSlug = "dramaturg";
