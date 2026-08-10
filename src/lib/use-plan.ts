"use client";

import { useEffect, useState } from "react";
import { isBillingCheckoutEnabled } from "@/lib/features";

export type PlanInfo = {
  email: string;
  plan: "free" | "solo" | "pro" | "dramaturg";
  planLabel: string;
  /** null = unlimited */
  maxProjects: number | null;
  /** null = unlimited */
  maxScriptsPerProject: number | null;
  /** null = unlimited */
  maxScenesPerProject: number | null;
};

/**
 * Current user's plan limits for client-side gating.
 * Returns null while loading — treat as "not gated" to avoid flicker;
 * the API enforces limits regardless.
 */
export function usePlan(): PlanInfo | null {
  const [plan, setPlan] = useState<PlanInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data && typeof data.plan === "string") {
          setPlan(data as PlanInfo);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return plan;
}

export const UPGRADE_PROJECT_LIMIT_MESSAGE =
  "Your plan includes 1 project. Upgrade to Pro for unlimited projects.";

export const UPGRADE_SCRIPT_LIMIT_MESSAGE =
  "Your plan includes 1 script per project. Upgrade to Pro for episodic prep with unlimited episodes.";

export const UPGRADE_SCENE_LIMIT_MESSAGE =
  "The Free plan unlocks the first 15 scenes. Upgrade to Solo for unlimited scenes.";

export const LAUNCHING_SOON_PROJECT_LIMIT_MESSAGE =
  "Your plan includes 1 project. Pro is launching soon — unlimited projects and series blocks.";

export const LAUNCHING_SOON_SCRIPT_LIMIT_MESSAGE =
  "Your plan includes 1 script per project. Pro is launching soon — unlimited episodes per project.";

export const LAUNCHING_SOON_SCENE_LIMIT_MESSAGE =
  "The Free plan unlocks the first 15 scenes. Solo is launching soon — unlimited scenes for one film.";

/** When false, hide live checkout CTAs; show launching-soon copy at limits instead. */
export function showBillingUpgradeUI(): boolean {
  return isBillingCheckoutEnabled();
}

export function projectLimitMessage(): string {
  return showBillingUpgradeUI()
    ? UPGRADE_PROJECT_LIMIT_MESSAGE
    : LAUNCHING_SOON_PROJECT_LIMIT_MESSAGE;
}

export function scriptLimitMessage(): string {
  return showBillingUpgradeUI()
    ? UPGRADE_SCRIPT_LIMIT_MESSAGE
    : LAUNCHING_SOON_SCRIPT_LIMIT_MESSAGE;
}

export function sceneLimitMessage(): string {
  return showBillingUpgradeUI()
    ? UPGRADE_SCENE_LIMIT_MESSAGE
    : LAUNCHING_SOON_SCENE_LIMIT_MESSAGE;
}

export function sceneCapDividerMessage(cap: number): string {
  if (showBillingUpgradeUI()) {
    return `Free plan — first ${cap} scenes unlocked. Upgrade to Solo to prep the rest.`;
  }
  return `Free plan — first ${cap} scenes unlocked. Solo launching soon.`;
}
