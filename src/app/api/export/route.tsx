import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import path from "path";
import { db } from "@/db";
import { cheatSheets, scenes, canvasNodes } from "@/db/schema";
import { requireProjectAccess } from "@/lib/auth-guard";
import { mapCanvasNode, mapCheatSheet, mapScene } from "@/lib/mappers";
import { readImageAsBase64 } from "@/lib/media";
import {
  sceneSlugLabel,
  scriptShortLabel,
  shootSectionLabel,
  sortScenesByShootThenScript,
} from "@/lib/schedule";
import {
  listScenesForProject,
  listScriptsForProject,
} from "@/lib/scripts";
import type { CanvasNode, CanvasNodeType, CheatSheetContent, Scene } from "@/types";

export const runtime = "nodejs";

const TYPE_ORDER: CanvasNodeType[] = [
  "text",
  "image",
  "mood",
  "video-link",
  "audio",
];

const TYPE_LABELS: Record<CanvasNodeType, string> = {
  text: "Text notes",
  image: "Images",
  mood: "Mood tags",
  "video-link": "Reference links",
  audio: "Audio",
};

const COL = {
  beat: "9%",
  character: "12%",
  objective: "16%",
  actions: "18%",
  obstacles: "15%",
  pitfalls: "15%",
  adjustments: "15%",
} as const;

const styles = StyleSheet.create({
  page: {
    paddingTop: 28,
    paddingBottom: 36,
    paddingHorizontal: 24,
    fontFamily: "Helvetica",
    fontSize: 8,
    color: "#111",
    lineHeight: 1.35,
  },
  header: {
    marginBottom: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
  },
  headerLeft: {
    flexGrow: 1,
    flexShrink: 1,
    paddingRight: 12,
  },
  headerRight: {
    flexShrink: 0,
    maxWidth: "42%",
    alignItems: "flex-end",
  },
  sceneSlug: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    marginBottom: 2,
  },
  projectTitle: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    textAlign: "right",
    marginBottom: 2,
  },
  sectionEyebrow: {
    fontSize: 7,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: "#666",
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    marginBottom: 10,
  },
  notes: {
    marginBottom: 10,
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: "#f3f3f3",
  },
  notesLabel: {
    fontSize: 7,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: "#666",
    marginBottom: 2,
    fontFamily: "Helvetica-Bold",
  },
  notesText: {
    fontSize: 8,
  },
  table: {
    width: "100%",
    borderTopWidth: 1,
    borderTopColor: "#111",
  },
  headerRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#111",
    paddingVertical: 5,
    paddingHorizontal: 2,
  },
  headerCell: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7.5,
    color: "#111",
  },
  row: {
    flexDirection: "row",
    paddingVertical: 5,
    paddingHorizontal: 2,
    alignItems: "flex-start",
    borderBottomWidth: 0.5,
    borderBottomColor: "#ddd",
  },
  beatDivider: {
    borderTopWidth: 1,
    borderTopColor: "#111",
  },
  cell: {
    paddingRight: 6,
  },
  cellText: {
    fontSize: 8,
  },
  beatNum: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
  },
  beatName: {
    fontSize: 7,
    color: "#444",
    marginTop: 1,
  },
  characterName: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
  },
  footer: {
    position: "absolute",
    bottom: 16,
    left: 24,
    right: 24,
    fontSize: 7,
    color: "#999",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  imageGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  imageCard: {
    width: "31%",
    marginBottom: 8,
  },
  imageThumb: {
    width: "100%",
    height: 110,
    objectFit: "cover",
    marginBottom: 4,
    backgroundColor: "#eee",
  },
  imageLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    marginBottom: 1,
  },
  imageCaption: {
    fontSize: 7,
    color: "#555",
  },
  colorSwatch: {
    width: 10,
    height: 10,
    marginRight: 4,
    marginTop: 1,
  },
  moodRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  emptyNote: {
    fontSize: 8,
    color: "#666",
  },
});

/** Node payload ready for PDF rendering (images already base64 data URIs). */
export interface ExportCanvasNode {
  id: string;
  type: CanvasNodeType;
  label: string | null;
  text?: string;
  url?: string;
  mood?: string;
  color?: string;
  fileName?: string;
  mimeType?: string;
  imageSrc?: string;
}

interface SheetSection {
  sceneHeading: string | null;
  content: CheatSheetContent;
  version: number;
  canvasNodes: ExportCanvasNode[];
}

type TableRow = {
  showBeat: boolean;
  showCharacter: boolean;
  beatIndex: number;
  beatName: string;
  beatSummary?: string;
  characterName: string;
  objective: string;
  action: string;
  obstacle: string;
  pitfalls: string;
  adjustments: string;
  isFirstInBeat: boolean;
};

function buildTableRows(content: CheatSheetContent): TableRow[] {
  const rows: TableRow[] = [];
  (content.beats ?? []).forEach((beat, bi) => {
    let firstInBeat = true;
    (beat.characters ?? []).forEach((ch) => {
      const actions =
        ch.actions?.length > 0 ? ch.actions : [{ verb: "", moment: "" }];
      actions.forEach((a, ai) => {
        const actionText = a.verb
          ? a.moment
            ? `to ${a.verb} — ${a.moment}`
            : `to ${a.verb}`
          : "";
        const isFirstForCharacter = ai === 0;
        rows.push({
          showBeat: firstInBeat,
          showCharacter: isFirstForCharacter,
          beatIndex: bi + 1,
          beatName: beat.beat,
          beatSummary: beat.summary,
          characterName: ch.name,
          objective: isFirstForCharacter ? (ch.objective ?? "") : "",
          action: actionText,
          obstacle: isFirstForCharacter ? (ch.obstacle ?? "") : "",
          pitfalls: isFirstForCharacter ? (ch.pitfalls ?? "") : "",
          adjustments: isFirstForCharacter ? (ch.adjustments ?? "") : "",
          isFirstInBeat: firstInBeat,
        });
        firstInBeat = false;
      });
    });
  });
  return rows;
}

function HeaderCell({
  width,
  children,
}: {
  width: string;
  children: string;
}) {
  return (
    <View style={[styles.cell, { width }]}>
      <Text style={styles.headerCell}>{children}</Text>
    </View>
  );
}

function BodyCell({
  width,
  children,
}: {
  width: string;
  children: React.ReactNode;
}) {
  return <View style={[styles.cell, { width }]}>{children}</View>;
}

function PageFooter() {
  return (
    <View style={styles.footer} fixed>
      <Text>Performance Notes</Text>
      <Text
        render={({ pageNumber, totalPages }) =>
          `${pageNumber} / ${totalPages}`
        }
      />
    </View>
  );
}

function SectionHeader({
  title,
  sceneHeading,
  sectionLabel,
}: {
  title: string;
  sceneHeading: string | null;
  sectionLabel: string;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.headerLeft}>
        {/* <Text style={styles.sectionEyebrow}>{sectionLabel}</Text> */}
        <Text style={styles.sceneSlug}>{sceneHeading ?? "Scene"}</Text>
      </View>
      <View style={styles.headerRight}>
        {/* <Text style={styles.projectTitle}>{title}</Text> */}
      </View>
    </View>
  );
}

function SheetPage({
  title,
  section,
}: {
  title: string;
  section: SheetSection;
}) {
  const { sceneHeading, content } = section;
  const rows = buildTableRows(content);

  return (
    <Page size="A4" orientation="landscape" style={styles.page}>
      <SectionHeader
        title={title}
        sceneHeading={sceneHeading}
        sectionLabel="Cheat sheet"
      />

      {content.notes ? (
        <View style={styles.notes}>
          <Text style={styles.notesLabel}>Director notes</Text>
          <Text style={styles.notesText}>{content.notes}</Text>
        </View>
      ) : null}

      <View style={styles.table}>
        <View style={styles.headerRow} fixed>
          <HeaderCell width={COL.beat}>Beat</HeaderCell>
          <HeaderCell width={COL.character}>Character</HeaderCell>
          <HeaderCell width={COL.objective}>Possible objectives</HeaderCell>
          <HeaderCell width={COL.actions}>Possible actions</HeaderCell>
          <HeaderCell width={COL.obstacles}>Obstacles</HeaderCell>
          <HeaderCell width={COL.pitfalls}>Pitfalls</HeaderCell>
          <HeaderCell width={COL.adjustments}>Adjustments</HeaderCell>
        </View>

        {rows.map((row, i) => (
          <View
            key={i}
            style={[styles.row, row.isFirstInBeat ? styles.beatDivider : {}]}
            wrap={false}
          >
            <BodyCell width={COL.beat}>
              {row.showBeat ? (
                <>
                  <Text style={styles.beatNum}>{row.beatIndex}</Text>
                  <Text style={styles.beatName}>{row.beatName}</Text>
                </>
              ) : null}
            </BodyCell>
            <BodyCell width={COL.character}>
              {row.showCharacter ? (
                <Text style={styles.characterName}>{row.characterName}</Text>
              ) : null}
            </BodyCell>
            <BodyCell width={COL.objective}>
              {row.objective ? (
                <Text style={styles.cellText}>{row.objective}</Text>
              ) : null}
            </BodyCell>
            <BodyCell width={COL.actions}>
              {row.action ? (
                <Text style={styles.cellText}>{row.action}</Text>
              ) : null}
            </BodyCell>
            <BodyCell width={COL.obstacles}>
              {row.obstacle ? (
                <Text style={styles.cellText}>{row.obstacle}</Text>
              ) : null}
            </BodyCell>
            <BodyCell width={COL.pitfalls}>
              {row.pitfalls ? (
                <Text style={styles.cellText}>{row.pitfalls}</Text>
              ) : null}
            </BodyCell>
            <BodyCell width={COL.adjustments}>
              {row.adjustments ? (
                <Text style={styles.cellText}>{row.adjustments}</Text>
              ) : null}
            </BodyCell>
          </View>
        ))}
      </View>

      <PageFooter />
    </Page>
  );
}

function RefTablePage({
  title,
  sceneHeading,
  typeLabel,
  headers,
  rows,
}: {
  title: string;
  sceneHeading: string | null;
  typeLabel: string;
  headers: { width: string; label: string }[];
  rows: string[][];
}) {
  return (
    <Page size="A4" orientation="landscape" style={styles.page}>
      <SectionHeader
        title={title}
        sceneHeading={sceneHeading}
        sectionLabel={`Canvas references · ${typeLabel}`}
      />
      <Text style={styles.sectionTitle}>{typeLabel}</Text>
      <View style={styles.table}>
        <View style={styles.headerRow} fixed>
          {headers.map((h) => (
            <HeaderCell key={h.label} width={h.width}>
              {h.label}
            </HeaderCell>
          ))}
        </View>
        {rows.map((cells, i) => (
          <View key={i} style={styles.row} wrap={false}>
            {cells.map((cell, ci) => (
              <BodyCell key={ci} width={headers[ci].width}>
                <Text style={styles.cellText}>{cell || "—"}</Text>
              </BodyCell>
            ))}
          </View>
        ))}
      </View>
      <PageFooter />
    </Page>
  );
}

function ImageAppendixPage({
  title,
  sceneHeading,
  nodes,
}: {
  title: string;
  sceneHeading: string | null;
  nodes: ExportCanvasNode[];
}) {
  return (
    <Page size="A4" orientation="landscape" style={styles.page}>
      <SectionHeader
        title={title}
        sceneHeading={sceneHeading}
        sectionLabel="Canvas references · Images"
      />
      <Text style={styles.sectionTitle}>Images</Text>
      <View style={styles.imageGrid}>
        {nodes.map((n) => (
          <View key={n.id} style={styles.imageCard} wrap={false}>
            {n.imageSrc ? (
              // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image
              <Image src={n.imageSrc} style={styles.imageThumb} />
            ) : (
              <View style={styles.imageThumb}>
                <Text style={styles.emptyNote}>Image unavailable</Text>
              </View>
            )}
            <Text style={styles.imageLabel}>{n.label || "Untitled reference"}</Text>
            {n.fileName ? (
              <Text style={styles.imageCaption}>{n.fileName}</Text>
            ) : null}
          </View>
        ))}
      </View>
      <PageFooter />
    </Page>
  );
}

function MoodAppendixPage({
  title,
  sceneHeading,
  nodes,
}: {
  title: string;
  sceneHeading: string | null;
  nodes: ExportCanvasNode[];
}) {
  return (
    <Page size="A4" orientation="landscape" style={styles.page}>
      <SectionHeader
        title={title}
        sceneHeading={sceneHeading}
        sectionLabel="Canvas references · Mood tags"
      />
      <Text style={styles.sectionTitle}>Mood tags</Text>
      <View style={styles.table}>
        <View style={styles.headerRow} fixed>
          <HeaderCell width="25%">Annotation</HeaderCell>
          <HeaderCell width="60%">Mood</HeaderCell>
          <HeaderCell width="15%">Color</HeaderCell>
        </View>
        {nodes.map((n) => (
          <View key={n.id} style={styles.row} wrap={false}>
            <BodyCell width="25%">
              <Text style={styles.cellText}>{n.label || "—"}</Text>
            </BodyCell>
            <BodyCell width="60%">
              <Text style={styles.cellText}>{n.mood || "—"}</Text>
            </BodyCell>
            <BodyCell width="15%">
              <View style={styles.moodRow}>
                {n.color ? (
                  <View
                    style={[styles.colorSwatch, { backgroundColor: n.color }]}
                  />
                ) : null}
                <Text style={styles.cellText}>{n.color || "—"}</Text>
              </View>
            </BodyCell>
          </View>
        ))}
      </View>
      <PageFooter />
    </Page>
  );
}

function AppendixPages({
  title,
  section,
}: {
  title: string;
  section: SheetSection;
}) {
  const byType = new Map<CanvasNodeType, ExportCanvasNode[]>();
  for (const type of TYPE_ORDER) byType.set(type, []);
  for (const node of section.canvasNodes) {
    byType.get(node.type)?.push(node);
  }

  const pages: React.ReactNode[] = [];

  for (const type of TYPE_ORDER) {
    const nodes = byType.get(type) ?? [];
    if (nodes.length === 0) continue;

    if (type === "image") {
      pages.push(
        <ImageAppendixPage
          key={`${section.sceneHeading}-image`}
          title={title}
          sceneHeading={section.sceneHeading}
          nodes={nodes}
        />
      );
      continue;
    }

    if (type === "mood") {
      pages.push(
        <MoodAppendixPage
          key={`${section.sceneHeading}-mood`}
          title={title}
          sceneHeading={section.sceneHeading}
          nodes={nodes}
        />
      );
      continue;
    }

    if (type === "text") {
      pages.push(
        <RefTablePage
          key={`${section.sceneHeading}-text`}
          title={title}
          sceneHeading={section.sceneHeading}
          typeLabel={TYPE_LABELS.text}
          headers={[
            { width: "30%", label: "Annotation" },
            { width: "70%", label: "Note" },
          ]}
          rows={nodes.map((n) => [n.label || "—", n.text || "—"])}
        />
      );
      continue;
    }

    if (type === "video-link") {
      pages.push(
        <RefTablePage
          key={`${section.sceneHeading}-link`}
          title={title}
          sceneHeading={section.sceneHeading}
          typeLabel={TYPE_LABELS["video-link"]}
          headers={[
            { width: "30%", label: "Annotation" },
            { width: "70%", label: "URL" },
          ]}
          rows={nodes.map((n) => [n.label || "—", n.url || "—"])}
        />
      );
      continue;
    }

    if (type === "audio") {
      pages.push(
        <RefTablePage
          key={`${section.sceneHeading}-audio`}
          title={title}
          sceneHeading={section.sceneHeading}
          typeLabel={TYPE_LABELS.audio}
          headers={[
            { width: "30%", label: "Annotation" },
            { width: "40%", label: "Filename" },
            { width: "30%", label: "Type" },
          ]}
          rows={nodes.map((n) => [
            n.label || "—",
            n.fileName || "—",
            n.mimeType || "audio",
          ])}
        />
      );
    }
  }

  return <>{pages}</>;
}

function CheatSheetDocument({
  title,
  sections,
}: {
  title: string;
  sections: SheetSection[];
}) {
  return (
    <Document>
      {sections.map((section, i) => (
        <React.Fragment key={i}>
          <SheetPage title={title} section={section} />
          {section.canvasNodes.length > 0 ? (
            <AppendixPages title={title} section={section} />
          ) : null}
        </React.Fragment>
      ))}
    </Document>
  );
}

function slugify(...parts: (string | null | undefined)[]) {
  return parts
    .filter(Boolean)
    .join(" ")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function parseIncludeCanvas(value: string | null): boolean {
  if (value === null || value === "") return true;
  return !(value === "0" || value === "false");
}

/** Active-scene nodes only (no legacy null-sceneId project-wide nodes). */
function loadSceneCanvasNodes(
  projectId: string,
  sceneId: string | null
): CanvasNode[] {
  if (!sceneId) return [];
  return db
    .select()
    .from(canvasNodes)
    .where(eq(canvasNodes.projectId, projectId))
    .all()
    .map(mapCanvasNode)
    .filter((n) => n.sceneId === sceneId);
}

function toExportNodes(nodes: CanvasNode[]): ExportCanvasNode[] {
  return nodes.map((n) => {
    const base: ExportCanvasNode = {
      id: n.id,
      type: n.type,
      label: n.label,
    };
    switch (n.type) {
      case "text":
        return { ...base, text: n.content.text ?? "" };
      case "image": {
        const fileName = n.content.filePath
          ? path.basename(n.content.filePath)
          : undefined;
        const img = n.content.filePath
          ? readImageAsBase64(n.content.filePath)
          : null;
        return {
          ...base,
          fileName,
          mimeType: n.content.mimeType,
          imageSrc: img ? `data:${img.mediaType};base64,${img.data}` : undefined,
        };
      }
      case "audio":
        return {
          ...base,
          fileName: n.content.filePath
            ? path.basename(n.content.filePath)
            : undefined,
          mimeType: n.content.mimeType,
        };
      case "video-link":
        return { ...base, url: n.content.url ?? "" };
      case "mood":
        return {
          ...base,
          mood: n.content.mood ?? "",
          color: n.content.color,
        };
      default:
        return base;
    }
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  const sceneId = searchParams.get("sceneId");
  const scope = searchParams.get("scope");
  const format = searchParams.get("format");
  const includeCanvas = parseIncludeCanvas(searchParams.get("includeCanvas"));
  const order =
    searchParams.get("order") === "shoot" ? ("shoot" as const) : ("script" as const);

  if (!projectId) {
    return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
  }

  const access = await requireProjectAccess(projectId);
  if ("error" in access) return access.error;
  const { project } = access;

  if (scope === "all") {
    return exportAll(
      projectId,
      project.title,
      format === "zip",
      includeCanvas,
      order
    );
  }

  const cheatRow = db
    .select()
    .from(cheatSheets)
    .where(
      sceneId
        ? and(
            eq(cheatSheets.projectId, projectId),
            eq(cheatSheets.sceneId, sceneId)
          )
        : and(eq(cheatSheets.projectId, projectId), isNull(cheatSheets.sceneId))
    )
    .get();
  if (!cheatRow) {
    return NextResponse.json(
      { error: "No cheat sheet to export" },
      { status: 404 }
    );
  }

  const cheatSheet = mapCheatSheet(cheatRow);
  const sceneRow = sceneId
    ? db.select().from(scenes).where(eq(scenes.id, sceneId)).get()
    : db.select().from(scenes).where(eq(scenes.projectId, projectId)).get();
  const scene = sceneRow ? mapScene(sceneRow) : null;
  const projectScripts = listScriptsForProject(projectId);
  const multiScript = projectScripts.length > 1;
  const sceneScript = scene
    ? projectScripts.find((s) => s.id === scene.scriptId) ?? null
    : null;
  const activeSceneId = scene?.id ?? sceneId;
  const canvas = includeCanvas
    ? toExportNodes(loadSceneCanvasNodes(projectId, activeSceneId))
    : [];

  const heading = scene
    ? sceneSlugLabel(scene, sceneScript, multiScript)
    : null;

  const buffer = await renderToBuffer(
    <CheatSheetDocument
      title={project.title}
      sections={[
        {
          sceneHeading: heading,
          content: cheatSheet.content,
          version: cheatSheet.version,
          canvasNodes: canvas,
        },
      ]}
    />
  );

  const filename = `${slugify(project.title, heading)}-cheat-sheet.pdf`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

async function exportAll(
  projectId: string,
  title: string,
  asZip: boolean,
  includeCanvas: boolean,
  order: "script" | "shoot"
) {
  const projectScripts = listScriptsForProject(projectId);
  const multiScript = projectScripts.length > 1;
  const scriptsById = new Map(projectScripts.map((s) => [s.id, s]));
  const rawScenes = listScenesForProject(projectId);

  const allScenes =
    order === "shoot"
      ? sortScenesByShootThenScript(rawScenes, projectScripts)
      : rawScenes;

  const allSheets = db
    .select()
    .from(cheatSheets)
    .where(eq(cheatSheets.projectId, projectId))
    .all()
    .map(mapCheatSheet);

  const labelFor = (scene: Scene) => {
    const script = scriptsById.get(scene.scriptId) ?? null;
    return order === "shoot"
      ? shootSectionLabel(scene, script, multiScript)
      : sceneSlugLabel(scene, script, multiScript);
  };

  const sectionMeta: { scene: Scene | null; label: string }[] = [];
  const sections: SheetSection[] = [];
  const legacy = allSheets.find((cs) => cs.sceneId === null);
  if (
    legacy &&
    !allScenes.some((s) => allSheets.some((cs) => cs.sceneId === s.id))
  ) {
    const first = allScenes[0] ?? null;
    const label = first ? labelFor(first) : "Scene";
    sectionMeta.push({ scene: first, label });
    sections.push({
      sceneHeading: label,
      content: legacy.content,
      version: legacy.version,
      canvasNodes: includeCanvas
        ? toExportNodes(loadSceneCanvasNodes(projectId, first?.id ?? null))
        : [],
    });
  }
  for (const scene of allScenes) {
    const sheet = allSheets.find((cs) => cs.sceneId === scene.id);
    if (!sheet) continue;
    const label = labelFor(scene);
    sectionMeta.push({ scene, label });
    sections.push({
      sceneHeading: label,
      content: sheet.content,
      version: sheet.version,
      canvasNodes: includeCanvas
        ? toExportNodes(loadSceneCanvasNodes(projectId, scene.id))
        : [],
    });
  }

  if (sections.length === 0) {
    return NextResponse.json(
      { error: "No cheat sheets to export yet" },
      { status: 404 }
    );
  }

  if (!asZip) {
    const buffer = await renderToBuffer(
      <CheatSheetDocument title={title} sections={sections} />
    );
    const filename = `${slugify(title)}-cheat-sheets${
      order === "shoot" ? "-shoot-order" : ""
    }.pdf`;
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  for (const [i, s] of sections.entries()) {
    const buffer = await renderToBuffer(
      <CheatSheetDocument title={title} sections={[s]} />
    );
    const meta = sectionMeta[i];
    const script = meta?.scene
      ? scriptsById.get(meta.scene.scriptId)
      : undefined;
    const epPrefix =
      multiScript && script ? `${scriptShortLabel(script).toLowerCase()}-` : "";
    let name: string;
    if (order === "shoot" && meta?.scene?.shootDay != null) {
      name = `D${String(meta.scene.shootDay).padStart(2, "0")}-${String(
        meta.scene.shootOrder ?? i + 1
      ).padStart(2, "0")}-${epPrefix}${slugify(meta.scene.heading)}-cheat-sheet.pdf`;
    } else if (order === "shoot") {
      name = `unscheduled-${epPrefix}${String(
        (meta?.scene?.orderIndex ?? i) + 1
      ).padStart(2, "0")}-${slugify(
        meta?.scene?.heading ?? s.sceneHeading ?? "scene"
      )}-cheat-sheet.pdf`;
    } else {
      name = `${epPrefix}${String(
        (meta?.scene?.orderIndex ?? i) + 1
      ).padStart(2, "0")}-${slugify(
        meta?.scene?.heading ?? s.sceneHeading ?? "scene"
      )}-cheat-sheet.pdf`;
    }
    zip.file(name, buffer);
  }
  const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
  const filename = `${slugify(title)}-cheat-sheets${
    order === "shoot" ? "-shoot-order" : ""
  }.zip`;
  return new NextResponse(new Uint8Array(zipBuffer), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
