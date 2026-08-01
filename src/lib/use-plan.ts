"use client";

import { useEffect, useState } from "react";

export type PlanInfo = {
  email: string;
  plan: "free" | "organize" | "dramaturg";
  planLabel: string;
  /** null = unlimited */
  maxProjects: number | null;
  /** null = unlimited */
  maxScriptsPerProject: number | null;
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
  "The Free plan includes 1 project. Upgrade to Organize for unlimited projects.";

export const UPGRADE_SCRIPT_LIMIT_MESSAGE =
  "The Free plan includes 1 script per project. Upgrade to Organize for episodic prep with unlimited episodes.";
