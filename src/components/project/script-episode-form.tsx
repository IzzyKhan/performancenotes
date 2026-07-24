"use client";

import { FileUp, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type ScriptEpisodeDraft = {
  episodeNumber: number;
  title: string;
  mode: "typed" | "pdf";
  text: string;
  file: File | null;
};

export function ScriptEpisodeForm({
  value,
  onChange,
  disabled,
  showEpisodeNumber = true,
  idPrefix = "script-ep",
}: {
  value: ScriptEpisodeDraft;
  onChange: (patch: Partial<ScriptEpisodeDraft>) => void;
  disabled?: boolean;
  showEpisodeNumber?: boolean;
  idPrefix?: string;
}) {
  return (
    <div className="space-y-3">
      {showEpisodeNumber ? (
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-num`} className="text-xs">
            Episode number
          </Label>
          <Input
            id={`${idPrefix}-num`}
            type="number"
            min={1}
            step={1}
            value={value.episodeNumber}
            disabled={disabled}
            onChange={(e) => {
              const n = Number(e.target.value);
              const episodeNumber = Number.isFinite(n) ? n : value.episodeNumber;
              const nextTitle =
                value.title === `Episode ${value.episodeNumber}` &&
                Number.isFinite(n) &&
                n >= 1
                  ? `Episode ${Math.floor(n)}`
                  : value.title;
              onChange({ episodeNumber, title: nextTitle });
            }}
            className="w-28"
          />
        </div>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-title`} className="text-xs">
          {showEpisodeNumber ? "Episode title" : "Script title"}
        </Label>
        <Input
          id={`${idPrefix}-title`}
          value={value.title}
          disabled={disabled}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder={
            showEpisodeNumber
              ? `Episode ${value.episodeNumber || 1}`
              : "Script title"
          }
        />
      </div>

      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant={value.mode === "pdf" ? "default" : "outline"}
          className="gap-1.5"
          disabled={disabled}
          onClick={() => onChange({ mode: "pdf" })}
        >
          <FileUp className="size-3.5" />
          PDF
        </Button>
        <Button
          type="button"
          size="sm"
          variant={value.mode === "typed" ? "default" : "outline"}
          className="gap-1.5"
          disabled={disabled}
          onClick={() => onChange({ mode: "typed" })}
        >
          <Type className="size-3.5" />
          Paste
        </Button>
      </div>

      {value.mode === "pdf" ? (
        <label className="flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-md border border-dashed border-border px-4 py-6 text-center transition-colors hover:bg-accent/40">
          <FileUp className="size-5 text-muted-foreground" />
          <span className="text-sm font-medium">
            {value.file ? value.file.name : "Choose a PDF"}
          </span>
          <span className="text-xs text-muted-foreground">
            Final Draft–style screenplay PDFs work best
          </span>
          <input
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            disabled={disabled}
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              onChange({
                file: f,
                title:
                  (!value.title.trim() || value.title.startsWith("Episode ")) &&
                  f
                    ? f.name.replace(/\.pdf$/i, "")
                    : value.title,
              });
            }}
          />
        </label>
      ) : (
        <Textarea
          value={value.text}
          disabled={disabled}
          onChange={(e) => onChange({ text: e.target.value })}
          placeholder="Paste episode script text…"
          className="min-h-40 font-mono text-xs"
        />
      )}
    </div>
  );
}
