import { NextResponse } from "next/server";
import { requireProjectAccess } from "@/lib/auth-guard";
import { checkScriptCreateAllowed } from "@/lib/entitlement-guard";
import { parseSceneSlugList } from "@/lib/scene-slug";
import {
  createScriptWithSceneSlugs,
  listScriptsForProject,
} from "@/lib/scripts";

export const runtime = "nodejs";
export const maxDuration = 120;

const SLUG_ONLY_HINT =
  "Parse the PDF in your browser and send scene headings as JSON (scenes array). We do not accept script files or body text on the server.";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
  }

  const access = await requireProjectAccess(projectId);
  if ("error" in access) return access.error;

  return NextResponse.json(await listScriptsForProject(projectId));
}

/**
 * Add a script (episode) to a project.
 * JSON: { projectId, title?, episodeNumber?, sourceType, scenes: SceneSlugPayload[] }
 */
export async function POST(request: Request) {
  console.info(
    "[api/scripts POST] start",
    request.headers.get("content-length") ?? "unknown-length"
  );

  try {
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      return NextResponse.json({ error: SLUG_ONLY_HINT }, { status: 400 });
    }

    const body = await request.json();
    const projectId =
      typeof body.projectId === "string" ? body.projectId.trim() : "";
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const episodeNumber =
      typeof body.episodeNumber === "number"
        ? body.episodeNumber
        : typeof body.episodeNumber === "string" && body.episodeNumber.trim()
          ? Number(body.episodeNumber)
          : undefined;
    const sourceType = body.sourceType === "pdf" ? "pdf" : "typed";
    const slugs = parseSceneSlugList(body.scenes);

    if (typeof body.rawText === "string" && body.rawText.trim()) {
      return NextResponse.json({ error: SLUG_ONLY_HINT }, { status: 400 });
    }

    if (!projectId || !slugs) {
      return NextResponse.json(
        { error: `projectId and scenes[] are required. ${SLUG_ONLY_HINT}` },
        { status: 400 }
      );
    }

    const access = await requireProjectAccess(projectId);
    if ("error" in access) return access.error;

    const allowed = await checkScriptCreateAllowed(access.user.id, projectId);
    if (!allowed.ok) return allowed.error;

    const saveStarted = Date.now();
    const result = await createScriptWithSceneSlugs({
      projectId,
      title: title || "Episode",
      slugs,
      sourceType,
      episodeNumber:
        typeof episodeNumber === "number" && !Number.isNaN(episodeNumber)
          ? episodeNumber
          : undefined,
    });
    console.info(
      `[api/scripts POST] Saved ${result.script.title}: ${result.sceneCount} scenes, ${Date.now() - saveStarted}ms`
    );

    return NextResponse.json(result, {
      status: 201,
      headers: {
        "Cache-Control": "no-store",
        Connection: "close",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to add script";
    console.error("[api/scripts POST]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
