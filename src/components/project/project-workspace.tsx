"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Sparkles,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button, buttonVariants } from "@/components/ui/button";
import { InstinctCanvas } from "@/components/canvas/instinct-canvas";
import { AgentChat, type AgentChatHandle } from "@/components/chat/agent-chat";
import { CheatSheetPanel } from "@/components/cheatsheet/cheat-sheet-panel";
import { ScenePanel } from "@/components/scene/scene-panel";
import { ShootScheduleDialog } from "@/components/schedule/shoot-schedule-dialog";
import { ExportMenu } from "@/components/project/export-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import type { CheatSheet, ProjectBundle, Scene, Script } from "@/types";
import { cn } from "@/lib/utils";
import { isAgentEnabled } from "@/lib/features";
import { sceneSlugLabel } from "@/lib/schedule";

const LEFT_PANEL_MIN = 280;
const RIGHT_PANEL_MIN = 320;
const PANEL_MAX_RATIO = 0.5;
const AGENT_ENABLED = isAgentEnabled();

export function ProjectWorkspace({ bundle }: { bundle: ProjectBundle }) {
  const [scripts, setScripts] = useState<Script[]>(bundle.scripts);
  const [scenes, setScenes] = useState<Scene[]>(bundle.scenes);
  const [activeScriptId, setActiveScriptId] = useState<string | null>(
    bundle.scripts[0]?.id ?? bundle.scenes[0]?.scriptId ?? null
  );
  const [activeSceneId, setActiveSceneId] = useState<string | null>(
    bundle.scenes[0]?.id ?? null
  );
  const [cheatSheets, setCheatSheets] = useState<CheatSheet[]>(
    bundle.cheatSheets
  );
  const [rightTab, setRightTab] = useState<"agent" | "sheet">(
    AGENT_ENABLED
      ? bundle.cheatSheets.length > 0
        ? "sheet"
        : "agent"
      : "sheet"
  );
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(AGENT_ENABLED);
  const [leftWidth, setLeftWidth] = useState(320);
  const [rightWidth, setRightWidth] = useState(380);
  const [layoutWidth, setLayoutWidth] = useState(0);
  const layoutRef = useRef<HTMLDivElement>(null);
  const agentChatRef = useRef<AgentChatHandle>(null);
  const [agentStreaming, setAgentStreaming] = useState(false);

  // Re-sync scripts/scenes (incl. shoot schedule) from the API on mount and
  // whenever the tab becomes visible again, so App Router / browser cache
  // can't show a stale empty schedule after navigating home and back.
  useEffect(() => {
    let cancelled = false;

    async function syncFromApi() {
      try {
        const res = await fetch(
          `/api/projects/${bundle.project.id}?_=${Date.now()}`,
          { cache: "no-store" }
        );
        if (!res.ok) return;
        const data = (await res.json()) as ProjectBundle;
        if (cancelled) return;
        if (Array.isArray(data.scripts)) setScripts(data.scripts);
        if (Array.isArray(data.scenes)) setScenes(data.scenes);
        if (Array.isArray(data.cheatSheets)) setCheatSheets(data.cheatSheets);
      } catch {
        // Keep current state if refresh fails
      }
    }

    void syncFromApi();

    const onVisibility = () => {
      if (document.visibilityState === "visible") void syncFromApi();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [bundle.project.id]);

  const activeScene = scenes.find((s) => s.id === activeSceneId) ?? null;
  const scriptsById = useMemo(
    () => new Map(scripts.map((s) => [s.id, s])),
    [scripts]
  );

  // Sheet for the active scene, falling back to a legacy project-wide sheet
  const activeCheatSheet = useMemo(() => {
    if (activeSceneId) {
      const perScene = cheatSheets.find((cs) => cs.sceneId === activeSceneId);
      if (perScene) return perScene;
    }
    return cheatSheets.find((cs) => cs.sceneId === null) ?? null;
  }, [cheatSheets, activeSceneId]);

  function upsertCheatSheet(sheet: CheatSheet) {
    setCheatSheets((prev) => {
      const idx = prev.findIndex((cs) => cs.id === sheet.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = sheet;
        return next;
      }
      return [...prev, sheet];
    });
  }

  function handleScenesChange(next: Scene[]) {
    setScenes(next);
    const validIds = new Set(next.map((s) => s.id));
    setCheatSheets((prev) =>
      prev.filter((cs) => cs.sceneId === null || validIds.has(cs.sceneId))
    );
    if (!activeSceneId || !validIds.has(activeSceneId)) {
      const inScript = activeScriptId
        ? next.filter((s) => s.scriptId === activeScriptId)
        : next;
      setActiveSceneId(inScript[0]?.id ?? next[0]?.id ?? null);
      if (inScript[0]) setActiveScriptId(inScript[0].scriptId);
    }
    // Avoid router.refresh() here — a stale RSC payload can remount this
    // workspace without shootDay/shootOrder and look like the schedule vanished.
  }

  function handleActiveScriptChange(scriptId: string) {
    setActiveScriptId(scriptId);
    const first = scenes
      .filter((s) => s.scriptId === scriptId)
      .sort((a, b) => a.orderIndex - b.orderIndex)[0];
    if (first) setActiveSceneId(first.id);
  }

  function handleActiveSceneChange(sceneId: string) {
    setActiveSceneId(sceneId);
    const scene = scenes.find((s) => s.id === sceneId);
    if (scene) setActiveScriptId(scene.scriptId);
  }

  const maxPanelWidth = useCallback(
    (side: "left" | "right", containerWidth = layoutWidth) => {
      const min = side === "left" ? LEFT_PANEL_MIN : RIGHT_PANEL_MIN;
      return containerWidth
        ? Math.max(min, Math.floor(containerWidth * PANEL_MAX_RATIO))
        : min;
    },
    [layoutWidth]
  );

  const clampPanelWidth = useCallback(
    (width: number, side: "left" | "right", containerWidth = layoutWidth) => {
      const min = side === "left" ? LEFT_PANEL_MIN : RIGHT_PANEL_MIN;
      return Math.min(
        Math.max(width, min),
        maxPanelWidth(side, containerWidth)
      );
    },
    [layoutWidth, maxPanelWidth]
  );

  const togglePanelWidth = useCallback(
    (side: "left" | "right") => {
      const min = side === "left" ? LEFT_PANEL_MIN : RIGHT_PANEL_MIN;
      const max = maxPanelWidth(side);
      if (side === "left") {
        setLeftWidth((current) => (current >= max - 1 ? min : max));
      } else {
        setRightWidth((current) => (current >= max - 1 ? min : max));
      }
    },
    [maxPanelWidth]
  );

  const startResize = useCallback(
    (side: "left" | "right") => (event: React.PointerEvent<HTMLDivElement>) => {
      if (!layoutRef.current) return;
      // Don't start a drag when clicking the expand control
      if ((event.target as HTMLElement).closest("[data-expand-panel]")) return;

      const container = layoutRef.current.getBoundingClientRect();

      event.preventDefault();
      const onMove = (moveEvent: PointerEvent) => {
        if (side === "left") {
          const next = moveEvent.clientX - container.left;
          setLeftWidth(clampPanelWidth(next, "left", container.width));
        } else {
          const next = container.right - moveEvent.clientX;
          setRightWidth(clampPanelWidth(next, "right", container.width));
        }
      };

      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [clampPanelWidth]
  );

  useEffect(() => {
    const el = layoutRef.current;
    if (!el) return;

    const sync = () => {
      const width = el.clientWidth;
      setLayoutWidth(width);
      const leftMax = Math.max(
        LEFT_PANEL_MIN,
        Math.floor(width * PANEL_MAX_RATIO)
      );
      const rightMax = Math.max(
        RIGHT_PANEL_MIN,
        Math.floor(width * PANEL_MAX_RATIO)
      );
      setLeftWidth((current) =>
        Math.min(Math.max(current, LEFT_PANEL_MIN), leftMax)
      );
      setRightWidth((current) =>
        Math.min(Math.max(current, RIGHT_PANEL_MIN), rightMax)
      );
    };

    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const leftAtMax =
    layoutWidth > 0 && leftWidth >= maxPanelWidth("left") - 1;
  const rightAtMax =
    layoutWidth > 0 && rightWidth >= maxPanelWidth("right") - 1;

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <header className="relative flex h-12 shrink-0 items-center gap-3 border-b border-border px-3 print:hidden">
        <Link
          href="/"
          className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div className="flex min-w-0 items-center gap-2">
          <Clapperboard className="size-4 shrink-0 stroke-[1.5] text-muted-foreground" />
          <h1 className="truncate text-sm font-medium tracking-tight">
            {bundle.project.title}
          </h1>
        </div>
        <div className="pointer-events-none absolute inset-y-0 left-1/2 flex -translate-x-1/2 items-center">
          <div className="pointer-events-auto">
            <ThemeToggle className="text-muted-foreground" />
          </div>
        </div>
        <div className="ml-auto flex items-center gap-1">
          {scenes.length > 0 ? (
            <ShootScheduleDialog
              projectId={bundle.project.id}
              scripts={scripts}
              scenes={scenes}
              onScenesChange={handleScenesChange}
            />
          ) : null}
          {scenes.length > 0 ? (
            <ExportMenu
              projectId={bundle.project.id}
              scripts={scripts}
              scenes={scenes}
              sceneId={activeSceneId}
              variant="ghost"
            />
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1.5 text-xs text-muted-foreground"
            onClick={() => setLeftOpen((v) => !v)}
            title={leftOpen ? "Hide scene panel" : "Show scene panel"}
          >
            {leftOpen ? (
              <PanelLeftClose className="size-4" />
            ) : (
              <PanelLeftOpen className="size-4" />
            )}
            <span className="hidden sm:inline">Scene</span>
          </Button>
          {AGENT_ENABLED ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-1.5 text-xs text-muted-foreground"
              onClick={() => setRightOpen((v) => !v)}
              title={rightOpen ? "Hide agent panel" : "Show agent panel"}
            >
              <span className="hidden sm:inline">Agent</span>
              {rightOpen ? (
                <PanelRightClose className="size-4" />
              ) : (
                <PanelRightOpen className="size-4" />
              )}
            </Button>
          ) : null}
        </div>
      </header>

      <div
        ref={layoutRef}
        className="flex min-h-0 flex-1 flex-col overflow-hidden print:block md:flex-row"
      >
        {/* Scene pane */}
        {leftOpen ? (
          <aside
            className="min-h-[28vh] overflow-hidden border-b border-border md:h-full md:min-h-0 md:shrink-0 md:border-b-0 md:border-r print:hidden"
            style={{ width: `${leftWidth}px` }}
          >
            <ScenePanel
              projectId={bundle.project.id}
              scripts={scripts}
              scenes={scenes}
              activeScriptId={activeScriptId}
              activeSceneId={activeSceneId}
              onScriptsChange={setScripts}
              onScenesChange={handleScenesChange}
              onActiveScriptChange={handleActiveScriptChange}
              onActiveSceneChange={handleActiveSceneChange}
            />
          </aside>
        ) : null}
        {leftOpen ? (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize scene panel"
            className="group relative z-20 hidden w-3 shrink-0 -mx-1.5 cursor-col-resize touch-none md:block print:hidden"
            onPointerDown={startResize("left")}
          >
            <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border transition-colors group-hover:bg-foreground/40 group-active:bg-foreground/50" />
            <button
              type="button"
              data-expand-panel
              title={
                leftAtMax ? "Collapse scene panel" : "Expand scene panel"
              }
              aria-label={
                leftAtMax
                  ? "Collapse scene panel to minimum width"
                  : "Expand scene panel to maximum width"
              }
              className="absolute top-1/2 left-1/2 z-10 flex size-10 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-border bg-background text-muted-foreground opacity-0 shadow-sm transition-all hover:border-foreground/25 hover:bg-accent hover:text-foreground group-hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                togglePanelWidth("left");
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              {leftAtMax ? (
                <ChevronLeft className="size-5" />
              ) : (
                <ChevronRight className="size-5" />
              )}
            </button>
          </div>
        ) : null}

        {/* Canvas pane — keyed by scene so each scene gets its own canvas */}
        <main className="relative min-h-[42vh] min-w-0 flex-1 overflow-hidden md:min-h-0 print:hidden">
          <InstinctCanvas
            key={activeSceneId ?? "project"}
            projectId={bundle.project.id}
            sceneId={activeSceneId}
            sceneHeading={
              activeScene
                ? sceneSlugLabel(
                    activeScene,
                    scriptsById.get(activeScene.scriptId),
                    scripts.length > 1
                  )
                : null
            }
            initialNodes={bundle.canvasNodes.filter(
              (n) => n.sceneId === null || n.sceneId === activeSceneId
            )}
          />
        </main>
        {AGENT_ENABLED && rightOpen ? (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize agent panel"
            className="group relative z-20 hidden w-3 shrink-0 -mx-1.5 cursor-col-resize touch-none md:block print:hidden"
            onPointerDown={startResize("right")}
          >
            <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border transition-colors group-hover:bg-foreground/40 group-active:bg-foreground/50" />
            <button
              type="button"
              data-expand-panel
              title={
                rightAtMax ? "Collapse agent panel" : "Expand agent panel"
              }
              aria-label={
                rightAtMax
                  ? "Collapse agent panel to minimum width"
                  : "Expand agent panel to maximum width"
              }
              className="absolute top-1/2 left-1/2 z-10 flex size-10 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-border bg-background text-muted-foreground opacity-0 shadow-sm transition-all hover:border-foreground/25 hover:bg-accent hover:text-foreground group-hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                togglePanelWidth("right");
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              {rightAtMax ? (
                <ChevronRight className="size-5" />
              ) : (
                <ChevronLeft className="size-5" />
              )}
            </button>
          </div>
        ) : null}

        {/* Agent / Cheat sheet pane — only when dramaturg feature is on */}
        {AGENT_ENABLED && rightOpen ? (
          <aside
            className={cn(
              "min-h-[36vh] overflow-hidden border-t border-border print:border-0 md:h-full md:min-h-0 md:shrink-0 md:border-t-0"
            )}
            style={{ width: `${rightWidth}px` }}
          >
            <Tabs
              value={rightTab}
              onValueChange={(v) => setRightTab(v as "agent" | "sheet")}
              className="flex h-full min-h-0 flex-col gap-0 overflow-hidden"
            >
              <div className="mx-3 mt-2 flex shrink-0 items-center justify-between gap-2 print:hidden">
                <TabsList className="w-auto shrink-0">
                  <TabsTrigger value="agent">Agent</TabsTrigger>
                  <TabsTrigger value="sheet">Cheat sheet</TabsTrigger>
                </TabsList>
                {rightTab === "agent" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="shrink-0 gap-1.5"
                    disabled={agentStreaming}
                    onClick={() => agentChatRef.current?.distill()}
                  >
                    <Sparkles className="size-3.5" />
                    <span className="hidden sm:inline">Distill cheat sheet</span>
                    <span className="sm:hidden">Distill</span>
                  </Button>
                ) : null}
              </div>
              <TabsContent
                value="agent"
                className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden print:hidden"
              >
                <AgentChat
                  ref={agentChatRef}
                  key={activeSceneId ?? "project"}
                  projectId={bundle.project.id}
                  sceneId={activeSceneId}
                  onStreamingChange={setAgentStreaming}
                  sceneHeading={
                    activeScene
                      ? sceneSlugLabel(
                          activeScene,
                          scriptsById.get(activeScene.scriptId),
                          scripts.length > 1
                        )
                      : null
                  }
                  initialMessages={bundle.chatMessages.filter(
                    (m) => m.sceneId === null || m.sceneId === activeSceneId
                  )}
                  onCheatSheet={(sheet) => {
                    upsertCheatSheet(sheet);
                    setRightTab("sheet");
                  }}
                />
              </TabsContent>
              <TabsContent
                value="sheet"
                className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden"
              >
                <CheatSheetPanel
                  projectId={bundle.project.id}
                  projectTitle={bundle.project.title}
                  scripts={scripts}
                  scenes={scenes}
                  sceneId={activeSceneId}
                  sceneHeading={
                    activeScene
                      ? sceneSlugLabel(
                          activeScene,
                          scriptsById.get(activeScene.scriptId),
                          scripts.length > 1
                        )
                      : null
                  }
                  cheatSheet={activeCheatSheet}
                  onChange={upsertCheatSheet}
                />
              </TabsContent>
            </Tabs>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
