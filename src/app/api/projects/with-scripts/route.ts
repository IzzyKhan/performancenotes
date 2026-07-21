import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { extractPdfTextWithLines } from "@/lib/pdf";
import { db } from "@/db";
import {
  projects,
  scripts,
  scenes,
  cheatSheets,
  canvasNodes,
  chatMessages,
} from "@/db/schema";
import { createId, nowIso } from "@/lib/id";
import { parseMultipartForm } from "@/lib/multipart";
import { authRequired, requireUser } from "@/lib/auth-guard";
import { createScriptWithScenes } from "@/lib/scripts";

export const runtime = "nodejs";
/** Multiple large PDFs in one request — allow several minutes on Railway. */
export const maxDuration = 300;

type EpisodeInput =
  | {
      episodeNumber: number;
      title: string;
      mode: "pdf";
      fileIndex: number;
    }
  | {
      episodeNumber: number;
      title: string;
      mode: "typed";
      rawText: string;
    };

function deleteProjectCascade(projectId: string) {
  db.delete(chatMessages).where(eq(chatMessages.projectId, projectId)).run();
  db.delete(canvasNodes).where(eq(canvasNodes.projectId, projectId)).run();
  db.delete(cheatSheets).where(eq(cheatSheets.projectId, projectId)).run();
  db.delete(scenes).where(eq(scenes.projectId, projectId)).run();
  db.delete(scripts).where(eq(scripts.projectId, projectId)).run();
  db.delete(projects).where(eq(projects.id, projectId)).run();
}

export async function POST(request: Request) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const formOrErr = await parseMultipartForm(request);
  if (formOrErr instanceof NextResponse) return formOrErr;
  const form = formOrErr;

  const title = String(form.get("title") || "").trim() || "Untitled Project";
  const episodesRaw = String(form.get("episodes") || "").trim();
  if (!episodesRaw) {
    return NextResponse.json({ error: "Missing episodes payload" }, { status: 400 });
  }

  let episodes: EpisodeInput[];
  try {
    episodes = JSON.parse(episodesRaw) as EpisodeInput[];
  } catch {
    return NextResponse.json({ error: "Invalid episodes JSON" }, { status: 400 });
  }

  if (!Array.isArray(episodes) || episodes.length === 0) {
    return NextResponse.json(
      { error: "Add at least one episode" },
      { status: 400 }
    );
  }

  const projectId = createId("proj");
  const project = {
    id: projectId,
    userId: authRequired() ? authResult.user.id : null,
    title,
    createdAt: nowIso(),
  };

  db.insert(projects).values(project).run();

  const results: {
    episodeNumber: number;
    title: string;
    sceneCount: number;
  }[] = [];

  try {
    for (let i = 0; i < episodes.length; i++) {
      const ep = episodes[i];
      const epNum =
        Number.isFinite(ep.episodeNumber) && ep.episodeNumber >= 1
          ? Math.floor(ep.episodeNumber)
          : i + 1;
      const scriptTitle = ep.title?.trim() || `Episode ${epNum}`;

      if (ep.mode === "pdf") {
        const file = form.get(`file_${ep.fileIndex}`);
        if (!(file instanceof File)) {
          throw new Error(`Missing PDF for episode ${epNum}`);
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const started = Date.now();
        let rawText: string;
        try {
          rawText = await extractPdfTextWithLines(new Uint8Array(buffer));
        } catch (err) {
          const message = err instanceof Error ? err.message : "PDF parse failed";
          throw new Error(
            `Could not read PDF for episode ${epNum} (${message})`
          );
        }
        console.info(
          `[api/projects/with-scripts] PDF extracted E${epNum} ${scriptTitle}: ${(buffer.length / 1024 / 1024).toFixed(1)}MB, ${Date.now() - started}ms`
        );

        if (!rawText.trim()) {
          throw new Error(`Could not extract text from PDF for episode ${epNum}`);
        }

        const saveStarted = Date.now();
        const { sceneCount } = createScriptWithScenes({
          projectId,
          title: scriptTitle,
          rawText,
          sourceType: "pdf",
          episodeNumber: epNum,
        });
        console.info(
          `[api/projects/with-scripts] Saved E${epNum}: ${sceneCount} scenes, ${Date.now() - saveStarted}ms`
        );
        results.push({ episodeNumber: epNum, title: scriptTitle, sceneCount });
      } else {
        const rawText = ep.rawText?.trim();
        if (!rawText) {
          throw new Error(`Episode ${epNum} has no script text`);
        }
        const { sceneCount } = createScriptWithScenes({
          projectId,
          title: scriptTitle,
          rawText,
          sourceType: "typed",
          episodeNumber: epNum,
        });
        results.push({ episodeNumber: epNum, title: scriptTitle, sceneCount });
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to import episodes";
    console.error("[api/projects/with-scripts]", err);
    try {
      deleteProjectCascade(projectId);
    } catch (cleanupErr) {
      console.error("[api/projects/with-scripts] cleanup failed", cleanupErr);
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return NextResponse.json(
    { id: projectId, title: project.title, episodes: results },
    {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    }
  );
}
