"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { Clapperboard, CreditCard, LogOut, Plus, Sparkles, Trash2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme-toggle";
import { EditProjectDialog } from "@/components/project/edit-project-dialog";
import { LandingPage } from "@/components/marketing/landing-page";
import { usePlan, projectLimitMessage, showBillingUpgradeUI } from "@/lib/use-plan";
import { openBillingPortal, startProCheckout } from "@/lib/billing-client";
import type { Project } from "@/types";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function HomePage() {
  const { data: session, status } = useSession();
  const plan = usePlan();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  // "checking" until the projects fetch tells us whether the visitor is
  // signed in (401 → marketing landing page, anything else → dashboard).
  const [view, setView] = useState<"checking" | "landing" | "app">("checking");

  const atProjectLimit =
    plan !== null &&
    plan.maxProjects !== null &&
    projects.length >= plan.maxProjects;

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/projects");
      if (res.status === 401) {
        setView("landing");
        return;
      }
      setView("app");
      if (!res.ok) {
        toast.error("Could not load projects");
        return;
      }
      const data = await res.json().catch(() => null);
      setProjects(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  // Toast after returning from Stripe Checkout (?billing=success|cancelled).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const billing = params.get("billing");
    if (!billing) return;
    if (billing === "success") {
      toast.success(
        "Welcome aboard! Your plan updates in a few seconds."
      );
    } else if (billing === "cancelled") {
      toast.info("Checkout cancelled — you're still on the Free plan.");
    }
    window.history.replaceState(null, "", "/");
  }, []);

  async function remove(id: string) {
    if (!confirm("Delete this project?")) return;
    await fetch(`/api/projects?id=${id}`, { method: "DELETE" });
    toast.success("Project deleted");
    void load();
  }

  function handleProjectSaved(updated: Project) {
    setProjects((prev) =>
      prev.map((p) => (p.id === updated.id ? updated : p))
    );
  }

  if (view === "landing") {
    return <LandingPage />;
  }

  // Blank shell while we resolve auth so strangers never see dashboard chrome.
  if (view === "checking") {
    return <div className="min-h-dvh bg-background" />;
  }

  return (
    <div className="min-h-dvh bg-background">
      <div className="mx-auto max-w-3xl px-6 py-14">
        <div className="mb-12 flex items-start justify-between gap-4">
          <div>
            <div className="mb-4 flex items-center gap-2 text-muted-foreground">
              <Clapperboard className="size-4 stroke-[1.5]" />
              <span className="text-xs font-normal tracking-wide">
                Performance Notes
              </span>
            </div>
            <h1 className="text-[28px] font-medium tracking-tight text-foreground">
              Organize inspiration for set
            </h1>
            <p className="mt-2 max-w-md text-sm font-normal leading-relaxed text-muted-foreground">
              Upload a script, pin references to each scene, schedule shoot
              days, and export packs ordered for the day.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <ThemeToggle />
            {showBillingUpgradeUI() &&
            status === "authenticated" &&
            plan?.plan === "free" ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => void startProCheckout()}
              >
                <Sparkles className="size-3.5 stroke-[1.5]" />
                <span className="hidden sm:inline">Upgrade to Pro — $15/mo</span>
                <span className="sm:hidden">Upgrade</span>
              </Button>
            ) : null}
            {showBillingUpgradeUI() &&
            status === "authenticated" &&
            (plan?.plan === "solo" || plan?.plan === "pro") ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1.5 text-muted-foreground"
                onClick={() => void openBillingPortal()}
              >
                <CreditCard className="size-3.5 stroke-[1.5]" />
                <span className="hidden sm:inline">Manage billing</span>
              </Button>
            ) : null}
            {status === "authenticated" ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1.5 text-muted-foreground"
                onClick={() => {
                  void signOut({ redirect: false }).then(() => {
                    // Avoid Auth.js absolute redirect (Railway host can be 0.0.0.0).
                    window.location.assign("/login");
                  });
                }}
                title={session?.user?.email ?? "Sign out"}
              >
                <LogOut className="size-3.5" />
                <span className="hidden sm:inline">Sign out</span>
              </Button>
            ) : status === "unauthenticated" ? (
              <Link
                href="/login"
                className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
              >
                Sign in
              </Link>
            ) : null}
            {atProjectLimit ? (
              showBillingUpgradeUI() ? (
                <Button
                  type="button"
                  className="gap-1.5 opacity-50"
                  title={projectLimitMessage()}
                  onClick={() => {
                    toast.info(projectLimitMessage());
                    void startProCheckout();
                  }}
                >
                  <Plus className="size-3.5 stroke-[1.5]" />
                  New project
                </Button>
              ) : (
                <Button
                  type="button"
                  className="gap-1.5 opacity-50"
                  title={projectLimitMessage()}
                  onClick={() => toast.info(projectLimitMessage())}
                >
                  <Plus className="size-3.5 stroke-[1.5]" />
                  New project
                </Button>
              )
            ) : (
              <Link
                href="/projects/new"
                className={cn(buttonVariants(), "gap-1.5")}
              >
                <Plus className="size-3.5 stroke-[1.5]" />
                New project
              </Link>
            )}
          </div>
        </div>

        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-normal text-muted-foreground">Projects</p>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading projects…</p>
        ) : projects.length === 0 ? (
          <Card className="border-dashed bg-transparent">
            <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
              <p className="max-w-sm text-sm text-muted-foreground">
                No projects yet. Create one to get started.
              </p>
              <Link href="/projects/new" className={buttonVariants()}>
                Create your first project
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {projects.map((p) => (
              <Card
                key={p.id}
                className="group bg-transparent transition-colors hover:bg-accent/40"
              >
                <CardHeader className="flex flex-row items-center justify-between space-y-0 py-3.5">
                  <div className="min-w-0">
                    <CardTitle className="truncate text-sm font-medium">
                      <Link
                        href={`/projects/${p.id}`}
                        className="hover:text-foreground"
                      >
                        {p.title}
                      </Link>
                    </CardTitle>
                    <p
                      className="mt-0.5 text-xs text-muted-foreground"
                      suppressHydrationWarning
                    >
                      {new Date(p.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <EditProjectDialog
                      project={p}
                      onSaved={handleProjectSaved}
                    />
                    <Link
                      href={`/projects/${p.id}`}
                      className={buttonVariants({
                        size: "sm",
                        variant: "outline",
                      })}
                    >
                      Open
                    </Link>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive"
                      onClick={() => remove(p.id)}
                    >
                      <Trash2 className="size-3.5 stroke-[1.5]" />
                    </Button>
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
