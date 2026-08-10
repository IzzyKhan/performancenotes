"use client";

import { useMemo, useState } from "react";
import { CalendarClock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { computePrepPace } from "@/lib/prep-pace";
import type { Project, Scene } from "@/types";

export function PrepPaceDialog({
  project,
  scenes,
  onProjectChange,
  open: openProp,
  onOpenChange,
}: {
  project: Project;
  scenes: Scene[];
  onProjectChange: (project: Project) => void;
  /** Optional controlled open state, so e.g. the status bar can open it. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = openProp ?? uncontrolledOpen;
  function setOpen(next: boolean) {
    if (openProp === undefined) setUncontrolledOpen(next);
    onOpenChange?.(next);
  }
  const [prepStartDate, setPrepStartDate] = useState(
    project.prepStartDate ?? ""
  );
  const [shootStartDate, setShootStartDate] = useState(
    project.shootStartDate ?? ""
  );
  const [techRecceDate, setTechRecceDate] = useState(
    project.techRecceDate ?? ""
  );
  const [prepEndBeforeTechRecce, setPrepEndBeforeTechRecce] = useState(
    project.prepEndBeforeTechRecce
  );
  const [prepDaysPerWeek, setPrepDaysPerWeek] = useState(
    String(project.prepDaysPerWeek || 5)
  );
  const [saving, setSaving] = useState(false);

  function syncFromProject(p: Project) {
    setPrepStartDate(p.prepStartDate ?? "");
    setShootStartDate(p.shootStartDate ?? "");
    setTechRecceDate(p.techRecceDate ?? "");
    setPrepEndBeforeTechRecce(p.prepEndBeforeTechRecce);
    setPrepDaysPerWeek(String(p.prepDaysPerWeek || 5));
  }

  const preppedScenes = scenes.filter((s) => s.prepped).length;
  const pace = useMemo(
    () =>
      computePrepPace({
        prepStartDate: prepStartDate || null,
        shootStartDate: shootStartDate || null,
        techRecceDate: techRecceDate || null,
        prepEndBeforeTechRecce,
        prepDaysPerWeek: Number(prepDaysPerWeek) || 5,
        totalScenes: scenes.length,
        preppedScenes,
      }),
    [
      prepStartDate,
      shootStartDate,
      techRecceDate,
      prepEndBeforeTechRecce,
      prepDaysPerWeek,
      scenes.length,
      preppedScenes,
    ]
  );

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prepStartDate: prepStartDate.trim() || null,
          shootStartDate: shootStartDate.trim() || null,
          techRecceDate: techRecceDate.trim() || null,
          prepEndBeforeTechRecce,
          prepDaysPerWeek: Number(prepDaysPerWeek) || 5,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as Project & {
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Failed to save prep pace");
      onProjectChange(data);
      syncFromProject(data);
      toast.success("Prep pace saved");
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save prep pace");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) syncFromProject(project);
      }}
    >
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
        <CalendarClock className="size-4 stroke-[1.5]" />
        <span className="hidden sm:inline">Prep pace</span>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Prep pace</DialogTitle>
          <DialogDescription>
            Set when prep and principal photography start, then tick scenes off
            in the scene list. Optionally finish prep by the day before tech
            recce instead of shoot start.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="prep-start" className="text-xs text-muted-foreground">
                Prep start
              </Label>
              <Input
                id="prep-start"
                type="date"
                value={prepStartDate}
                onChange={(e) => setPrepStartDate(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="shoot-start" className="text-xs text-muted-foreground">
                Shoot start
              </Label>
              <Input
                id="shoot-start"
                type="date"
                value={shootStartDate}
                onChange={(e) => setShootStartDate(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tech-recce" className="text-xs text-muted-foreground">
              Tech recce
            </Label>
            <Input
              id="tech-recce"
              type="date"
              value={techRecceDate}
              onChange={(e) => setTechRecceDate(e.target.value)}
              className="h-8 text-xs"
            />
          </div>

          <label className="flex cursor-pointer items-start gap-2.5 rounded-md border border-border bg-muted/20 px-3 py-2.5">
            <input
              type="checkbox"
              checked={prepEndBeforeTechRecce}
              onChange={(e) => setPrepEndBeforeTechRecce(e.target.checked)}
              className="mt-0.5 size-3.5 shrink-0 rounded border-border accent-foreground"
            />
            <span className="text-xs leading-relaxed text-muted-foreground">
              Finish prep the day before tech recce
              <span className="mt-0.5 block text-[11px] text-muted-foreground/80">
                When off, prep runs through the day before shoot start.
              </span>
            </span>
          </label>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              Prep days per week
            </Label>
            <Select
              value={prepDaysPerWeek}
              onValueChange={(v) => {
                if (typeof v === "string" && v) setPrepDaysPerWeek(v);
              }}
            >
              <SelectTrigger className="h-8 w-full text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                  <SelectItem key={n} value={String(n)} className="text-xs">
                    {n} day{n === 1 ? "" : "s"} / week
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-md border border-border bg-muted/40 px-3 py-2.5">
            <p className="text-xs font-medium text-foreground">
              {preppedScenes} of {scenes.length}{" "}
              {scenes.length === 1 ? "scene" : "scenes"} prepped
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              {pace.summary}
            </p>
            {pace.scenesPerDay != null &&
            (pace.status === "in_progress" || pace.status === "not_started") ? (
              <p className="mt-2 text-sm font-medium tabular-nums text-foreground">
                {pace.scenesPerDay.toFixed(1).replace(/\.0$/, "")} scenes/day
              </p>
            ) : null}
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={saving}
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="accent"
            size="sm"
            disabled={saving}
            onClick={() => void save()}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
