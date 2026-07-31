"use client";

import { memo } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { Node, NodeProps } from "@xyflow/react";
import { NodeResizer } from "@xyflow/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type {
  CanvasNode,
  PerformanceNotesBeat,
  PerformanceNotesContent,
} from "@/types";
import { cn } from "@/lib/utils";
import {
  emptyPerformanceBeat,
  emptyPerformanceCharacter,
  normalizePerformanceNotesContent,
} from "@/lib/performance-notes";

export type PerformanceNotesFlowData = {
  canvasNode: CanvasNode;
  onUpdate: (id: string, patch: Partial<CanvasNode>) => void;
  onDelete: (id: string) => void;
};

type PerformanceNotesFlowNode = Node<
  PerformanceNotesFlowData,
  "performance-notes"
>;

function stopCanvasPointer(e: React.SyntheticEvent) {
  e.stopPropagation();
}

export const PerformanceNotesNode = memo(function PerformanceNotesNode({
  data,
  selected,
}: NodeProps<PerformanceNotesFlowNode>) {
  const { canvasNode, onUpdate, onDelete } = data;
  const content = normalizePerformanceNotesContent(canvasNode.content);

  const commit = (next: PerformanceNotesContent) => {
    onUpdate(canvasNode.id, {
      content: next as unknown as CanvasNode["content"],
      label: next.title,
    });
  };

  const updateBeat = (
    beatId: string,
    patch: Partial<PerformanceNotesBeat>
  ) => {
    commit({
      ...content,
      beats: content.beats.map((b) =>
        b.id === beatId ? { ...b, ...patch } : b
      ),
    });
  };

  const updateCharacter = (
    beatId: string,
    charId: string,
    patch: Partial<PerformanceNotesBeat["characters"][0]>
  ) => {
    commit({
      ...content,
      beats: content.beats.map((b) =>
        b.id === beatId
          ? {
              ...b,
              characters: b.characters.map((c) =>
                c.id === charId ? { ...c, ...patch } : c
              ),
            }
          : b
      ),
    });
  };

  const addBeat = () => {
    commit({
      ...content,
      beats: [...content.beats, emptyPerformanceBeat(content.beats.length + 1)],
    });
  };

  const addCharacter = (beatId: string) => {
    commit({
      ...content,
      beats: content.beats.map((b) =>
        b.id === beatId
          ? { ...b, characters: [...b.characters, emptyPerformanceCharacter()] }
          : b
      ),
    });
  };

  const removeCharacter = (beatId: string, charId: string) => {
    const beat = content.beats.find((b) => b.id === beatId);
    if (!beat) return;
    const nextChars = beat.characters.filter((c) => c.id !== charId);
    if (nextChars.length === 0) {
      removeBeat(beatId);
      return;
    }
    updateBeat(beatId, { characters: nextChars });
  };

  const removeBeat = (beatId: string) => {
    const next =
      content.beats.length <= 1
        ? [emptyPerformanceBeat(1)]
        : content.beats.filter((b) => b.id !== beatId);
    commit({ ...content, beats: next });
  };

  return (
    <div
      className={cn(
        "relative flex h-full min-h-[12rem] flex-col rounded-md border border-border bg-card/95 backdrop-blur-sm",
        selected ? "border-foreground/25" : "border-border"
      )}
      style={{
        borderTopColor: "#8b5cf6",
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
      <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
        <Input
          value={content.title}
          onChange={(e) => commit({ ...content, title: e.target.value })}
          onPointerDown={stopCanvasPointer}
          onMouseDown={stopCanvasPointer}
          placeholder="Performance notes title…"
          className="nodrag nopan h-7 flex-1 border-0 bg-transparent px-1 text-xs font-medium shadow-none focus-visible:ring-0"
        />
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

      <div className="nodrag nopan nowheel min-h-0 flex-1 overflow-auto p-2">
        <table className="w-full min-w-[32rem] border-collapse rounded-sm border border-border text-[11px]">
          <thead>
            <tr>
              <th className="w-[18%] border-b-2 border-r border-border bg-muted/60 px-1.5 py-1.5 text-left text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Beat
              </th>
              <th className="w-[16%] border-b-2 border-r border-border bg-muted/60 px-1.5 py-1.5 text-left text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Character
              </th>
              <th className="w-[33%] border-b-2 border-r border-border bg-muted/60 px-1.5 py-1.5 text-left text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Objectives
              </th>
              <th className="w-[28%] border-b-2 border-r border-border bg-muted/60 px-1.5 py-1.5 text-left text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Actions
              </th>
              <th className="w-8 border-b-2 border-border bg-muted/60" />
            </tr>
          </thead>
          <tbody>
            {content.beats.map((beat, beatIndex) =>
              beat.characters.map((ch, ci) => (
                <tr
                  key={ch.id}
                  className={cn(
                    "align-top border-b border-border",
                    ci === 0 &&
                      beatIndex > 0 &&
                      "border-t-1.5 border-t-foreground/25"
                  )}
                >
                  {ci === 0 ? (
                    <td
                      rowSpan={beat.characters.length}
                      className="border-r border-border bg-muted/20 px-1.5 py-1.5 align-top"
                    >
                      <Textarea
                        value={beat.beat}
                        onChange={(e) =>
                          updateBeat(beat.id, { beat: e.target.value })
                        }
                        onPointerDown={stopCanvasPointer}
                        onMouseDown={stopCanvasPointer}
                        placeholder="Beat…"
                        rows={2}
                        className="nodrag nopan min-h-[2.5rem] resize-none border-0 bg-transparent p-0 text-[11px] shadow-none focus-visible:ring-0"
                      />
                      <div className="mt-1 flex flex-wrap gap-0.5">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="nodrag h-6 px-1.5 text-[10px]"
                          onClick={() => addCharacter(beat.id)}
                          onPointerDown={stopCanvasPointer}
                        >
                          <Plus className="mr-0.5 size-3" />
                          Character
                        </Button>
                        {content.beats.length > 1 ||
                        beat.characters.length > 1 ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="nodrag h-6 px-1 text-muted-foreground hover:text-destructive"
                            onClick={() => removeBeat(beat.id)}
                            onPointerDown={stopCanvasPointer}
                          >
                            <Trash2 className="size-3" />
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  ) : null}
                  <td className="border-r border-border px-1.5 py-1">
                    <Input
                      value={ch.character}
                      onChange={(e) =>
                        updateCharacter(beat.id, ch.id, {
                          character: e.target.value,
                        })
                      }
                      onPointerDown={stopCanvasPointer}
                      onMouseDown={stopCanvasPointer}
                      placeholder="Name…"
                      className="nodrag nopan h-7 border-border/80 bg-background text-[11px]"
                    />
                  </td>
                  <td className="border-r border-border px-1.5 py-1">
                    <Textarea
                      value={ch.objectives}
                      onChange={(e) =>
                        updateCharacter(beat.id, ch.id, {
                          objectives: e.target.value,
                        })
                      }
                      onPointerDown={stopCanvasPointer}
                      onMouseDown={stopCanvasPointer}
                      placeholder="Objective…"
                      rows={2}
                      className="nodrag nopan min-h-[2rem] resize-none border-border/80 bg-background text-[11px]"
                    />
                  </td>
                  <td className="border-r border-border px-1.5 py-1">
                    <Textarea
                      value={ch.actions}
                      onChange={(e) =>
                        updateCharacter(beat.id, ch.id, {
                          actions: e.target.value,
                        })
                      }
                      onPointerDown={stopCanvasPointer}
                      onMouseDown={stopCanvasPointer}
                      placeholder="Verbs…"
                      rows={2}
                      className="nodrag nopan min-h-[2rem] resize-none border-border/80 bg-background text-[11px]"
                    />
                  </td>
                  <td className="px-0.5 py-1 align-top">
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      className="nodrag h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => removeCharacter(beat.id, ch.id)}
                      onPointerDown={stopCanvasPointer}
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="border-t border-border px-2 py-1.5">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="nodrag h-7 gap-1 text-[11px]"
          onClick={addBeat}
          onPointerDown={stopCanvasPointer}
        >
          <Plus className="size-3" />
          Add beat
        </Button>
      </div>
    </div>
  );
});
