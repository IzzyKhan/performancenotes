import { NextResponse } from "next/server";
import { extractPdfTextWithLines } from "@/lib/pdf";
import { requireProjectAccess } from "@/lib/auth-guard";
import { parseMultipartForm } from "@/lib/multipart";
import {
  createScriptWithScenes,
  listScriptsForProject,
} from "@/lib/scripts";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
  }

  const access = await requireProjectAccess(projectId);
  if ("error" in access) return access.error;

  return NextResponse.json(listScriptsForProject(projectId));
}

/**
 * Add a script (episode) to a project. Accepts JSON
 * { projectId, title?, episodeNumber?, rawText, sourceType? }
 * or multipart { projectId, title?, episodeNumber?, file }.
 */
export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") || "";

    let projectId: string;
    let title: string;
    let episodeNumber: number | undefined;
    let rawText: string;
    let sourceType: "pdf" | "typed";

    if (contentType.includes("multipart/form-data")) {
      const formOrErr = await parseMultipartForm(request);
      if (formOrErr instanceof NextResponse) return formOrErr;
      const form = formOrErr;
      projectId = String(form.get("projectId") || "");
      title = String(form.get("title") || "").trim();
      const epRaw = String(form.get("episodeNumber") || "").trim();
      episodeNumber = epRaw ? Number(epRaw) : undefined;
      const file = form.get("file");

      if (!projectId || !(file instanceof File)) {
        return NextResponse.json(
          { error: "projectId and PDF file are required" },
          { status: 400 }
        );
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      try {
        rawText = await extractPdfTextWithLines(new Uint8Array(buffer));
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "PDF parse failed";
        return NextResponse.json(
          {
            error: `Could not read that PDF (${message}). Try a smaller file or paste text instead.`,
          },
          { status: 400 }
        );
      }
      sourceType = "pdf";
      if (!title) {
        title = file.name.replace(/\.pdf$/i, "").trim() || "Episode";
      }

      if (!rawText) {
        return NextResponse.json(
          { error: "Could not extract text from PDF" },
          { status: 400 }
        );
      }
    } else {
      const body = await request.json();
      projectId = body.projectId;
      title = typeof body.title === "string" ? body.title.trim() : "";
      episodeNumber =
        typeof body.episodeNumber === "number"
          ? body.episodeNumber
          : typeof body.episodeNumber === "string" && body.episodeNumber.trim()
            ? Number(body.episodeNumber)
            : undefined;
      rawText = (body.rawText as string)?.trim();
      sourceType = body.sourceType === "pdf" ? "pdf" : "typed";

      if (!projectId || !rawText) {
        return NextResponse.json(
          { error: "projectId and rawText are required" },
          { status: 400 }
        );
      }
    }

    const access = await requireProjectAccess(projectId);
    if ("error" in access) return access.error;

    const result = createScriptWithScenes({
      projectId,
      title,
      rawText,
      sourceType,
      episodeNumber:
        typeof episodeNumber === "number" && !Number.isNaN(episodeNumber)
          ? episodeNumber
          : undefined,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to add script";
    console.error("[api/scripts POST]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
