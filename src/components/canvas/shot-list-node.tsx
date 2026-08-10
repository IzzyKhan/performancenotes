"use client";

import { memo, useMemo, useRef, useState } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Columns3,
  GripVertical,
  ImageIcon,
  Plus,
  Trash2,
} from "lucide-react";
import type { Node, NodeProps } from "@xyflow/react";
import { NodeResizer } from "@xyflow/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type {
  CanvasNode,
  ShotListColumnId,
  ShotListContent,
  ShotListRow,
} from "@/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { postWithRetry, snapshotFile } from "@/lib/upload-client";
import {
  HEIC_ERROR_MESSAGE,
  isHeicFile,
  prepareImageForUpload,
} from "@/lib/image-prep";
import {
  CAMERA_PRESETS,
  MOVEMENT_PRESETS,
  SHOT_LIST_COLUMN_IDS,
  SHOT_LIST_COLUMN_LABELS,
  SHOT_SIZE_PRESETS,
  SHOT_TYPE_PRESETS,
  emptyShotListRow,
  formatShotCode,
  normalizeShotListContent,
} from "@/lib/shot-list";
import { useDeleteConfirm } from "@/components/canvas/use-delete-confirm";

export type ShotListFlowData = {
  canvasNode: CanvasNode;
  onUpdate: (id: string, patch: Partial<CanvasNode>) => void;
  onDelete: (id: string) => void;
};

type ShotListFlowNode = Node<ShotListFlowData, "shot-list">;

function stopCanvasPointer(e: React.SyntheticEvent) {
  e.stopPropagation();
}

/** Prefixed ids so one DndContext can sort columns and rows. */
const colSortId = (id: ShotListColumnId) => `col:${id}`;
const rowSortId = (id: string) => `row:${id}`;
const parseColSortId = (id: string | number): ShotListColumnId | null => {
  const s = String(id);
  return s.startsWith("col:") ? (s.slice(4) as ShotListColumnId) : null;
};
const parseRowSortId = (id: string | number): string | null => {
  const s = String(id);
  return s.startsWith("row:") ? s.slice(4) : null;
};

function SortableHeader({
  id,
  label,
}: {
  id: ShotListColumnId;
  label: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: colSortId(id) });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <th
      ref={setNodeRef}
      style={style}
      className={cn(
        "border-b border-border bg-muted/40 px-1.5 py-1.5 text-left text-[10px] font-medium uppercase tracking-wide text-muted-foreground",
        isDragging && "z-10 opacity-80"
      )}
    >
      <button
        type="button"
        className="nodrag nopan flex max-w-full items-center gap-0.5 cursor-grab active:cursor-grabbing"
        onPointerDown={stopCanvasPointer}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-3 shrink-0 opacity-50" />
        <span className="truncate">{label}</span>
      </button>
    </th>
  );
}

function SortableRow({
  row,
  columns,
  renderCell,
  onDelete,
}: {
  row: ShotListRow;
  columns: ShotListColumnId[];
  renderCell: (col: ShotListColumnId, row: ShotListRow) => React.ReactNode;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: rowSortId(row.id) });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={cn("align-middle", isDragging && "z-10 bg-card opacity-90")}
    >
      <td className="w-6 border-b border-border/50 px-0.5 py-1">
        <button
          type="button"
          className="nodrag nopan flex cursor-grab items-center justify-center p-0.5 text-muted-foreground active:cursor-grabbing"
          onPointerDown={stopCanvasPointer}
          aria-label="Reorder shot"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-3.5 opacity-50" />
        </button>
      </td>
      {columns.map((col) => (
        <td key={col} className="border-b border-border/50 px-1 py-1">
          {renderCell(col, row)}
        </td>
      ))}
      <td className="border-b border-border/50 px-0.5 py-1">
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          className="nodrag text-muted-foreground hover:text-destructive"
          onClick={onDelete}
          onPointerDown={stopCanvasPointer}
          aria-label="Delete shot"
        >
          <Trash2 className="size-3" />
        </Button>
      </td>
    </tr>
  );
}

function PresetSelect({
  value,
  presets,
  onChange,
}: {
  value: string;
  presets: readonly string[];
  onChange: (v: string) => void;
}) {
  const options = presets.includes(value)
    ? presets
    : value
      ? [...presets, value]
      : presets;
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onPointerDown={stopCanvasPointer}
      onMouseDown={stopCanvasPointer}
      className="nodrag nopan h-7 w-full min-w-[4.5rem] rounded-md border border-border bg-background px-1 text-[11px]"
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

export const ShotListNode = memo(function ShotListNode({
  data,
  selected,
}: NodeProps<ShotListFlowNode>) {
  const { canvasNode, onUpdate, onDelete } = data;
  const content = useMemo(
    () => normalizeShotListContent(canvasNode.content),
    [canvasNode.content]
  );
  const [uploadingRowId, setUploadingRowId] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const pendingRowId = useRef<string | null>(null);
  const { requestDelete, deleteDialog } = useDeleteConfirm();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  function commit(next: ShotListContent) {
    onUpdate(canvasNode.id, {
      content: next as unknown as CanvasNode["content"],
      label: next.title,
    });
  }

  function updateRow(rowId: string, patch: Partial<ShotListRow>) {
    commit({
      ...content,
      rows: content.rows.map((r) =>
        r.id === rowId ? { ...r, ...patch } : r
      ),
    });
  }

  function addRow() {
    const nextSetup =
      content.rows.reduce((max, r) => {
        const n = parseInt(r.setup, 10);
        return Number.isFinite(n) ? Math.max(max, n) : max;
      }, 0) + 1;
    commit({
      ...content,
      rows: [...content.rows, emptyShotListRow(nextSetup)],
    });
  }

  function deleteRow(rowId: string) {
    const rows = content.rows.filter((r) => r.id !== rowId);
    commit({
      ...content,
      rows: rows.length > 0 ? rows : [emptyShotListRow(1)],
    });
  }

  function confirmDeleteRow(row: ShotListRow) {
    const code = formatShotCode(row.setup, row.camera);
    const named = code ? `Shot ${code}` : "This shot";
    const detail = row.description.trim() ? ` — “${row.description.trim()}”` : "";
    const isLast = content.rows.length <= 1;
    requestDelete({
      title: isLast ? "Clear this shot?" : "Delete this shot?",
      description: isLast
        ? `${named}${detail} is the only shot, so the row will be cleared. This cannot be undone.`
        : `${named}${detail} will be removed from the shot list. This cannot be undone.`,
      confirmLabel: isLast ? "Clear" : "Delete",
      onConfirm: () => deleteRow(row.id),
    });
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeCol = parseColSortId(active.id);
    const overCol = parseColSortId(over.id);
    if (activeCol && overCol) {
      const oldIndex = content.columns.indexOf(activeCol);
      const newIndex = content.columns.indexOf(overCol);
      if (oldIndex < 0 || newIndex < 0) return;
      commit({
        ...content,
        columns: arrayMove(content.columns, oldIndex, newIndex),
      });
      return;
    }

    const activeRow = parseRowSortId(active.id);
    const overRow = parseRowSortId(over.id);
    if (activeRow && overRow) {
      const oldIndex = content.rows.findIndex((r) => r.id === activeRow);
      const newIndex = content.rows.findIndex((r) => r.id === overRow);
      if (oldIndex < 0 || newIndex < 0) return;
      commit({
        ...content,
        rows: arrayMove(content.rows, oldIndex, newIndex),
      });
    }
  }

  function toggleColumn(col: ShotListColumnId, visible: boolean) {
    if (visible) {
      if (content.columns.includes(col)) return;
      commit({ ...content, columns: [...content.columns, col] });
      return;
    }
    if (content.columns.length <= 1) {
      toast.error("Keep at least one column");
      return;
    }
    commit({
      ...content,
      columns: content.columns.filter((c) => c !== col),
    });
  }

  async function uploadRowImage(rowId: string, file: File) {
    if (isHeicFile(file)) {
      toast.error(HEIC_ERROR_MESSAGE);
      return;
    }
    setUploadingRowId(rowId);
    try {
      const snapshot = await snapshotFile(file);
      const toSend = await prepareImageForUpload(snapshot);
      const form = new FormData();
      form.append("file", toSend);
      const data = await postWithRetry("/api/upload", form, {
        label: "Shot image",
      });
      const filePath =
        typeof data.filePath === "string"
          ? data.filePath
          : typeof data.path === "string"
            ? data.path
            : null;
      if (!filePath) throw new Error("Upload failed");
      updateRow(rowId, { imagePath: filePath });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Image upload failed");
    } finally {
      setUploadingRowId(null);
    }
  }

  function renderCell(col: ShotListColumnId, row: ShotListRow) {
    switch (col) {
      case "status":
        return (
          <input
            type="checkbox"
            className="nodrag size-3.5 accent-primary"
            checked={row.status === "done"}
            onChange={(e) =>
              updateRow(row.id, {
                status: e.target.checked ? "done" : "todo",
              })
            }
            onPointerDown={stopCanvasPointer}
          />
        );
      case "image": {
        const src = row.imagePath
          ? `/api/media/${row.imagePath.split("/").pop()}`
          : null;
        return (
          <div className="flex items-center gap-1">
            {src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={src}
                alt=""
                className="max-h-24 max-w-[9rem] h-auto w-auto rounded object-contain"
              />
            ) : (
              <div className="flex h-9 w-12 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground">
                <ImageIcon className="size-3.5" />
              </div>
            )}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="nodrag h-7 px-1.5 text-[10px]"
              disabled={uploadingRowId === row.id}
              onClick={() => {
                pendingRowId.current = row.id;
                imageInputRef.current?.click();
              }}
              onPointerDown={stopCanvasPointer}
            >
              {uploadingRowId === row.id ? "…" : src ? "Swap" : "Add"}
            </Button>
          </div>
        );
      }
      case "setup":
        return (
          <Input
            value={row.setup}
            onChange={(e) => {
              const setup = e.target.value;
              const n = parseInt(setup, 10);
              updateRow(row.id, {
                setup,
                ...(Number.isFinite(n) && n >= 1 ? { shot: n } : {}),
              });
            }}
            onPointerDown={stopCanvasPointer}
            onMouseDown={stopCanvasPointer}
            inputMode="numeric"
            className="nodrag nopan h-7 w-12 px-1 text-[11px]"
          />
        );
      case "shot":
        return (
          <span className="block min-w-[2rem] px-1 text-[11px] font-medium tabular-nums">
            {formatShotCode(row.setup, row.camera) || "—"}
          </span>
        );
      case "description":
        return (
          <Input
            value={row.description}
            onChange={(e) => updateRow(row.id, { description: e.target.value })}
            onPointerDown={stopCanvasPointer}
            onMouseDown={stopCanvasPointer}
            placeholder="Action…"
            className="nodrag nopan h-7 min-w-[8rem] text-[11px]"
          />
        );
      case "camera":
        return (
          <PresetSelect
            value={row.camera}
            presets={CAMERA_PRESETS}
            onChange={(v) => updateRow(row.id, { camera: v })}
          />
        );
      case "shotSize":
        return (
          <PresetSelect
            value={row.shotSize}
            presets={SHOT_SIZE_PRESETS}
            onChange={(v) => updateRow(row.id, { shotSize: v })}
          />
        );
      case "shotType":
        return (
          <PresetSelect
            value={row.shotType}
            presets={SHOT_TYPE_PRESETS}
            onChange={(v) => updateRow(row.id, { shotType: v })}
          />
        );
      case "movement":
        return (
          <PresetSelect
            value={row.movement}
            presets={MOVEMENT_PRESETS}
            onChange={(v) => updateRow(row.id, { movement: v })}
          />
        );
    }
  }

  const columnSortIds = content.columns.map(colSortId);
  const rowSortIds = content.rows.map((r) => rowSortId(r.id));

  return (
    <div
      className={cn(
        "relative flex h-full min-h-[12rem] flex-col rounded-md border border-border bg-card/95 backdrop-blur-sm",
        selected ? "border-foreground/25" : "border-border"
      )}
      style={{
        borderTopColor: "#64748b",
        borderTopWidth: 3,
        width: "100%",
        minWidth: 360,
      }}
    >
      <NodeResizer
        minWidth={360}
        minHeight={200}
        isVisible={selected}
        lineClassName="!border-primary/40"
        handleClassName="!h-2 !w-2 !rounded-sm !border-primary !bg-background"
        onResizeEnd={(_e, { width, height }) => {
          commit({
            ...content,
            frameWidth: Math.round(width),
            frameHeight: Math.round(height),
          });
        }}
      />
      <div className="flex items-center gap-1 border-b border-border/60 px-2 py-1.5">
        <Input
          value={content.title}
          onChange={(e) => commit({ ...content, title: e.target.value })}
          onPointerDown={stopCanvasPointer}
          onMouseDown={stopCanvasPointer}
          placeholder="Shot list title…"
          className="nodrag nopan h-7 flex-1 border-0 bg-transparent px-1 text-xs font-medium shadow-none focus-visible:ring-0"
        />
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="nodrag h-7 gap-1 px-1.5 text-[10px] text-muted-foreground"
              />
            }
          >
            <Columns3 className="size-3.5" />
            Columns
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="nodrag"
            onPointerDown={stopCanvasPointer}
          >
            {SHOT_LIST_COLUMN_IDS.map((col) => (
              <DropdownMenuCheckboxItem
                key={col}
                checked={content.columns.includes(col)}
                onCheckedChange={(checked) =>
                  toggleColumn(col, Boolean(checked))
                }
              >
                {SHOT_LIST_COLUMN_LABELS[col]}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          size="icon-sm"
          variant="ghost"
          className="nodrag shrink-0 text-muted-foreground hover:text-destructive"
          onClick={() => onDelete(canvasNode.id)}
          onPointerDown={stopCanvasPointer}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>

      <div className="nowheel min-h-0 flex-1 overflow-auto p-2">
        {/* DndContext must wrap the table — it renders a div and cannot sit inside thead/tbody. */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <table className="w-full border-collapse text-left">
            <thead>
              <tr>
                <th className="w-6 border-b border-border bg-muted/40" />
                <SortableContext
                  items={columnSortIds}
                  strategy={horizontalListSortingStrategy}
                >
                  {content.columns.map((col) => (
                    <SortableHeader
                      key={col}
                      id={col}
                      label={SHOT_LIST_COLUMN_LABELS[col]}
                    />
                  ))}
                </SortableContext>
                <th className="w-8 border-b border-border bg-muted/40" />
              </tr>
            </thead>
            <tbody>
              <SortableContext
                items={rowSortIds}
                strategy={verticalListSortingStrategy}
              >
                {content.rows.map((row) => (
                  <SortableRow
                    key={row.id}
                    row={row}
                    columns={content.columns}
                    renderCell={renderCell}
                    onDelete={() => confirmDeleteRow(row)}
                  />
                ))}
              </SortableContext>
            </tbody>
          </table>
        </DndContext>
      </div>

      <div className="border-t border-border/60 px-2 py-1.5">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="nodrag h-7 gap-1 text-[11px]"
          onClick={addRow}
          onPointerDown={stopCanvasPointer}
        >
          <Plus className="size-3.5" />
          Add shot
        </Button>
      </div>

      <input
        ref={imageInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          const rowId = pendingRowId.current;
          e.target.value = "";
          pendingRowId.current = null;
          if (file && rowId) void uploadRowImage(rowId, file);
        }}
      />

      {deleteDialog}
    </div>
  );
});
