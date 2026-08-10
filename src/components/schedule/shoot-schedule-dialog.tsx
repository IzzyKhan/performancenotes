"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  getFirstCollision,
  pointerWithin,
  rectIntersection,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { snapCenterToCursor } from "@dnd-kit/modifiers";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CalendarDays, GripVertical, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { Scene, Script } from "@/types";
import { cn } from "@/lib/utils";
import {
  sceneSlugLabel,
  sortSceneIdsByScriptThenOrder,
  sortScenesByShootThenScript,
} from "@/lib/schedule";
import { toast } from "sonner";

const UNSCHEDULED = "unscheduled";
const MAX_BULK_SHOOT_DAYS = 120;

type Columns = Record<string, string[]>;

type ScheduleAssignment = {
  id: string;
  shootDay: number | null;
  shootOrder: number | null;
};

function assignmentsFromColumns(
  columns: Columns,
  scenes: Scene[]
): ScheduleAssignment[] {
  const known = new Set(scenes.map((s) => s.id));
  const seen = new Set<string>();
  const assignments: ScheduleAssignment[] = [];

  for (const [key, ids] of Object.entries(columns)) {
    const day = parseDayKey(key);
    ids.forEach((id, i) => {
      if (!known.has(id)) return;
      seen.add(id);
      assignments.push({
        id,
        shootDay: day,
        shootOrder: day == null ? null : i + 1,
      });
    });
  }

  for (const s of scenes) {
    if (!seen.has(s.id)) {
      assignments.push({
        id: s.id,
        shootDay: null,
        shootOrder: null,
      });
    }
  }

  assignments.sort((a, b) => a.id.localeCompare(b.id));
  return assignments;
}

function assignmentsSnapshot(columns: Columns, scenes: Scene[]): string {
  return JSON.stringify(assignmentsFromColumns(columns, scenes));
}

function dayKey(n: number) {
  return `day-${n}`;
}

function parseDayKey(key: string): number | null {
  if (key === UNSCHEDULED) return null;
  const m = /^day-(\d+)$/.exec(key);
  return m ? Number(m[1]) : null;
}

function isContainerId(id: UniqueIdentifier, columns: Columns): boolean {
  return String(id) in columns;
}

function buildColumns(scenes: Scene[], scripts: Script[]): Columns {
  const ordered = sortScenesByShootThenScript(
    scenes.filter((s) => s.shootDay == null),
    scripts
  );
  // Prefer script+scene order for the full list used to seed columns
  const scriptOrdered = [...scenes].sort((a, b) => {
    const ao = scripts.find((s) => s.id === a.scriptId)?.orderIndex ?? 0;
    const bo = scripts.find((s) => s.id === b.scriptId)?.orderIndex ?? 0;
    if (ao !== bo) return ao - bo;
    return a.orderIndex - b.orderIndex;
  });
  const maxDay = Math.max(0, ...scriptOrdered.map((s) => s.shootDay ?? 0));
  const dayCount = Math.max(1, maxDay);

  const cols: Columns = { [UNSCHEDULED]: [] };
  for (let d = 1; d <= dayCount; d++) cols[dayKey(d)] = [];

  const scheduled = scriptOrdered.filter((s) => s.shootDay != null);
  cols[UNSCHEDULED] = ordered.map((s) => s.id);

  const byDay = new Map<number, Scene[]>();
  for (const s of scheduled) {
    const day = s.shootDay!;
    const list = byDay.get(day) ?? [];
    list.push(s);
    byDay.set(day, list);
  }
  for (const [day, list] of byDay) {
    list.sort(
      (a, b) =>
        (a.shootOrder ?? 0) - (b.shootOrder ?? 0) ||
        a.orderIndex - b.orderIndex
    );
    cols[dayKey(day)] = list.map((s) => s.id);
  }

  return cols;
}

function findContainer(
  columns: Columns,
  id: UniqueIdentifier
): string | null {
  const key = String(id);
  if (key in columns) return key;
  for (const [containerId, items] of Object.entries(columns)) {
    if (items.includes(key)) return containerId;
  }
  return null;
}

function SceneCard({
  scene,
  label,
  dragging,
}: {
  scene: Scene;
  label: string;
  dragging?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex cursor-grab items-start gap-2 rounded-md border border-border bg-card px-2 py-2 text-left select-none transition-colors hover:bg-accent/40 active:cursor-grabbing",
        dragging && "cursor-grabbing bg-accent/40 shadow-sm ring-1 ring-foreground/15"
      )}
    >
      <GripVertical className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="truncate text-xs font-medium">{label}</p>
      </div>
    </div>
  );
}

function SortableSceneCard({
  scene,
  label,
  containerId,
}: {
  scene: Scene;
  label: string;
  containerId: string;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: scene.id,
    data: { type: "scene", containerId },
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.35 : 1,
      }}
      className="cursor-grab touch-none active:cursor-grabbing"
      {...attributes}
      {...listeners}
    >
      <SceneCard scene={scene} label={label} />
    </div>
  );
}

function DayColumn({
  id,
  title,
  sceneIds,
  scenesById,
  labelFor,
  className,
  onDelete,
}: {
  id: string;
  title: string;
  sceneIds: string[];
  scenesById: Map<string, Scene>;
  labelFor: (scene: Scene) => string;
  className?: string;
  onDelete?: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id,
    data: { type: "container", children: sceneIds },
  });

  return (
    <div
      className={cn(
        "flex w-56 shrink-0 flex-col rounded-md border border-border bg-background",
        isOver && "border-foreground/40 bg-accent/30",
        className
      )}
    >
      <div className="flex shrink-0 items-center justify-between border-b border-border px-2.5 py-2">
        <p className="text-xs font-medium">{title}</p>
        <span className="text-[11px] text-muted-foreground">
          {sceneIds.length}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className="flex min-h-48 flex-1 flex-col gap-1.5 overflow-y-auto p-2"
      >
        <SortableContext
          id={id}
          items={sceneIds}
          strategy={verticalListSortingStrategy}
        >
          {sceneIds.map((sid) => {
            const scene = scenesById.get(sid);
            if (!scene) return null;
            return (
              <SortableSceneCard
                key={sid}
                scene={scene}
                label={labelFor(scene)}
                containerId={id}
              />
            );
          })}
        </SortableContext>
        {sceneIds.length === 0 ? (
          <p className="pointer-events-none px-1 py-8 text-center text-[11px] text-muted-foreground">
            Drop scenes here
          </p>
        ) : null}
      </div>
      {onDelete ? (
        <div className="flex shrink-0 justify-end px-1.5 py-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="size-6 text-[var(--project-accent)] hover:text-destructive"
            title={`Remove ${title}`}
            aria-label={`Remove ${title}`}
            onClick={onDelete}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function ShootScheduleDialog({
  projectId,
  scripts,
  scenes,
  onScenesChange,
}: {
  projectId: string;
  scripts: Script[];
  scenes: Scene[];
  onScenesChange: (scenes: Scene[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);
  const [columns, setColumns] = useState<Columns>(() =>
    buildColumns(scenes, scripts)
  );
  const [initialSnapshot, setInitialSnapshot] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [bulkDaysOpen, setBulkDaysOpen] = useState(false);
  const [bulkDaysInput, setBulkDaysInput] = useState("1");

  const columnsRef = useRef(columns);
  columnsRef.current = columns;
  const lastOverId = useRef<UniqueIdentifier | null>(null);
  const recentlyMovedToNewContainer = useRef(false);

  // Rebuild the board only when the dialog opens — not when parent `scenes`
  // refresh mid-edit (that was wiping in-progress / just-saved layouts).
  useEffect(() => {
    if (!open) return;
    const next = buildColumns(scenes, scripts);
    setColumns(next);
    columnsRef.current = next;
    setInitialSnapshot(assignmentsSnapshot(next, scenes));
    setConfirmCloseOpen(false);
    // intentionally omit scenes/scripts: capture board state at open time
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const isDirty = useMemo(
    () =>
      open &&
      initialSnapshot !== "" &&
      assignmentsSnapshot(columns, scenes) !== initialSnapshot,
    [open, initialSnapshot, columns, scenes]
  );

  const scenesById = useMemo(
    () => new Map(scenes.map((s) => [s.id, s])),
    [scenes]
  );
  const scriptsById = useMemo(
    () => new Map(scripts.map((s) => [s.id, s])),
    [scripts]
  );
  const multiScript = scripts.length > 1;

  const labelFor = useCallback(
    (scene: Scene) =>
      sceneSlugLabel(scene, scriptsById.get(scene.scriptId), multiScript),
    [scriptsById, multiScript]
  );

  const sortUnscheduled = useCallback(
    (ids: string[]) =>
      sortSceneIdsByScriptThenOrder(ids, scenesById, scripts),
    [scenesById, scripts]
  );

  const dayKeys = useMemo(
    () =>
      Object.keys(columns)
        .filter((k) => k !== UNSCHEDULED)
        .sort((a, b) => (parseDayKey(a) ?? 0) - (parseDayKey(b) ?? 0)),
    [columns]
  );

  const currentDayCount = useMemo(
    () => dayKeys.reduce((max, k) => Math.max(max, parseDayKey(k) ?? 0), 0),
    [dayKeys]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const collisionDetection = useCallback<CollisionDetection>(
    (args) => {
      const cols = columnsRef.current;

      if (activeId && isContainerId(activeId, cols)) {
        return closestCenter({
          ...args,
          droppableContainers: args.droppableContainers.filter((c) =>
            isContainerId(c.id, cols)
          ),
        });
      }

      const pointerHits = pointerWithin(args);
      const intersections =
        pointerHits.length > 0 ? pointerHits : rectIntersection(args);

      let overId = getFirstCollision(intersections, "id");

      if (overId != null) {
        if (isContainerId(overId, cols)) {
          const containerItems = cols[String(overId)] ?? [];
          if (containerItems.length > 0) {
            const closest = closestCenter({
              ...args,
              droppableContainers: args.droppableContainers.filter(
                (c) =>
                  c.id !== overId &&
                  containerItems.includes(String(c.id))
              ),
            });
            overId = closest[0]?.id ?? overId;
          }
        }

        lastOverId.current = overId;
        return [{ id: overId }];
      }

      if (recentlyMovedToNewContainer.current) {
        lastOverId.current = overId;
      }

      return lastOverId.current ? [{ id: lastOverId.current }] : [];
    },
    [activeId]
  );

  function addDay() {
    const next =
      dayKeys.reduce((max, k) => Math.max(max, parseDayKey(k) ?? 0), 0) + 1;
    setColumns((prev) => {
      const updated = { ...prev, [dayKey(next)]: [] };
      columnsRef.current = updated;
      return updated;
    });
  }

  function removeDay(key: string) {
    if (key === UNSCHEDULED) return;

    const movedCount = columnsRef.current[key]?.length ?? 0;
    const dayNum = parseDayKey(key);

    setColumns((prev) => {
      if (!(key in prev)) return prev;

      const moved = prev[key] ?? [];
      const unscheduled = sortUnscheduled([
        ...(prev[UNSCHEDULED] ?? []),
        ...moved,
      ]);
      const updated = { ...prev };
      delete updated[key];
      updated[UNSCHEDULED] = unscheduled;
      columnsRef.current = updated;
      return updated;
    });

    if (movedCount > 0) {
      toast.message(
        `Day ${dayNum} removed — ${movedCount} scene${movedCount === 1 ? "" : "s"} moved to Unscheduled`
      );
    }
  }

  function ensureShootDays(count: number) {
    const target = Math.floor(count);
    if (target < 1) return 0;

    let added = 0;
    setColumns((prev) => {
      const updated = { ...prev };
      for (let d = 1; d <= target; d++) {
        const key = dayKey(d);
        if (!(key in updated)) {
          updated[key] = [];
          added += 1;
        }
      }
      columnsRef.current = updated;
      return updated;
    });
    return added;
  }

  function openBulkDaysDialog() {
    setBulkDaysInput(String(Math.max(1, currentDayCount || 1)));
    setBulkDaysOpen(true);
  }

  function applyBulkShootDays() {
    const parsed = Number.parseInt(bulkDaysInput.trim(), 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      toast.error("Enter at least 1 shoot day");
      return;
    }
    if (parsed > MAX_BULK_SHOOT_DAYS) {
      toast.error(`Maximum ${MAX_BULK_SHOOT_DAYS} shoot days at once`);
      return;
    }

    const added = ensureShootDays(parsed);
    setBulkDaysOpen(false);
    if (added > 0) {
      toast.success(
        parsed === 1
          ? "Day 1 is ready"
          : `Days 1–${parsed} are ready (${added} new)`
      );
    } else {
      toast.message(`Already have ${currentDayCount} shoot days`);
    }
  }

  function moveBetweenContainers(
    activeItemId: string,
    from: string,
    to: string,
    overId: UniqueIdentifier
  ) {
    setColumns((prev) => {
      const fromItems = [...(prev[from] ?? [])];
      const toItems = [...(prev[to] ?? [])];
      const fromIndex = fromItems.indexOf(activeItemId);
      if (fromIndex < 0) return prev;

      fromItems.splice(fromIndex, 1);

      if (to === UNSCHEDULED) {
        // Unscheduled always stays in script order — ignore drop index.
        toItems.push(activeItemId);
        const sorted = sortUnscheduled(toItems);
        recentlyMovedToNewContainer.current = true;
        const updated = {
          ...prev,
          [from]: fromItems,
          [to]: sorted,
        };
        columnsRef.current = updated;
        return updated;
      }

      let toIndex = toItems.indexOf(String(overId));
      if (isContainerId(overId, prev) || toIndex < 0) {
        toIndex = toItems.length;
      }

      toItems.splice(toIndex, 0, activeItemId);
      recentlyMovedToNewContainer.current = true;

      const updated = {
        ...prev,
        [from]:
          from === UNSCHEDULED ? sortUnscheduled(fromItems) : fromItems,
        [to]: toItems,
      };
      columnsRef.current = updated;
      return updated;
    });
  }

  function onDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
    recentlyMovedToNewContainer.current = false;
  }

  function onDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;

    const cols = columnsRef.current;
    const activeContainer = findContainer(cols, active.id);
    const overContainer = findContainer(cols, over.id);

    if (!activeContainer || !overContainer) return;
    if (activeContainer === overContainer) return;

    moveBetweenContainers(
      String(active.id),
      activeContainer,
      overContainer,
      over.id
    );

    requestAnimationFrame(() => {
      recentlyMovedToNewContainer.current = false;
    });
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    const cols = columnsRef.current;
    setActiveId(null);
    recentlyMovedToNewContainer.current = false;

    if (!over) return;

    const activeContainer = findContainer(cols, active.id);
    const overContainer = findContainer(cols, over.id);
    if (!activeContainer || !overContainer) return;

    if (activeContainer === overContainer) {
      // Unscheduled is fixed to script order — ignore within-column reorder.
      if (activeContainer === UNSCHEDULED) {
        setColumns((prev) => {
          const sorted = sortUnscheduled(prev[UNSCHEDULED] ?? []);
          const updated = { ...prev, [UNSCHEDULED]: sorted };
          columnsRef.current = updated;
          return updated;
        });
        return;
      }

      const items = cols[activeContainer] ?? [];
      const oldIndex = items.indexOf(String(active.id));
      const newIndex = isContainerId(over.id, cols)
        ? items.length - 1
        : items.indexOf(String(over.id));

      if (oldIndex >= 0 && newIndex >= 0 && oldIndex !== newIndex) {
        setColumns((prev) => {
          const updated = {
            ...prev,
            [activeContainer]: arrayMove(
              prev[activeContainer] ?? [],
              oldIndex,
              newIndex
            ),
          };
          columnsRef.current = updated;
          return updated;
        });
      }
      return;
    }

    // Fallback if onDragOver didn't complete the cross-column move
    moveBetweenContainers(
      String(active.id),
      activeContainer,
      overContainer,
      over.id
    );
  }

  function onDragCancel() {
    setActiveId(null);
    recentlyMovedToNewContainer.current = false;
  }

  async function save(): Promise<boolean> {
    setSaving(true);
    try {
      const assignments = assignmentsFromColumns(columnsRef.current, scenes);

      const res = await fetch("/api/scenes/schedule", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, assignments }),
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save schedule");
      onScenesChange(data as Scene[]);
      toast.success("Shoot schedule saved");
      setInitialSnapshot(assignmentsSnapshot(columnsRef.current, data as Scene[]));
      setConfirmCloseOpen(false);
      setOpen(false);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save schedule");
      return false;
    } finally {
      setSaving(false);
    }
  }

  function requestClose() {
    if (isDirty) {
      setConfirmCloseOpen(true);
      return;
    }
    setOpen(false);
  }

  function handleMainOpenChange(next: boolean) {
    if (next) {
      setOpen(true);
      return;
    }
    requestClose();
  }

  function discardAndClose() {
    setConfirmCloseOpen(false);
    setOpen(false);
  }

  async function saveAndClose() {
    await save();
  }

  const activeScene = activeId ? scenesById.get(activeId) : null;

  return (
    <>
    <Dialog open={open} onOpenChange={handleMainOpenChange}>
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1.5 text-xs text-[var(--project-accent)]"
          />
        }
      >
        <CalendarDays className="size-4 stroke-[1.5]" />
        <span className="hidden sm:inline">Schedule</span>
      </DialogTrigger>

      <DialogContent
        className="flex max-h-[85vh] w-[min(96vw,72rem)] max-w-[min(96vw,72rem)] flex-col gap-0 p-0 sm:max-w-[min(96vw,72rem)]"
        showCloseButton
      >
        <DialogHeader className="border-b border-border px-4 py-3">
          <DialogTitle>Production schedule</DialogTitle>
          <DialogDescription>
            Drag and drop scenes onto days to align with your production schedule.
            Your scene prep can then be exported in schedule order.
          </DialogDescription>
        </DialogHeader>

        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-4 py-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={openBulkDaysDialog}
          >
            Set shoot days…
          </Button>
          <span className="text-[11px] text-muted-foreground">
            {currentDayCount === 0
              ? "No shoot days yet"
              : `${currentDayCount} shoot day${currentDayCount === 1 ? "" : "s"}`}
          </span>
        </div>

        <div className="flex min-h-0 flex-1 overflow-hidden">
          <DndContext
            sensors={sensors}
            collisionDetection={collisionDetection}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDragEnd={onDragEnd}
            onDragCancel={onDragCancel}
          >
            {/* Pinned unscheduled column — stays visible while days scroll */}
            <div className="flex shrink-0 flex-col border-r border-border bg-background px-3 py-3">
              <DayColumn
                id={UNSCHEDULED}
                title="Unscheduled"
                sceneIds={columns[UNSCHEDULED] ?? []}
                scenesById={scenesById}
                labelFor={labelFor}
                className="h-full min-h-[20rem] max-h-full"
              />
            </div>

            <div className="min-h-0 min-w-0 flex-1 overflow-x-auto overflow-y-auto px-3 py-3">
              <div className="flex min-h-[20rem] gap-3 pb-2">
                {dayKeys.map((key) => (
                  <DayColumn
                    key={key}
                    id={key}
                    title={`Day ${parseDayKey(key)}`}
                    sceneIds={columns[key] ?? []}
                    scenesById={scenesById}
                    labelFor={labelFor}
                    onDelete={() => removeDay(key)}
                  />
                ))}
                <button
                  type="button"
                  onClick={addDay}
                  className="flex w-40 shrink-0 flex-col items-center justify-center gap-1.5 rounded-md border border-dashed border-border text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
                >
                  <Plus className="size-4" />
                  Add day
                </button>
              </div>
            </div>

            {/* Portal outside the dialog: fixed positioning breaks under
                DialogContent's translate(-50%, -50%) containing block. */}
            {typeof document !== "undefined"
              ? createPortal(
                  <DragOverlay
                    dropAnimation={null}
                    adjustScale={false}
                    modifiers={[snapCenterToCursor]}
                    style={{ cursor: "grabbing" }}
                    zIndex={200}
                  >
                    {activeScene ? (
                      <div className="w-52">
                        <SceneCard
                          scene={activeScene}
                          label={labelFor(activeScene)}
                          dragging
                        />
                      </div>
                    ) : null}
                  </DragOverlay>,
                  document.body
                )
              : null}
          </DndContext>
        </div>

        <DialogFooter className="mx-0 mb-0 rounded-none">
          <Button
            type="button"
            variant="outline"
            onClick={requestClose}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="accent"
            onClick={() => void save()}
            disabled={saving || !isDirty}
          >
            {saving ? "Saving…" : "Save schedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={bulkDaysOpen} onOpenChange={setBulkDaysOpen}>
      <DialogContent className="gap-0 p-0 sm:max-w-sm" showCloseButton={false}>
        <DialogHeader className="border-b border-border px-4 py-3">
          <DialogTitle>Set shoot days</DialogTitle>
          <DialogDescription>
            Create day columns numbered 1 through N. Existing days and assigned
            scenes are kept — use Add day to extend one at a time.
          </DialogDescription>
        </DialogHeader>
        <div className="px-4 py-4">
          <label className="flex flex-col gap-1.5 text-xs">
            <span className="font-medium text-muted-foreground">
              Number of shoot days
            </span>
            <Input
              type="number"
              min={1}
              max={MAX_BULK_SHOOT_DAYS}
              inputMode="numeric"
              value={bulkDaysInput}
              onChange={(e) => setBulkDaysInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  applyBulkShootDays();
                }
              }}
              autoFocus
            />
          </label>
        </div>
        <DialogFooter className="mx-0 mb-0 gap-2 rounded-none px-4 py-3 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => setBulkDaysOpen(false)}
          >
            Cancel
          </Button>
          <Button type="button" variant="accent" onClick={applyBulkShootDays}>
            Create days
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={confirmCloseOpen} onOpenChange={setConfirmCloseOpen}>
      <DialogContent className="gap-0 p-0 sm:max-w-lg" showCloseButton={false}>
        <DialogHeader className="border-b border-border px-4 py-3">
          <DialogTitle>Save schedule changes?</DialogTitle>
          <DialogDescription>
            You have unsaved changes to the shoot schedule. Save before closing?
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-between gap-4 border-t border-border px-4 py-3">
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={discardAndClose}
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            Discard
          </Button>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => setConfirmCloseOpen(false)}
            >
              Keep editing
            </Button>
            <Button
              type="button"
              variant="accent"
              disabled={saving}
              onClick={() => void saveAndClose()}
            >
              {saving ? "Saving…" : "Save schedule"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
