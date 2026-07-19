"use client";

import { useEffect, useRef, useState } from "react";
import { FileUp, Plus, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Scene, Script } from "@/types";
import { toast } from "sonner";
import { ScreenplayView } from "@/components/scene/screenplay-view";
import { sceneSlugLabel } from "@/lib/schedule";

export function ScenePanel({
  projectId,
  scripts,
  scenes,
  activeScriptId,
  activeSceneId,
  onScriptsChange,
  onScenesChange,
  onActiveScriptChange,
  onActiveSceneChange,
}: {
  projectId: string;
  scripts: Script[];
  scenes: Scene[];
  activeScriptId: string | null;
  activeSceneId: string | null;
  onScriptsChange: (scripts: Script[]) => void;
  onScenesChange: (scenes: Scene[]) => void;
  onActiveScriptChange: (scriptId: string) => void;
  onActiveSceneChange: (sceneId: string) => void;
}) {
  const activeScene = scenes.find((s) => s.id === activeSceneId) ?? null;
  const scriptScenes = activeScriptId
    ? scenes
        .filter((s) => s.scriptId === activeScriptId)
        .sort((a, b) => a.orderIndex - b.orderIndex)
    : [];
  const [text, setText] = useState(activeScene?.rawText ?? "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const addEpisodeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setText(activeScene?.rawText ?? "");
  }, [activeScene?.id, activeScene?.rawText]);

  function mergeScriptScenes(scriptId: string, nextForScript: Scene[]) {
    const others = scenes.filter((s) => s.scriptId !== scriptId);
    onScenesChange([...others, ...nextForScript]);
  }

  async function saveTyped() {
    if (!text.trim()) {
      toast.error("Paste or type a scene first");
      return;
    }
    setSaving(true);
    try {
      if (activeScene) {
        const res = await fetch("/api/scenes", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: activeScene.id, rawText: text }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed");
        onScenesChange(scenes.map((s) => (s.id === data.id ? data : s)));
        toast.success("Scene saved");
      } else if (activeScriptId) {
        const res = await fetch("/api/scenes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            scriptId: activeScriptId,
            rawText: text,
            sourceType: "typed",
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed");
        mergeScriptScenes(activeScriptId, data);
        if (data[0]) onActiveSceneChange(data[0].id);
        toast.success(
          data.length > 1 ? `Split into ${data.length} scenes` : "Scene saved"
        );
      } else {
        const res = await fetch("/api/scripts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            title: "Episode 1",
            rawText: text,
            sourceType: "typed",
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed");
        onScriptsChange([...scripts, data.script]);
        onScenesChange([...scenes, ...data.scenes]);
        onActiveScriptChange(data.script.id);
        if (data.scenes[0]) onActiveSceneChange(data.scenes[0].id);
        toast.success(
          data.scenes.length > 1
            ? `Split into ${data.scenes.length} scenes`
            : "Scene saved"
        );
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save scene");
    } finally {
      setSaving(false);
    }
  }

  async function uploadPdf(file: File, mode: "replace" | "add") {
    if (mode === "replace" && activeScriptId && scriptScenes.length > 0) {
      if (
        !confirm(
          "Replacing this episode’s script removes its scenes and per-scene cheat sheets. Other episodes are kept. Continue?"
        )
      ) {
        return;
      }
    }

    setUploading(true);
    try {
      if (mode === "add" || !activeScriptId) {
        const form = new FormData();
        form.append("projectId", projectId);
        form.append("title", file.name.replace(/\.pdf$/i, ""));
        form.append("file", file);
        const res = await fetch("/api/scripts", { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to parse PDF");
        onScriptsChange([...scripts, data.script]);
        onScenesChange([...scenes, ...data.scenes]);
        onActiveScriptChange(data.script.id);
        if (data.scenes[0]) onActiveSceneChange(data.scenes[0].id);
        toast.success(
          data.scenes.length > 1
            ? `Episode added — ${data.scenes.length} scenes`
            : "Episode added"
        );
      } else {
        const form = new FormData();
        form.append("projectId", projectId);
        form.append("scriptId", activeScriptId);
        form.append("file", file);
        const res = await fetch("/api/scenes", { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to parse PDF");
        mergeScriptScenes(activeScriptId, data);
        if (data[0]) onActiveSceneChange(data[0].id);
        toast.success(
          data.length > 1
            ? `Episode replaced — ${data.length} scenes`
            : "Episode replaced"
        );
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "PDF upload failed");
    } finally {
      setUploading(false);
    }
  }

  const showEpisodePicker = scripts.length > 1;
  const showScenePicker = scriptScenes.length > 1;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {showEpisodePicker || showScenePicker ? (
        <div className="shrink-0 space-y-2 border-b border-border px-3 py-2">
          {showEpisodePicker ? (
            <Select
              value={activeScriptId ?? undefined}
              onValueChange={(v) => {
                if (typeof v === "string" && v) onActiveScriptChange(v);
              }}
            >
              <SelectTrigger className="h-8 w-full text-xs">
                <SelectValue placeholder="Select episode">
                  {(() => {
                    const s = scripts.find((x) => x.id === activeScriptId);
                    return s ? `E${s.episodeNumber} · ${s.title}` : "Select episode";
                  })()}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {scripts.map((s) => (
                  <SelectItem key={s.id} value={s.id} className="text-xs">
                    E{s.episodeNumber} · {s.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          {showScenePicker ? (
            <Select
              value={activeSceneId ?? undefined}
              onValueChange={(v) => {
                if (typeof v === "string" && v) onActiveSceneChange(v);
              }}
            >
              <SelectTrigger className="h-8 w-full text-xs">
                <SelectValue placeholder="Select a scene">
                  {activeScene
                    ? sceneSlugLabel(activeScene)
                    : "Select a scene"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {scriptScenes.map((s) => (
                  <SelectItem key={s.id} value={s.id} className="text-xs">
                    {sceneSlugLabel(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </div>
      ) : null}

      <Tabs
        defaultValue={activeScene ? "view" : "edit"}
        className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden"
      >
        <TabsList className="mx-3 mt-2 w-auto shrink-0 self-start">
          <TabsTrigger value="view">View</TabsTrigger>
          <TabsTrigger value="edit">Edit / Upload</TabsTrigger>
        </TabsList>

        <TabsContent
          value="view"
          className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <ScrollArea className="min-h-0 flex-1">
            <ScreenplayView text={activeScene?.rawText ?? ""} />
          </ScrollArea>
        </TabsContent>

        <TabsContent
          value="edit"
          className="mt-0 flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-3"
        >
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              <FileUp className="size-3.5" />
              {uploading
                ? "Parsing PDF…"
                : activeScriptId
                  ? "Replace episode PDF"
                  : "Upload script PDF"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={uploading}
              onClick={() => addEpisodeRef.current?.click()}
            >
              <Plus className="size-3.5" />
              Add episode PDF
            </Button>
            <Button
              size="sm"
              className="gap-1.5"
              disabled={saving}
              onClick={() => void saveTyped()}
            >
              <Type className="size-3.5" />
              {saving ? "Saving…" : activeScene ? "Save scene" : "Save text"}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadPdf(f, activeScriptId ? "replace" : "add");
                e.target.value = "";
              }}
            />
            <input
              ref={addEpisodeRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadPdf(f, "add");
                e.target.value = "";
              }}
            />
          </div>
          {activeScene && scriptScenes.length > 1 ? (
            <p className="text-[11px] text-muted-foreground">
              Editing scene: {sceneSlugLabel(activeScene)}
            </p>
          ) : null}
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste scene text or a scene summary…"
            className="min-h-0 flex-1 resize-none font-mono text-xs leading-relaxed"
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
