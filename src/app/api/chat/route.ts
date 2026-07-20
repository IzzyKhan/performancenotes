import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  canvasNodes,
  chatMessages,
  cheatSheets,
} from "@/db/schema";
import { requireProjectAccess } from "@/lib/auth-guard";
import { createId, nowIso } from "@/lib/id";
import {
  mapCanvasNode,
  mapCheatSheet,
  mapScene,
  normalizeCheatSheetContent,
} from "@/lib/mappers";
import {
  DRAMATURGY_SYSTEM_PROMPT,
  DISTILL_INSTRUCTIONS,
} from "@/lib/prompts";
import {
  getImageNodes,
  readImageAsBase64,
  serializeCanvasForText,
} from "@/lib/media";
import { sceneSlugLabel } from "@/lib/schedule";
import {
  listScenesForProject,
  listScriptsForProject,
} from "@/lib/scripts";
import type { CheatSheetContent, Script } from "@/types";

export const runtime = "nodejs";

const CHEAT_SHEET_TOOL: Anthropic.Tool = {
  name: "save_cheat_sheet",
  description:
    "Save a structured performance cheat sheet for the director to use in rehearsal and on set.",
  input_schema: {
    type: "object",
    properties: {
      notes: {
        type: "string",
        description: "Optional overall director notes for the scene",
      },
      beats: {
        type: "array",
        items: {
          type: "object",
          properties: {
            beat: { type: "string", description: "Beat name / label" },
            summary: {
              type: "string",
              description: "One-line summary of what shifts in this beat",
            },
            characters: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  objective: {
                    type: "string",
                    description: "Transitive objective for this beat",
                  },
                  obstacle: { type: "string" },
                  actions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        verb: {
                          type: "string",
                          description: "Transitive action verb",
                        },
                        moment: {
                          type: "string",
                          description: "Line or moment this action plays on",
                        },
                      },
                      required: ["verb", "moment"],
                    },
                  },
                  adjustments: {
                    type: "string",
                    description: '"As if..." adjustment',
                  },
                  pitfalls: {
                    type: "string",
                    description: "What to avoid (result-acting traps)",
                  },
                },
                required: [
                  "name",
                  "objective",
                  "obstacle",
                  "actions",
                  "adjustments",
                  "pitfalls",
                ],
              },
            },
          },
          required: ["beat", "characters"],
        },
      },
    },
    required: ["beats"],
  },
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  const sceneId = searchParams.get("sceneId");
  if (!projectId) {
    return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
  }

  const access = await requireProjectAccess(projectId);
  if ("error" in access) return access.error;

  const rows = db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.projectId, projectId))
    .orderBy(asc(chatMessages.createdAt))
    .all();

  const filtered = sceneId
    ? rows.filter((m) => m.sceneId === null || m.sceneId === sceneId)
    : rows;

  return NextResponse.json(filtered);
}

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      {
        error:
          "ANTHROPIC_API_KEY is not set. Add it to .env.local and restart the server.",
      },
      { status: 500 }
    );
  }

  const body = await request.json();
  const {
    projectId,
    sceneId = null,
    message,
    mode = "riff",
  }: {
    projectId: string;
    sceneId?: string | null;
    message: string;
    mode?: "riff" | "distill";
  } = body;

  if (!projectId || (!message && mode !== "distill")) {
    return NextResponse.json(
      { error: "projectId and message are required" },
      { status: 400 }
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      try {
        send("status", { phase: "preparing" });

        const access = await requireProjectAccess(projectId);
        if ("error" in access) {
          const errBody = await access.error.json().catch(() => ({
            error: "Access denied",
          }));
          send("error", { error: errBody.error || "Access denied" });
          return;
        }
        const { project, user } = access;

        const { checkAndIncrementChatQuota } = await import("@/lib/quotas");
        const quota = checkAndIncrementChatQuota(user.id);
        if (!quota.ok) {
          send("error", { error: quota.error });
          return;
        }

        const projectScripts = listScriptsForProject(projectId);
        const allScenes = listScenesForProject(projectId);

        const scene =
          (sceneId ? allScenes.find((s) => s.id === sceneId) : undefined) ??
          allScenes[0] ??
          null;
        const activeSceneId = scene?.id ?? null;

        const nodeRows = db
          .select()
          .from(canvasNodes)
          .where(eq(canvasNodes.projectId, projectId))
          .all()
          .map(mapCanvasNode)
          .filter((n) => n.sceneId === null || n.sceneId === activeSceneId);
        const history = db
          .select()
          .from(chatMessages)
          .where(eq(chatMessages.projectId, projectId))
          .all()
          .filter((m) => m.sceneId === null || m.sceneId === activeSceneId);
        const cheatRow = db
          .select()
          .from(cheatSheets)
          .where(
            activeSceneId
              ? and(
                  eq(cheatSheets.projectId, projectId),
                  eq(cheatSheets.sceneId, activeSceneId)
                )
              : and(
                  eq(cheatSheets.projectId, projectId),
                  isNull(cheatSheets.sceneId)
                )
          )
          .get();

        const cheatSheet = cheatRow ? mapCheatSheet(cheatRow) : null;

        const userText =
          mode === "distill"
            ? message?.trim() ||
              "Please distill everything into a performance cheat sheet now."
            : message.trim();

        const userMsgId = createId("msg");
        db.insert(chatMessages)
          .values({
            id: userMsgId,
            projectId,
            sceneId: activeSceneId,
            role: "user",
            content: mode === "distill" ? `[Distill] ${userText}` : userText,
            createdAt: nowIso(),
          })
          .run();

        const contextPreamble = buildContextPreamble(
          project.title,
          scene,
          allScenes,
          projectScripts,
          nodeRows,
          cheatSheet
        );

        const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

        const imageBlocks: Anthropic.ImageBlockParam[] = [];
        for (const node of getImageNodes(nodeRows).slice(0, 6)) {
          const img = readImageAsBase64(node.content.filePath!);
          if (img) {
            imageBlocks.push({
              type: "image",
              source: {
                type: "base64",
                media_type: img.mediaType,
                data: img.data,
              },
            });
          }
        }

        type Msg = Anthropic.MessageParam;
        const messages: Msg[] = [];

        for (const m of history) {
          messages.push({
            role: m.role as "user" | "assistant",
            content: m.content,
          });
        }

        const userContent: Anthropic.ContentBlockParam[] = [
          ...imageBlocks,
          {
            type: "text",
            text:
              mode === "distill"
                ? `${DISTILL_INSTRUCTIONS}\n\nDirector request: ${userText}`
                : userText,
          },
        ];

        messages.push({ role: "user", content: userContent });

        send("status", { phase: "thinking" });

        let fullText = "";
        let cheatSheetSaved: CheatSheetContent | null = null;

        const response = anthropic.messages.stream({
          model: "claude-sonnet-5",
          max_tokens: 4096,
          system: [
            {
              type: "text",
              text: DRAMATURGY_SYSTEM_PROMPT,
            },
            {
              type: "text",
              text: contextPreamble,
            },
          ],
          tools: mode === "distill" ? [CHEAT_SHEET_TOOL] : undefined,
          tool_choice:
            mode === "distill"
              ? { type: "tool", name: "save_cheat_sheet" }
              : undefined,
          messages,
        });

        response.on("text", (text) => {
          fullText += text;
          send("token", { text });
        });

        const final = await response.finalMessage();

        for (const block of final.content) {
          if (block.type === "tool_use" && block.name === "save_cheat_sheet") {
            cheatSheetSaved = block.input as CheatSheetContent;
          }
          if (block.type === "text" && !fullText.includes(block.text)) {
            // already streamed via text events usually
          }
        }

        if (cheatSheetSaved) {
          const normalized = normalizeCheatSheetContent(cheatSheetSaved);
          const scope = activeSceneId
            ? and(
                eq(cheatSheets.projectId, projectId),
                eq(cheatSheets.sceneId, activeSceneId)
              )
            : and(
                eq(cheatSheets.projectId, projectId),
                isNull(cheatSheets.sceneId)
              );
          const existing = db.select().from(cheatSheets).where(scope).get();

          if (existing) {
            db.update(cheatSheets)
              .set({
                content: JSON.stringify(normalized),
                version: existing.version + 1,
                createdAt: nowIso(),
              })
              .where(eq(cheatSheets.id, existing.id))
              .run();
          } else {
            db.insert(cheatSheets)
              .values({
                id: createId("sheet"),
                projectId,
                sceneId: activeSceneId,
                content: JSON.stringify(normalized),
                version: 1,
                createdAt: nowIso(),
              })
              .run();
          }

          const saved = db.select().from(cheatSheets).where(scope).get()!;
          send("cheatsheet", mapCheatSheet(saved));

          if (!fullText.trim()) {
            fullText =
              "I've distilled the scene into a cheat sheet. Open the Cheat Sheet panel to review and edit it.";
            send("token", { text: fullText });
          }
        }

        const assistantId = createId("msg");
        db.insert(chatMessages)
          .values({
            id: assistantId,
            projectId,
            sceneId: activeSceneId,
            role: "assistant",
            content: fullText,
            createdAt: nowIso(),
          })
          .run();

        send("done", {
          message: {
            id: assistantId,
            projectId,
            sceneId: activeSceneId,
            role: "assistant",
            content: fullText,
            createdAt: nowIso(),
          },
        });
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";
        send("error", { error: errorMessage });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

function buildContextPreamble(
  title: string,
  scene: ReturnType<typeof mapScene> | null,
  allScenes: ReturnType<typeof mapScene>[],
  projectScripts: Script[],
  nodes: ReturnType<typeof mapCanvasNode>[],
  cheatSheet: ReturnType<typeof mapCheatSheet> | null
): string {
  const parts: string[] = [`Project: "${title}"`];
  const multiScript = projectScripts.length > 1;
  const scriptsById = new Map(projectScripts.map((s) => [s.id, s]));

  if (allScenes.length > 1 || multiScript) {
    if (multiScript) {
      const lines: string[] = [];
      for (const script of projectScripts) {
        lines.push(`### ${script.title}`);
        const scriptScenes = allScenes.filter((s) => s.scriptId === script.id);
        for (const s of scriptScenes) {
          const mark =
            scene && s.id === scene.id
              ? " ← ACTIVE (the director is working on this one)"
              : "";
          lines.push(
            `- ${sceneSlugLabel(s, script, false)}${mark}`
          );
        }
      }
      parts.push(
        `## Script overview\nThis project has ${projectScripts.length} episodes / scripts (${allScenes.length} scenes):\n${lines.join("\n")}`
      );
    } else {
      parts.push(
        `## Script overview\nThis project contains ${allScenes.length} scenes:\n${allScenes
          .map(
            (s) =>
              `${sceneSlugLabel(s)}${scene && s.id === scene.id ? " ← ACTIVE (the director is working on this one)" : ""}`
          )
          .join("\n")}`
      );
    }
  }

  if (scene) {
    const script = scriptsById.get(scene.scriptId) ?? null;
    const slug = sceneSlugLabel(scene, script, multiScript);
    parts.push(
      `## Active scene: ${slug} (source: ${scene.sourceType})\n${scene.rawText.slice(0, 30000)}`
    );
    if (scene.parsedMeta) {
      parts.push(
        `Detected characters: ${scene.parsedMeta.characters.join(", ") || "none"}\nDetected beat markers: ${scene.parsedMeta.detectedBeats.join(" | ") || "none"}`
      );
    }
  } else {
    parts.push("## Scene text\nNo scene uploaded yet.");
  }

  parts.push(`## Instinct layer (canvas)\n${serializeCanvasForText(nodes)}`);

  if (cheatSheet) {
    parts.push(
      `## Current cheat sheet (v${cheatSheet.version})\n${JSON.stringify(cheatSheet.content, null, 2)}`
    );
  } else {
    parts.push("## Current cheat sheet\nNone yet.");
  }

  return parts.join("\n\n");
}
