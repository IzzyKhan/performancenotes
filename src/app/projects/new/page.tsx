"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Clapperboard, FileUp, Plus, Trash2, Type, Tv } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { fileWithSafeName } from "@/lib/multipart";
import { ThemeToggle } from "@/components/theme-toggle";

type ProjectKind = "single" | "series";

type ScriptDraft = {
  key: string;
  episodeNumber: number;
  title: string;
  mode: "typed" | "pdf";
  text: string;
  file: File | null;
};

function emptyDraft(index: number): ScriptDraft {
  return {
    key: `draft-${Date.now()}-${index}`,
    episodeNumber: index + 1,
    title: `Episode ${index + 1}`,
    mode: "pdf",
    text: "",
    file: null,
  };
}

async function readJson(res: Response): Promise<Record<string, unknown> & { id?: string; error?: string }> {
  const text = await res.text();
  if (!text) {
    throw new Error(
      `Server returned an empty response (HTTP ${res.status}). Check Railway logs — often a crash parsing a large PDF or a missing AUTH_SECRET.`
    );
  }
  try {
    return JSON.parse(text) as Record<string, unknown> & {
      id?: string;
      error?: string;
    };
  } catch {
    throw new Error(
      `Server returned a non-JSON response (HTTP ${res.status}). Check Railway deploy logs.`
    );
  }
}

function networkErrorMessage(label: string, file?: File | null): string {
  const size =
    file && file.size > 0
      ? ` (${(file.size / 1024 / 1024).toFixed(1)} MB)`
      : "";
  return `${label} failed — connection lost or timed out${size}. Try uploading one episode at a time, or use a smaller PDF. Check Railway logs if this keeps happening.`;
}

async function postJson(url: string, body: unknown, label: string) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await readJson(res);
    if (!res.ok) {
      throw new Error(
        typeof data.error === "string" ? data.error : `${label} failed (HTTP ${res.status})`
      );
    }
    return data;
  } catch (e) {
    if (e instanceof TypeError) {
      throw new Error(networkErrorMessage(label));
    }
    throw e;
  }
}

async function listProjectScripts(projectId: string) {
  const res = await fetch(`/api/scripts?projectId=${projectId}`, {
    cache: "no-store",
  });
  if (!res.ok) return [] as { episodeNumber?: number; title?: string }[];
  return (await res.json()) as { episodeNumber?: number; title?: string }[];
}

async function uploadScriptPdf(
  projectId: string,
  epNum: number,
  scriptTitle: string,
  file: File
): Promise<{ sceneCount?: number }> {
  const form = new FormData();
  form.append("projectId", projectId);
  form.append("title", scriptTitle);
  form.append("episodeNumber", String(epNum));
  form.append("file", fileWithSafeName(file));

  try {
    const res = await fetch("/api/scripts", { method: "POST", body: form });
    const data = await readJson(res);
    if (!res.ok) {
      throw new Error(
        typeof data.error === "string"
          ? data.error
          : `PDF upload failed (HTTP ${res.status})`
      );
    }
    return data as { sceneCount?: number };
  } catch (e) {
    const scripts = await listProjectScripts(projectId);
    const recovered = scripts.some(
      (s) =>
        s.episodeNumber === epNum ||
        (s.title &&
          s.title.toLowerCase() === scriptTitle.toLowerCase())
    );
    if (recovered) return {};
    if (e instanceof TypeError) {
      throw new Error(networkErrorMessage(`PDF upload for ${scriptTitle}`, file));
    }
    throw e;
  }
}

export default function NewProjectPage() {
  const router = useRouter();
  const [kind, setKind] = useState<ProjectKind | null>(null);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [drafts, setDrafts] = useState<ScriptDraft[]>([emptyDraft(0)]);

  function updateDraft(key: string, patch: Partial<ScriptDraft>) {
    setDrafts((prev) =>
      prev.map((d) => (d.key === key ? { ...d, ...patch } : d))
    );
  }

  function removeDraft(key: string) {
    setDrafts((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((d) => d.key !== key);
    });
  }

  function chooseKind(next: ProjectKind) {
    setKind(next);
    if (next === "single") {
      setDrafts([emptyDraft(0)]);
    } else if (drafts.length === 0) {
      setDrafts([emptyDraft(0)]);
    }
  }

  async function createProject() {
    if (!title.trim()) {
      toast.error("Add a project title");
      return;
    }

    const ready =
      kind === "series"
        ? drafts.filter(
            (d) =>
              (d.mode === "typed" && d.text.trim()) ||
              (d.mode === "pdf" && d.file)
          )
        : [];

    setLoading(true);
    let projectId: string | null = null;
    try {
      const project = await postJson(
        "/api/projects",
        { title: title.trim() },
        "Create project"
      );
      if (typeof project.id !== "string") {
        throw new Error("Create project did not return an id");
      }
      projectId = project.id;

      if (kind === "series" && ready.length > 0) {
        for (let i = 0; i < ready.length; i++) {
          const d = ready[i];
          const epNum =
            Number.isFinite(d.episodeNumber) && d.episodeNumber >= 1
              ? Math.floor(d.episodeNumber)
              : i + 1;
          const scriptTitle =
            d.title.trim() ||
            (d.file ? d.file.name.replace(/\.pdf$/i, "") : `Episode ${epNum}`);

          const progress = toast.loading(
            `Uploading episode ${i + 1} of ${ready.length}: ${scriptTitle}…`
          );

          try {
            if (d.mode === "pdf" && d.file) {
              const data = await uploadScriptPdf(
                projectId,
                epNum,
                scriptTitle,
                d.file
              );
              toast.success(
                typeof data.sceneCount === "number" && data.sceneCount > 0
                  ? `Episode ${epNum} uploaded (${data.sceneCount} scenes)`
                  : `Episode ${epNum} uploaded`,
                { id: progress }
              );
            } else {
              await postJson(
                "/api/scripts",
                {
                  projectId,
                  title: scriptTitle,
                  episodeNumber: epNum,
                  rawText: d.text.trim(),
                  sourceType: "typed",
                },
                `Failed to add ${scriptTitle}`
              );
              toast.success(`Episode ${epNum} uploaded`, { id: progress });
            }
          } catch (e) {
            toast.dismiss(progress);
            throw e;
          }
        }
      }

      router.push(`/projects/${projectId}`);
    } catch (e) {
      if (projectId) {
        const scripts = await listProjectScripts(projectId);
        if (scripts.length > 0) {
          toast.warning(
            "Upload interrupted — opening project with the scripts that saved."
          );
          router.push(`/projects/${projectId}`);
          return;
        }
        await fetch(`/api/projects?id=${projectId}`, {
          method: "DELETE",
        }).catch(() => {});
      }
      toast.error(e instanceof Error ? e.message : "Could not create project");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-dvh bg-background">
      <div className="mx-auto max-w-2xl px-4 py-10">
        <div className="mb-6 flex items-center justify-between gap-2">
          <Link
            href="/"
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "gap-1.5"
            )}
          >
            <ArrowLeft className="size-3.5" />
            Back
          </Link>
          <ThemeToggle />
        </div>

        <h1 className="text-2xl font-medium tracking-tight">New project</h1>
        <p className="mt-1.5 text-sm font-normal text-muted-foreground">
          {kind === null
            ? "Start with the shape of the project — one script, or a series block."
            : kind === "single"
              ? "Name the project, then upload or paste the script inside the workspace."
              : "Name the series block and add episodes now, or leave them empty and upload later."}
        </p>

        <div className="mt-8 space-y-6">
          <div className="space-y-2">
            <Label>Project type</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => chooseKind("single")}
                className={cn(
                  "flex flex-col items-start gap-1 rounded-md border px-3 py-3 text-left transition-colors",
                  kind === "single"
                    ? "border-foreground bg-accent/50"
                    : "border-border hover:bg-accent/40"
                )}
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  <Clapperboard className="size-3.5 stroke-[1.5] text-muted-foreground" />
                  Single script
                </span>
                <span className="text-xs font-normal text-muted-foreground">
                  Feature, short film, or one-off scene
                </span>
              </button>
              <button
                type="button"
                onClick={() => chooseKind("series")}
                className={cn(
                  "flex flex-col items-start gap-1 rounded-md border px-3 py-3 text-left transition-colors",
                  kind === "series"
                    ? "border-foreground bg-accent/50"
                    : "border-border hover:bg-accent/40"
                )}
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  <Tv className="size-3.5 stroke-[1.5] text-muted-foreground" />
                  Series / multi-script
                </span>
                <span className="text-xs font-normal text-muted-foreground">
                  Episodes with numbers and titles
                </span>
              </button>
            </div>
          </div>

          {kind ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="title">Project title</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={
                    kind === "single"
                      ? "e.g. Kitchen Midnight"
                      : "e.g. Series X — Block 2"
                  }
                  autoFocus
                />
              </div>

              {kind === "series" ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <Label>Scripts / episodes</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() =>
                        setDrafts((prev) => {
                          const maxEp = Math.max(
                            0,
                            ...prev.map((d) => d.episodeNumber || 0)
                          );
                          const next = maxEp + 1;
                          return [
                            ...prev,
                            {
                              ...emptyDraft(prev.length),
                              episodeNumber: next,
                              title: `Episode ${next}`,
                            },
                          ];
                        })
                      }
                    >
                      <Plus className="size-3.5" />
                      Add episode
                    </Button>
                  </div>

                  {drafts.map((d, i) => (
                    <div
                      key={d.key}
                      className="space-y-3 rounded-md border border-border p-3"
                    >
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1 space-y-3">
                          <div className="space-y-2">
                            <Label htmlFor={`ep-num-${d.key}`} className="text-xs">
                              Episode number
                            </Label>
                            <Input
                              id={`ep-num-${d.key}`}
                              type="number"
                              min={1}
                              step={1}
                              value={d.episodeNumber}
                              onChange={(e) => {
                                const n = Number(e.target.value);
                                updateDraft(d.key, {
                                  episodeNumber: Number.isFinite(n)
                                    ? n
                                    : d.episodeNumber,
                                  title:
                                    d.title === `Episode ${d.episodeNumber}` ||
                                    d.title === `Episode ${i + 1}`
                                      ? `Episode ${
                                          Number.isFinite(n) && n >= 1
                                            ? Math.floor(n)
                                            : d.episodeNumber
                                        }`
                                      : d.title,
                                });
                              }}
                              className="w-28"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label
                              htmlFor={`ep-title-${d.key}`}
                              className="text-xs"
                            >
                              Episode title
                            </Label>
                            <Input
                              id={`ep-title-${d.key}`}
                              value={d.title}
                              onChange={(e) =>
                                updateDraft(d.key, { title: e.target.value })
                              }
                              placeholder={`Episode ${d.episodeNumber || i + 1}`}
                            />
                          </div>
                        </div>
                        {drafts.length > 1 ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="mt-6 text-muted-foreground"
                            onClick={() => removeDraft(d.key)}
                            title="Remove episode"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        ) : null}
                      </div>

                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant={d.mode === "pdf" ? "default" : "outline"}
                          className="gap-1.5"
                          onClick={() => updateDraft(d.key, { mode: "pdf" })}
                        >
                          <FileUp className="size-3.5" />
                          PDF
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={d.mode === "typed" ? "default" : "outline"}
                          className="gap-1.5"
                          onClick={() => updateDraft(d.key, { mode: "typed" })}
                        >
                          <Type className="size-3.5" />
                          Paste
                        </Button>
                      </div>

                      {d.mode === "pdf" ? (
                        <label className="flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-md border border-dashed border-border px-4 py-6 text-center transition-colors hover:bg-accent/40">
                          <FileUp className="size-5 text-muted-foreground" />
                          <span className="text-sm font-medium">
                            {d.file ? d.file.name : "Choose a PDF"}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            Final Draft–style screenplay PDFs work best
                          </span>
                          <input
                            type="file"
                            accept="application/pdf,.pdf"
                            className="hidden"
                            disabled={loading}
                            onChange={(e) => {
                              const f = e.target.files?.[0] ?? null;
                              updateDraft(d.key, {
                                file: f,
                                title:
                                  d.title.startsWith("Episode ") && f
                                    ? f.name.replace(/\.pdf$/i, "")
                                    : d.title,
                              });
                            }}
                          />
                        </label>
                      ) : (
                        <Textarea
                          value={d.text}
                          onChange={(e) =>
                            updateDraft(d.key, { text: e.target.value })
                          }
                          placeholder="Paste episode script text…"
                          className="min-h-40 font-mono text-xs"
                        />
                      )}
                    </div>
                  ))}
                </div>
              ) : null}

              <Button disabled={loading} onClick={() => void createProject()}>
                {loading ? "Creating…" : "Create project"}
              </Button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
