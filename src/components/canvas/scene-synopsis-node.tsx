"use client";

import { memo, useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import type { Node, NodeProps } from "@xyflow/react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { CanvasNode } from "@/types";
import { cn } from "@/lib/utils";
import { normalizeSceneSynopsisContent } from "@/lib/scene-synopsis";

export type SceneSynopsisFlowData = {
  canvasNode: CanvasNode;
  onUpdate: (id: string, patch: Partial<CanvasNode>) => void;
  onDelete: (id: string) => void;
};

type SceneSynopsisFlowNode = Node<SceneSynopsisFlowData, "scene-synopsis">;

function stopCanvasPointer(e: React.SyntheticEvent) {
  e.stopPropagation();
}

export const SceneSynopsisNode = memo(function SceneSynopsisNode({
  data,
  selected,
}: NodeProps<SceneSynopsisFlowNode>) {
  const { canvasNode, onUpdate, onDelete } = data;
  const content = normalizeSceneSynopsisContent(canvasNode.content);
  const [value, setValue] = useState(content.synopsis);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setValue(content.synopsis);
  }, [content.synopsis, canvasNode.id]);

  const commit = (synopsis: string) => {
    onUpdate(canvasNode.id, {
      content: { synopsis },
    });
  };

  return (
    <div
      className={cn(
        "w-72 rounded-md border border-border bg-card/95 backdrop-blur-sm",
        selected ? "border-foreground/25" : "border-border"
      )}
      style={{ borderTopColor: "#06b6d4", borderTopWidth: 3 }}
    >
      <div className="flex items-center justify-between gap-1 border-b border-border/60 px-2 py-1.5">
        <span className="px-1 text-xs font-medium text-foreground/90">
          Scene synopsis
        </span>
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
      <div className="p-2">
        <Textarea
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            commit(e.target.value);
          }}
          onFocus={() => {
            focused.current = true;
          }}
          onBlur={() => {
            focused.current = false;
            commit(value);
          }}
          onPointerDown={stopCanvasPointer}
          onMouseDown={stopCanvasPointer}
          onKeyDown={stopCanvasPointer}
          placeholder="Short synopsis of what happens in this scene…"
          className="nodrag nopan nowheel min-h-28 resize-none border-0 bg-transparent p-1 text-sm shadow-none focus-visible:ring-0"
        />
      </div>
    </div>
  );
});
