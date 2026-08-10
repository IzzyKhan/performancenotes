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
  rectSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, ImageIcon, Plus, Trash2 } from "lucide-react";
import type { Node, NodeProps } from "@xyflow/react";
import { NodeResizer } from "@xyflow/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  CanvasNode,
  ImageGridContent,
  ImageGridItem,
} from "@/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { createId } from "@/lib/id";
import { postWithRetry, snapshotFile } from "@/lib/upload-client";
import {
  HEIC_ERROR_MESSAGE,
  isHeicFile,
  prepareImageForUpload,
} from "@/lib/image-prep";
import {
  IMAGE_GRID_COLUMN_OPTIONS,
  normalizeImageGridContent,
} from "@/lib/image-grid";
import { useMultiImagePick } from "@/components/canvas/multi-image-pick";
import { useDeleteConfirm } from "@/components/canvas/use-delete-confirm";

export type ImageGridFlowData = {
  canvasNode: CanvasNode;
  onUpdate: (id: string, patch: Partial<CanvasNode>) => void;
  onDelete: (id: string) => void;
};

type ImageGridFlowNode = Node<ImageGridFlowData, "image-grid">;

function stopCanvasPointer(e: React.SyntheticEvent) {
  e.stopPropagation();
}

function SortableTile({
  item,
  onCaption,
  onRemove,
}: {
  item: ImageGridItem;
  onCaption: (caption: string) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const src = `/api/media/${item.imagePath.split("/").pop()}`;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group relative flex flex-col gap-1 rounded-md border border-border/60 bg-muted/20 p-1",
        isDragging && "z-10 opacity-90 shadow-md"
      )}
    >
      <div className="relative overflow-hidden rounded bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          className="aspect-[4/3] w-full object-cover"
          draggable={false}
        />
        <button
          type="button"
          className="nodrag nopan absolute left-1 top-1 flex cursor-grab rounded bg-background/80 p-0.5 text-muted-foreground active:cursor-grabbing"
          onPointerDown={stopCanvasPointer}
          aria-label="Reorder image"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-3.5 opacity-70" />
        </button>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          className="nodrag absolute right-0.5 top-0.5 size-6 bg-background/80 text-muted-foreground hover:text-destructive"
          onClick={onRemove}
          onPointerDown={stopCanvasPointer}
          aria-label="Remove image"
        >
          <Trash2 className="size-3" />
        </Button>
      </div>
      <Input
        value={item.caption ?? ""}
        onChange={(e) => onCaption(e.target.value)}
        onPointerDown={stopCanvasPointer}
        onMouseDown={stopCanvasPointer}
        placeholder="Caption…"
        className="nodrag nopan h-6 border-0 bg-transparent px-1 text-[10px] shadow-none focus-visible:ring-0"
      />
    </div>
  );
}

export const ImageGridNode = memo(function ImageGridNode({
  data,
  selected,
}: NodeProps<ImageGridFlowNode>) {
  const { canvasNode, onUpdate, onDelete } = data;
  const requestPick = useMultiImagePick();
  const content = useMemo(
    () => normalizeImageGridContent(canvasNode.content),
    [canvasNode.content]
  );
  const contentRef = useRef(content);
  contentRef.current = content;
  const [uploading, setUploading] = useState(false);
  const { requestDelete, deleteDialog } = useDeleteConfirm();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  function commit(next: ImageGridContent) {
    onUpdate(canvasNode.id, {
      content: next as unknown as CanvasNode["content"],
      label: next.title,
    });
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = content.images.findIndex((i) => i.id === active.id);
    const newIndex = content.images.findIndex((i) => i.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    commit({
      ...content,
      images: arrayMove(content.images, oldIndex, newIndex),
    });
  }

  async function uploadFiles(files: File[]) {
    if (files.length === 0) return;
    setUploading(true);
    const progress = toast.loading(
      files.length === 1
        ? `Uploading ${files[0].name}…`
        : `Uploading ${files.length} images…`
    );
    const added: ImageGridItem[] = [];
    try {
      for (const file of files) {
        if (isHeicFile(file)) {
          toast.error(HEIC_ERROR_MESSAGE);
          continue;
        }
        const snapshot = await snapshotFile(file);
        const toSend = await prepareImageForUpload(snapshot);
        const form = new FormData();
        form.append("file", toSend);
        const data = await postWithRetry("/api/upload", form, {
          label: "Grid image",
        });
        const filePath =
          typeof data.filePath === "string"
            ? data.filePath
            : typeof data.path === "string"
              ? data.path
              : null;
        if (!filePath) throw new Error("Upload failed");
        added.push({ id: createId("img"), imagePath: filePath });
      }
      if (added.length > 0) {
        const latest = contentRef.current;
        commit({
          ...latest,
          images: [...latest.images, ...added],
        });
        toast.success(
          added.length === 1
            ? "Image added"
            : `${added.length} images added`,
          { id: progress }
        );
      } else {
        toast.dismiss(progress);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Image upload failed", {
        id: progress,
      });
    } finally {
      setUploading(false);
    }
  }

  function openPicker() {
    requestPick((files) => {
      void uploadFiles(files);
    });
  }

  function confirmRemoveImage(item: ImageGridItem) {
    const caption = item.caption?.trim();
    const name = caption
      ? `“${caption}”`
      : (item.imagePath.split("/").pop() ?? "This image");
    requestDelete({
      title: "Remove this image?",
      description: `${name} will be removed from ${content.title || "the grid"}. The uploaded file stays available for other nodes.`,
      confirmLabel: "Remove",
      onConfirm: () =>
        commit({
          ...content,
          images: content.images.filter((img) => img.id !== item.id),
        }),
    });
  }

  const itemIds = content.images.map((i) => i.id);

  return (
    <div
      className={cn(
        "relative flex h-full min-h-[12rem] flex-col rounded-md border border-border bg-card/95 backdrop-blur-sm",
        selected ? "border-foreground/25" : "border-border"
      )}
      style={{
        borderTopColor: "#a78bfa",
        borderTopWidth: 3,
        width: "100%",
        minWidth: 280,
      }}
    >
      <NodeResizer
        minWidth={280}
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
          placeholder="Mood board title…"
          className="nodrag nopan h-7 flex-1 border-0 bg-transparent px-1 text-xs font-medium shadow-none focus-visible:ring-0"
        />
        <select
          value={content.gridColumns}
          onChange={(e) =>
            commit({
              ...content,
              gridColumns: Number(e.target.value) || 3,
            })
          }
          onPointerDown={stopCanvasPointer}
          onMouseDown={stopCanvasPointer}
          className="nodrag nopan h-7 rounded-md border border-border bg-background px-1 text-[10px] text-muted-foreground"
          aria-label="Columns"
        >
          {IMAGE_GRID_COLUMN_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n} col
            </option>
          ))}
        </select>
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
        {content.images.length === 0 ? (
          <button
            type="button"
            className="nodrag nopan flex h-full min-h-[8rem] w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border text-muted-foreground hover:bg-muted/30"
            onClick={openPicker}
            onPointerDown={stopCanvasPointer}
          >
            <ImageIcon className="size-6 opacity-50" />
            <span className="text-xs">Add images for a mood board</span>
          </button>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onDragEnd}
          >
            <SortableContext items={itemIds} strategy={rectSortingStrategy}>
              <div
                className="grid gap-2"
                style={{
                  gridTemplateColumns: `repeat(${content.gridColumns}, minmax(0, 1fr))`,
                }}
              >
                {content.images.map((item) => (
                  <SortableTile
                    key={item.id}
                    item={item}
                    onCaption={(caption) =>
                      commit({
                        ...content,
                        images: content.images.map((img) =>
                          img.id === item.id ? { ...img, caption } : img
                        ),
                      })
                    }
                    onRemove={() => confirmRemoveImage(item)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      <div className="border-t border-border/60 px-2 py-1.5">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="nodrag h-7 gap-1 text-[11px]"
          disabled={uploading}
          onClick={openPicker}
          onPointerDown={stopCanvasPointer}
        >
          <Plus className="size-3.5" />
          {uploading ? "Uploading…" : "Add images"}
        </Button>
      </div>

      {deleteDialog}
    </div>
  );
});
