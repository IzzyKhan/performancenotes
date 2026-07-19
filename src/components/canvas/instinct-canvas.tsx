"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useReactFlow,
  ReactFlowProvider,
  type Node,
  type NodeProps,
  type OnNodesChange,
  type Viewport,
  applyNodeChanges,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  ImageIcon,
  Link2,
  Mic,
  StickyNote,
  Sparkles,
  Trash2,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { CanvasNode, CanvasNodeContent, CanvasNodeType } from "@/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useTheme } from "next-themes";

type FlowNodeData = {
  canvasNode: CanvasNode;
  onUpdate: (id: string, patch: Partial<CanvasNode>) => void;
  onDelete: (id: string) => void;
};

type FlowNode = Node<FlowNodeData, CanvasNodeType>;

function isHeicMime(mime: string): boolean {
  return (
    mime === "image/heic" ||
    mime === "image/heif" ||
    mime === "image/heic-sequence" ||
    mime === "image/heif-sequence"
  );
}

/** Browsers often omit mime for .heic — also match by extension. */
function isImageFile(file: File): boolean {
  if (file.type.startsWith("image/") || isHeicMime(file.type)) return true;
  return /\.(heic|heif)$/i.test(file.name);
}

/** Keep React Flow from stealing focus / starting a drag while typing. */
function stopCanvasPointer(e: React.SyntheticEvent) {
  e.stopPropagation();
}

function NodeShell({
  children,
  label,
  onLabelChange,
  onLabelFocus,
  onLabelBlur,
  onDelete,
  accent,
  selected,
}: {
  children: React.ReactNode;
  label: string;
  onLabelChange: (v: string) => void;
  onLabelFocus?: () => void;
  onLabelBlur?: () => void;
  onDelete: () => void;
  accent: string;
  selected?: boolean;
}) {
  return (
    <div
      className={cn(
        "w-64 rounded-md border border-border bg-card/95 backdrop-blur-sm",
        selected ? "border-foreground/25" : "border-border"
      )}
      style={{ borderTopColor: accent, borderTopWidth: 3 }}
    >
      <div className="flex items-center gap-1 border-b border-border/60 px-2 py-1.5">
        <Input
          value={label}
          onChange={(e) => onLabelChange(e.target.value)}
          onFocus={onLabelFocus}
          onBlur={onLabelBlur}
          onPointerDown={stopCanvasPointer}
          onMouseDown={stopCanvasPointer}
          onKeyDown={stopCanvasPointer}
          placeholder="Why this reference…"
          className="nodrag nopan h-7 border-0 bg-transparent px-1 text-xs shadow-none focus-visible:ring-0"
        />
        <Button
          size="icon-sm"
          variant="ghost"
          className="nodrag shrink-0 text-muted-foreground hover:text-destructive"
          onClick={onDelete}
          onPointerDown={stopCanvasPointer}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
      <div className="p-2">{children}</div>
    </div>
  );
}

/**
 * Editable fields keep local state so parent canvasNode updates (and React
 * Flow node rebuilds) never remount the input mid-keystroke.
 */
function useNodeField(
  nodeId: string,
  committed: string,
  commit: (value: string) => void
) {
  const [value, setValue] = useState(committed);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setValue(committed);
  }, [committed, nodeId]);

  return {
    value,
    onChange: (next: string) => {
      setValue(next);
      commit(next);
    },
    onFocus: () => {
      focused.current = true;
    },
    onBlur: () => {
      focused.current = false;
      commit(value);
    },
  };
}

const TextNode = memo(function TextNode({ data, selected }: NodeProps<FlowNode>) {
  const { canvasNode, onUpdate, onDelete } = data;
  const label = useNodeField(canvasNode.id, canvasNode.label ?? "", (v) =>
    onUpdate(canvasNode.id, { label: v })
  );
  const text = useNodeField(
    canvasNode.id,
    canvasNode.content.text ?? "",
    (v) =>
      onUpdate(canvasNode.id, {
        content: { ...canvasNode.content, text: v },
      })
  );

  return (
    <NodeShell
      label={label.value}
      onLabelChange={label.onChange}
      onLabelFocus={label.onFocus}
      onLabelBlur={label.onBlur}
      onDelete={() => onDelete(canvasNode.id)}
      accent="#f59e0b"
      selected={selected}
    >
      <Textarea
        value={text.value}
        onChange={(e) => text.onChange(e.target.value)}
        onFocus={text.onFocus}
        onBlur={text.onBlur}
        onPointerDown={stopCanvasPointer}
        onMouseDown={stopCanvasPointer}
        onKeyDown={stopCanvasPointer}
        placeholder="Instinct note…"
        className="nodrag nopan nowheel min-h-24 resize-none border-0 bg-transparent p-1 text-sm shadow-none focus-visible:ring-0"
      />
    </NodeShell>
  );
});

const ImageNode = memo(function ImageNode({
  data,
  selected,
}: NodeProps<FlowNode>) {
  const { canvasNode, onUpdate, onDelete } = data;
  const label = useNodeField(canvasNode.id, canvasNode.label ?? "", (v) =>
    onUpdate(canvasNode.id, { label: v })
  );
  const src = canvasNode.content.filePath
    ? `/api/media/${canvasNode.content.filePath.split("/").pop()}`
    : null;
  return (
    <NodeShell
      label={label.value}
      onLabelChange={label.onChange}
      onLabelFocus={label.onFocus}
      onLabelBlur={label.onBlur}
      onDelete={() => onDelete(canvasNode.id)}
      accent="#38bdf8"
      selected={selected}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={canvasNode.label ?? "Reference"}
          className="max-h-40 w-full rounded-md object-cover"
        />
      ) : (
        <div className="flex h-24 items-center justify-center text-xs text-muted-foreground">
          No image
        </div>
      )}
    </NodeShell>
  );
});

const AudioNode = memo(function AudioNode({
  data,
  selected,
}: NodeProps<FlowNode>) {
  const { canvasNode, onUpdate, onDelete } = data;
  const label = useNodeField(canvasNode.id, canvasNode.label ?? "", (v) =>
    onUpdate(canvasNode.id, { label: v })
  );
  const src = canvasNode.content.filePath
    ? `/api/media/${canvasNode.content.filePath.split("/").pop()}`
    : null;
  return (
    <NodeShell
      label={label.value}
      onLabelChange={label.onChange}
      onLabelFocus={label.onFocus}
      onLabelBlur={label.onBlur}
      onDelete={() => onDelete(canvasNode.id)}
      accent="#a78bfa"
      selected={selected}
    >
      {src ? (
        <audio controls src={src} className="nodrag nowheel w-full" />
      ) : (
        <div className="text-xs text-muted-foreground">No audio</div>
      )}
    </NodeShell>
  );
});

const VideoLinkNode = memo(function VideoLinkNode({
  data,
  selected,
}: NodeProps<FlowNode>) {
  const { canvasNode, onUpdate, onDelete } = data;
  const label = useNodeField(canvasNode.id, canvasNode.label ?? "", (v) =>
    onUpdate(canvasNode.id, { label: v })
  );
  const url = useNodeField(
    canvasNode.id,
    canvasNode.content.url ?? "",
    (v) =>
      onUpdate(canvasNode.id, {
        content: { ...canvasNode.content, url: v },
      })
  );
  return (
    <NodeShell
      label={label.value}
      onLabelChange={label.onChange}
      onLabelFocus={label.onFocus}
      onLabelBlur={label.onBlur}
      onDelete={() => onDelete(canvasNode.id)}
      accent="#f472b6"
      selected={selected}
    >
      <Input
        value={url.value}
        onChange={(e) => url.onChange(e.target.value)}
        onFocus={url.onFocus}
        onBlur={url.onBlur}
        onPointerDown={stopCanvasPointer}
        onMouseDown={stopCanvasPointer}
        onKeyDown={stopCanvasPointer}
        placeholder="https://…"
        className="nodrag nopan h-8 text-xs"
      />
      {url.value ? (
        <a
          href={url.value}
          target="_blank"
          rel="noreferrer"
          className="nodrag mt-2 block truncate text-xs text-sky-400 hover:underline"
          onPointerDown={stopCanvasPointer}
        >
          Open reference →
        </a>
      ) : null}
    </NodeShell>
  );
});

const MoodNode = memo(function MoodNode({
  data,
  selected,
}: NodeProps<FlowNode>) {
  const { canvasNode, onUpdate, onDelete } = data;
  const label = useNodeField(canvasNode.id, canvasNode.label ?? "", (v) =>
    onUpdate(canvasNode.id, { label: v })
  );
  const mood = useNodeField(
    canvasNode.id,
    canvasNode.content.mood ?? "",
    (v) =>
      onUpdate(canvasNode.id, {
        content: { ...canvasNode.content, mood: v },
      })
  );
  return (
    <NodeShell
      label={label.value}
      onLabelChange={label.onChange}
      onLabelFocus={label.onFocus}
      onLabelBlur={label.onBlur}
      onDelete={() => onDelete(canvasNode.id)}
      accent={canvasNode.content.color || "#34d399"}
      selected={selected}
    >
      <Textarea
        value={mood.value}
        onChange={(e) => mood.onChange(e.target.value)}
        onFocus={mood.onFocus}
        onBlur={mood.onBlur}
        onPointerDown={stopCanvasPointer}
        onMouseDown={stopCanvasPointer}
        onKeyDown={stopCanvasPointer}
        placeholder="Mood / temperature…"
        className="nodrag nopan nowheel min-h-16 resize-none border-0 bg-transparent p-1 text-sm font-medium italic shadow-none focus-visible:ring-0"
      />
    </NodeShell>
  );
});

const nodeTypes = {
  text: TextNode,
  image: ImageNode,
  audio: AudioNode,
  "video-link": VideoLinkNode,
  mood: MoodNode,
};

function toFlowNodes(
  nodes: CanvasNode[],
  onUpdate: (id: string, patch: Partial<CanvasNode>) => void,
  onDelete: (id: string) => void
): FlowNode[] {
  return nodes.map((n) => ({
    id: n.id,
    type: n.type,
    position: { x: n.positionX, y: n.positionY },
    data: { canvasNode: n, onUpdate, onDelete },
  }));
}

function mergeCanvasNode(
  node: CanvasNode,
  patch: Partial<CanvasNode>
): CanvasNode {
  return {
    ...node,
    ...patch,
    content: (patch.content
      ? { ...node.content, ...patch.content }
      : node.content) as CanvasNodeContent,
  };
}

function viewportStorageKey(projectId: string, sceneId: string | null) {
  return `pn:canvas-viewport:${projectId}:${sceneId ?? "project"}`;
}

function loadViewport(
  projectId: string,
  sceneId: string | null
): Viewport | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(viewportStorageKey(projectId, sceneId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Viewport>;
    if (
      typeof parsed.x !== "number" ||
      typeof parsed.y !== "number" ||
      typeof parsed.zoom !== "number"
    ) {
      return null;
    }
    return { x: parsed.x, y: parsed.y, zoom: parsed.zoom };
  } catch {
    return null;
  }
}

function saveViewport(
  projectId: string,
  sceneId: string | null,
  viewport: Viewport
) {
  try {
    localStorage.setItem(
      viewportStorageKey(projectId, sceneId),
      JSON.stringify(viewport)
    );
  } catch {
    // ignore quota / private mode
  }
}

function InstinctCanvasInner({
  projectId,
  sceneId,
  sceneHeading,
  initialNodes,
}: {
  projectId: string;
  sceneId: string | null;
  sceneHeading: string | null;
  initialNodes: CanvasNode[];
}) {
  const { screenToFlowPosition } = useReactFlow();
  const { resolvedTheme } = useTheme();
  const colorMode = resolvedTheme === "light" ? "light" : "dark";
  const [canvasNodes, setCanvasNodes] = useState<CanvasNode[]>(initialNodes);
  const [ready, setReady] = useState(false);
  // Capture once on mount — this component remounts per scene via key
  const [savedViewport] = useState(() => loadViewport(projectId, sceneId));
  const lastViewportRef = useRef<Viewport | null>(savedViewport);
  const viewportSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map()
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingUploadType, setPendingUploadType] = useState<
    "image" | "audio" | null
  >(null);

  // Stable callbacks so flow node `data` identity doesn't churn every render
  const onUpdateRef = useRef<(id: string, patch: Partial<CanvasNode>) => void>(
    () => {}
  );
  const onDeleteRef = useRef<(id: string) => void>(() => {});
  const stableUpdate = useCallback(
    (id: string, patch: Partial<CanvasNode>) => onUpdateRef.current(id, patch),
    []
  );
  const stableDelete = useCallback(
    (id: string) => onDeleteRef.current(id),
    []
  );

  const [nodes, setNodes] = useNodesState(
    toFlowNodes(initialNodes, stableUpdate, stableDelete)
  );

  const syncFlowNodes = useCallback(
    (list: CanvasNode[]) => {
      setNodes(toFlowNodes(list, stableUpdate, stableDelete));
    },
    [setNodes, stableUpdate, stableDelete]
  );

  useEffect(() => {
    setReady(true);
  }, []);

  // Refresh nodes for this scene on mount / scene switch
  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ projectId });
    if (sceneId) params.set("sceneId", sceneId);
    fetch(`/api/canvas?${params}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((list: CanvasNode[] | null) => {
        if (list && !cancelled) {
          setCanvasNodes(list);
          syncFlowNodes(list);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [projectId, sceneId, syncFlowNodes]);

  const persist = useCallback(
    async (id: string, patch: Record<string, unknown>) => {
      await fetch("/api/canvas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
    },
    []
  );

  const schedulePersist = useCallback(
    (id: string, patch: Record<string, unknown>) => {
      const existing = saveTimers.current.get(id);
      if (existing) clearTimeout(existing);
      saveTimers.current.set(
        id,
        setTimeout(() => {
          void persist(id, patch);
          saveTimers.current.delete(id);
        }, 400)
      );
    },
    [persist]
  );

  onUpdateRef.current = (id, patch) => {
    setCanvasNodes((prev) =>
      prev.map((n) => (n.id === id ? mergeCanvasNode(n, patch) : n))
    );
    // Patch only this node's data — never rebuild the whole list (that
    // remounts inputs and steals focus mid-keystroke)
    setNodes((nds) =>
      nds.map((node) =>
        node.id === id
          ? {
              ...node,
              data: {
                ...node.data,
                canvasNode: mergeCanvasNode(node.data.canvasNode, patch),
              },
            }
          : node
      )
    );
    const apiPatch: Record<string, unknown> = {};
    if (patch.content !== undefined) apiPatch.content = patch.content;
    if (patch.label !== undefined) apiPatch.label = patch.label;
    if (patch.positionX !== undefined) apiPatch.positionX = patch.positionX;
    if (patch.positionY !== undefined) apiPatch.positionY = patch.positionY;
    schedulePersist(id, apiPatch);
  };

  onDeleteRef.current = async (id) => {
    setCanvasNodes((prev) => prev.filter((n) => n.id !== id));
    setNodes((nds) => nds.filter((n) => n.id !== id));
    await fetch(`/api/canvas?id=${id}`, { method: "DELETE" });
  };

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => {
      setNodes((nds) => applyNodeChanges(changes, nds) as FlowNode[]);

      for (const change of changes) {
        if (change.type === "position" && change.position && !change.dragging) {
          const { id, position } = change;
          setCanvasNodes((prev) =>
            prev.map((n) =>
              n.id === id
                ? { ...n, positionX: position.x, positionY: position.y }
                : n
            )
          );
          setNodes((nds) =>
            nds.map((node) =>
              node.id === id
                ? {
                    ...node,
                    data: {
                      ...node.data,
                      canvasNode: {
                        ...node.data.canvasNode,
                        positionX: position.x,
                        positionY: position.y,
                      },
                    },
                  }
                : node
            )
          );
          schedulePersist(id, {
            positionX: position.x,
            positionY: position.y,
          });
        }
      }
    },
    [setNodes, schedulePersist]
  );

  const createNode = useCallback(
    async (
      type: CanvasNodeType,
      content: Record<string, unknown>,
      position?: { x: number; y: number }
    ) => {
      const pos = position ?? {
        x: 120 + Math.random() * 200,
        y: 120 + Math.random() * 200,
      };
      const res = await fetch("/api/canvas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          sceneId,
          type,
          content,
          positionX: pos.x,
          positionY: pos.y,
        }),
      });
      const node = (await res.json()) as CanvasNode;
      setCanvasNodes((prev) => [...prev, node]);
      setNodes((nds) => [
        ...nds,
        ...toFlowNodes([node], stableUpdate, stableDelete),
      ]);
      return node;
    },
    [projectId, sceneId, setNodes, stableUpdate, stableDelete]
  );

  const uploadFile = useCallback(
    async (file: File, type: "image" | "audio", position?: { x: number; y: number }) => {
      const form = new FormData();
      form.append("file", file);
      const up = await fetch("/api/upload", { method: "POST", body: form });
      const data = await up.json();
      if (!up.ok) {
        toast.error(data.error || "Upload failed");
        return;
      }
      await createNode(
        type,
        { filePath: data.filePath, mimeType: data.mimeType },
        position
      );
    },
    [createNode]
  );

  const onDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const files = Array.from(e.dataTransfer.files);
      for (const file of files) {
        if (isImageFile(file)) {
          await uploadFile(file, "image", position);
        } else if (file.type.startsWith("audio/")) {
          await uploadFile(file, "audio", position);
        }
      }
      const uri = e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain");
      if (uri && /^https?:\/\//i.test(uri.trim())) {
        await createNode("video-link", { url: uri.trim() }, position);
      }
    },
    [screenToFlowPosition, uploadFile, createNode]
  );

  const onPaste = useCallback(
    async (e: React.ClipboardEvent) => {
      const target = e.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        // Let the field receive the paste; don't spawn a new canvas node.
        return;
      }

      const items = Array.from(e.clipboardData.items);
      for (const item of items) {
        if (item.type.startsWith("image/") || isHeicMime(item.type)) {
          const file = item.getAsFile();
          if (file) await uploadFile(file, "image");
        }
      }
      const text = e.clipboardData.getData("text");
      if (text && /^https?:\/\//i.test(text.trim())) {
        await createNode("video-link", { url: text.trim() });
      }
    },
    [uploadFile, createNode]
  );

  const onViewportChange = useCallback(
    (viewport: Viewport) => {
      lastViewportRef.current = viewport;
      if (viewportSaveTimer.current) clearTimeout(viewportSaveTimer.current);
      viewportSaveTimer.current = setTimeout(() => {
        saveViewport(projectId, sceneId, viewport);
      }, 150);
    },
    [projectId, sceneId]
  );

  useEffect(() => {
    return () => {
      if (viewportSaveTimer.current) clearTimeout(viewportSaveTimer.current);
      if (lastViewportRef.current) {
        saveViewport(projectId, sceneId, lastViewportRef.current);
      }
    };
  }, [projectId, sceneId]);

  const onFilePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && pendingUploadType) {
      await uploadFile(file, pendingUploadType);
    }
    setPendingUploadType(null);
    e.target.value = "";
  };

  const empty = canvasNodes.length === 0;

  if (!ready) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-background text-xs text-muted-foreground">
        Loading canvas…
      </div>
    );
  }

  return (
    <div
      className="relative h-full w-full"
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      onPaste={onPaste}
      tabIndex={0}
    >
      <ReactFlow
        nodes={nodes}
        onNodesChange={onNodesChange}
        nodeTypes={nodeTypes}
        defaultViewport={savedViewport ?? { x: 0, y: 0, zoom: 1 }}
        fitView={!savedViewport}
        fitViewOptions={{ padding: 0.2 }}
        onMoveEnd={(_event, viewport) => onViewportChange(viewport)}
        colorMode={colorMode}
        proOptions={{ hideAttribution: true }}
        className="bg-background"
        nodesDraggable
        elementsSelectable
        deleteKeyCode={null}
      >
        <Background
          gap={20}
          size={1}
          color={colorMode === "light" ? "#d4d4d8" : "#333333"}
        />
        <Controls className="!rounded-md !border !border-border !bg-card !shadow-none !text-foreground" />
      </ReactFlow>

      <div className="absolute left-3 top-3 z-10 flex flex-wrap gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(
              "inline-flex h-7 items-center justify-center gap-1.5 rounded-md border border-transparent bg-primary px-2.5 text-xs font-normal text-primary-foreground hover:bg-primary/90"
            )}
          >
            <Plus className="size-3.5" />
            Add to canvas
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem
              onClick={() => createNode("text", { text: "" })}
            >
              <StickyNote className="size-4" />
              Text note
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                setPendingUploadType("image");
                fileInputRef.current?.click();
              }}
            >
              <ImageIcon className="size-4" />
              Image
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                setPendingUploadType("audio");
                fileInputRef.current?.click();
              }}
            >
              <Mic className="size-4" />
              Audio
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => createNode("video-link", { url: "" })}
            >
              <Link2 className="size-4" />
              Video / reference link
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                createNode("mood", {
                  mood: "",
                  color: "#34d399",
                })
              }
            >
              <Sparkles className="size-4" />
              Mood tag
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept={
            pendingUploadType === "audio"
              ? "audio/*"
              : pendingUploadType === "image"
                ? "image/*,.heic,.heif,image/heic,image/heif"
                : "*/*"
          }
          onChange={onFilePicked}
        />
      </div>

      {sceneHeading ? (
        <div className="pointer-events-none absolute right-3 top-3 z-10 max-w-[55%] truncate rounded-md border border-border bg-card/90 px-2.5 py-1.5 text-xs font-normal tracking-wide text-foreground/90 backdrop-blur-sm">
          {sceneHeading}
        </div>
      ) : null}

      {empty ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="max-w-sm rounded-md border border-dashed border-border bg-card/40 p-6 text-center backdrop-blur">
            <p className="text-sm font-medium">Instinct layer</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Drop images, paste links, or add notes — your raw references for
              the scene. The agent can see everything here.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function InstinctCanvas(props: {
  projectId: string;
  sceneId: string | null;
  sceneHeading: string | null;
  initialNodes: CanvasNode[];
}) {
  return (
    <ReactFlowProvider>
      <InstinctCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
