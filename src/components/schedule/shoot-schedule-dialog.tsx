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
import { CalendarDays, GripVertical, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
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

type Columns = Record<string, string[]>;

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
}: {
  id: string;
  title: string;
  sceneIds: string[];
  scenesById: Map<string, Scene>;
  labelFor: (scene: Scene) => string;
  className?: string;
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
  const [columns, setColumns] = useState<Columns>(() =>
    buildColumns(scenes, scripts)
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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
    // intentionally omit scenes/scripts: capture board state at open time
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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

  async function save() {
    setSaving(true);
    try {
      const known = new Set(scenes.map((s) => s.id));
      const seen = new Set<string>();
      const assignments = Object.entries(columnsRef.current).flatMap(
        ([key, ids]) => {
          const day = parseDayKey(key);
          return ids
            .filter((id) => known.has(id))
            .map((id, i) => {
              seen.add(id);
              return {
                id,
                shootDay: day,
                shootOrder: day == null ? null : i + 1,
              };
            });
        }
      );

      // Any known scene missing from the board is explicitly unscheduled
      for (const s of scenes) {
        if (!seen.has(s.id)) {
          assignments.push({
            id: s.id,
            shootDay: null,
            shootOrder: null,
          });
        }
      }

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
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save schedule");
    } finally {
      setSaving(false);
    }
  }

  const activeScene = activeId ? scenesById.get(activeId) : null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1.5 text-xs text-muted-foreground"
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
          <DialogTitle>Shoot schedule</DialogTitle>
          <DialogDescription>
            Unscheduled stays pinned on the left while shoot days scroll. Drag
            scenes onto days across all episodes.
          </DialogDescription>
        </DialogHeader>

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
            onClick={() => setOpen(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button type="button" onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : "Save schedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
