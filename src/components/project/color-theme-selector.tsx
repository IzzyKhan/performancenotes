"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { COLOR_THEMES, getColorTheme, type ColorThemeId } from "@/lib/color-themes";
import type { Project } from "@/types";

/**
 * Small swatch trigger next to the project title. Picking a colour
 * personalises the scene list, header buttons, and footer text, and (for
 * anything but neutral) the scene slug / schedule numbers in exported PDFs.
 */
export function ColorThemeSelector({
  project,
  onProjectChange,
}: {
  project: Project;
  onProjectChange: (project: Project) => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const current = getColorTheme(project.colorTheme);

  async function selectTheme(id: ColorThemeId) {
    setOpen(false);
    if (id === current.id) return;
    const previous = project;
    setSaving(true);
    onProjectChange({ ...project, colorTheme: id });
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ colorTheme: id }),
      });
      const data = (await res.json().catch(() => ({}))) as Project & {
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Failed to save colour theme");
      onProjectChange(data);
    } catch (e) {
      onProjectChange(previous);
      toast.error(e instanceof Error ? e.message : "Failed to save colour theme");
    } finally {
      setSaving(false);
    }
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="shrink-0"
            disabled={saving}
            title={`Accent colour: ${current.label}`}
            aria-label="Choose accent colour"
          />
        }
      >
        <span
          className="size-3 rounded-full ring-1 ring-inset ring-black/15 dark:ring-white/20"
          style={{ backgroundColor: current.hex }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-auto p-2">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="px-0.5 pb-1.5">
            Accent colour
          </DropdownMenuLabel>
          <div className="flex max-w-40 flex-wrap gap-1.5">
            {COLOR_THEMES.map((theme) => (
              <button
                key={theme.id}
                type="button"
                onClick={() => void selectTheme(theme.id)}
                title={theme.label}
                aria-label={theme.label}
                aria-pressed={theme.id === current.id}
                className="flex size-6 items-center justify-center rounded-full ring-1 ring-inset ring-black/15 transition-transform hover:scale-110 dark:ring-white/20"
                style={{ backgroundColor: theme.hex }}
              >
                {theme.id === current.id ? (
                  <Check
                    className="size-3.5 text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)]"
                    strokeWidth={3}
                  />
                ) : null}
              </button>
            ))}
          </div>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
