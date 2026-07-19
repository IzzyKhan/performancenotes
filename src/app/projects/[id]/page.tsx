import { ProjectWorkspace } from "@/components/project/project-workspace";
import { auth } from "@/auth";
import { db } from "@/db";
import {
  projects,
  canvasNodes,
  chatMessages,
  cheatSheets,
} from "@/db/schema";
import { mapCanvasNode, mapCheatSheet } from "@/lib/mappers";
import {
  listScenesForProject,
  listScriptsForProject,
} from "@/lib/scripts";
import { authRequired, getOwnedProject } from "@/lib/auth-guard";
import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import type { ProjectBundle } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

async function loadBundle(
  id: string,
  userId: string | null
): Promise<ProjectBundle | null> {
  const project = userId
    ? getOwnedProject(id, userId)
    : db.select().from(projects).where(eq(projects.id, id)).get();
  if (!project) return null;

  const nodeRows = db
    .select()
    .from(canvasNodes)
    .where(eq(canvasNodes.projectId, id))
    .all();
  const messageRows = db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.projectId, id))
    .all();
  const cheatRows = db
    .select()
    .from(cheatSheets)
    .where(eq(cheatSheets.projectId, id))
    .all();

  return {
    project,
    scripts: listScriptsForProject(id),
    scenes: listScenesForProject(id),
    canvasNodes: nodeRows.map(mapCanvasNode),
    chatMessages: messageRows.map((m) => ({
      id: m.id,
      projectId: m.projectId,
      sceneId: m.sceneId,
      role: m.role as "user" | "assistant",
      content: m.content,
      createdAt: m.createdAt,
    })),
    cheatSheets: cheatRows.map(mapCheatSheet),
  };
}

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (authRequired()) {
    const session = await auth();
    if (!session?.user?.id) redirect("/login");
    const bundle = await loadBundle(id, session.user.id);
    if (!bundle) notFound();
    return <ProjectWorkspace bundle={bundle} />;
  }

  const bundle = await loadBundle(id, null);
  if (!bundle) notFound();
  return <ProjectWorkspace bundle={bundle} />;
}
