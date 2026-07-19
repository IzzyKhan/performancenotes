import { NextResponse } from "next/server";
import { extractPdfTextWithLines } from "@/lib/pdf";
import { requireProjectAccess } from "@/lib/auth-guard";
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
  const contentType = request.headers.get("content-type") || "";

  let projectId: string;
  let title: string;
  let episodeNumber: number | undefined;
  let rawText: string;
  let sourceType: "pdf" | "typed";

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
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
    rawText = await extractPdfTextWithLines(new Uint8Array(buffer));
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
}
