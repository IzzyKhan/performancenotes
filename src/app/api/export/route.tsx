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
import { formatActionLine } from "@/lib/action-verbs";
import { requireProjectAccess } from "@/lib/auth-guard";
import { mapCanvasNode, mapCheatSheet, mapScene } from "@/lib/mappers";
import { readImageAsBase64 } from "@/lib/media";
import {
  sceneSlugLabel,
  scriptShortLabel,
  shootDayOrderLabel,
  sortScenesByShootThenScript,
} from "@/lib/schedule";
import {
  listScenesForProject,
  listScriptsForProject,
} from "@/lib/scripts";
import {
  SHOT_LIST_COLUMN_LABELS,
  formatShotCode,
  normalizeShotListContent,
} from "@/lib/shot-list";
import { normalizeImageGridContent } from "@/lib/image-grid";
import { normalizePerformanceNotesContent } from "@/lib/performance-notes";
import { normalizeSceneSynopsisContent } from "@/lib/scene-synopsis";
import {
  DEFAULT_EXPORT_TYPE_ORDER,
  EXPORT_TYPE_LABELS,
  parseExportTypeOrder,
} from "@/lib/export-types";
import type {
  CanvasNode,
  CanvasNodeType,
  CheatSheetContent,
  Scene,
  ShotListColumnId,
  ShotListRow,
  ImageGridItem,
  PerformanceNotesBeat,
} from "@/types";

export const runtime = "nodejs";

const TYPE_ORDER = DEFAULT_EXPORT_TYPE_ORDER;
const TYPE_LABELS = EXPORT_TYPE_LABELS;

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
  sceneSlugRight: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    textAlign: "right",
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
  /** Performance notes: one beat block; bottom rule separates beats only. */
  perfBeatGroup: {
    flexDirection: "row",
    alignItems: "stretch",
    borderBottomWidth: 1,
    borderBottomColor: "#111",
  },
  perfBeatCell: {
    width: "18%",
    paddingVertical: 5,
    paddingHorizontal: 2,
    paddingRight: 6,
    borderRightWidth: 0.5,
    borderRightColor: "#ccc",
  },
  perfCharStack: {
    width: "82%",
    flexDirection: "column",
  },
  perfCharRow: {
    flexDirection: "row",
    paddingVertical: 5,
    paddingHorizontal: 2,
    alignItems: "flex-start",
    borderBottomWidth: 0.5,
    borderBottomColor: "#ddd",
  },
  perfCharRowLast: {
    borderBottomWidth: 0,
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
  /** ~half of Images-page thumb, then +50% for on-set readability. */
  shotListThumb: {
    width: 150,
    height: 83,
    objectFit: "contain",
    backgroundColor: "#f3f3f3",
  },
  shotListRow: {
    flexDirection: "row",
    paddingVertical: 6,
    paddingHorizontal: 2,
    alignItems: "center",
    borderBottomWidth: 0.5,
    borderBottomColor: "#ddd",
    minHeight: 90,
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
  shotListTitle?: string;
  shotListColumns?: ShotListColumnId[];
  shotListRows?: Array<
    ShotListRow & { imageSrc?: string }
  >;
  imageGridTitle?: string;
  imageGridColumns?: number;
  imageGridItems?: Array<ImageGridItem & { imageSrc?: string }>;
  performanceNotesTitle?: string;
  performanceNotesBeats?: PerformanceNotesBeat[];
  sceneSynopsis?: string;
}

interface SheetSection {
  sceneHeading: string | null;
  /** "Day 2 · #3" — shown on the left when scheduled. */
  shootLabel?: string | null;
  /** Scene number + heading — right when shootLabel is set, else left. */
  sceneSlug?: string | null;
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
        ch.actions?.length > 0 ? ch.actions : [{ verb: "", synonyms: [], moment: "" }];
      actions.forEach((a, ai) => {
        const actionText = formatActionLine(a);
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
  shootLabel,
  sceneSlug,
  sectionLabel,
}: {
  title: string;
  sceneHeading: string | null;
  shootLabel?: string | null;
  sceneSlug?: string | null;
  sectionLabel: string;
}) {
  const slug = sceneSlug ?? sceneHeading ?? "Scene";
  const left = shootLabel ?? slug;
  const right = shootLabel ? slug : null;

  return (
    <View style={styles.header}>
      <View style={styles.headerLeft}>
        {/* <Text style={styles.sectionEyebrow}>{sectionLabel}</Text> */}
        <Text style={styles.sceneSlug}>{left}</Text>
      </View>
      <View style={styles.headerRight}>
        {right ? (
          <Text style={styles.sceneSlugRight}>{right}</Text>
        ) : null}
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
  const { sceneHeading, shootLabel, sceneSlug, content } = section;
  const rows = buildTableRows(content);
  const hasSheet = rows.length > 0 || Boolean(content.notes);
  const isPackOnly = !hasSheet && section.canvasNodes.length > 0;

  return (
    <Page size="A4" orientation="landscape" style={styles.page}>
      <SectionHeader
        title={title}
        sceneHeading={sceneHeading}
        shootLabel={shootLabel}
        sceneSlug={sceneSlug}
        sectionLabel={isPackOnly ? "Reference pack" : "Cheat sheet"}
      />

      {isPackOnly ? (
        <View style={styles.notes}>
          <Text style={styles.notesLabel}>Instinct references</Text>
          <Text style={styles.notesText}>
            Canvas materials for this scene follow on the next pages.
          </Text>
        </View>
      ) : null}

      {content.notes ? (
        <View style={styles.notes}>
          <Text style={styles.notesLabel}>Director notes</Text>
          <Text style={styles.notesText}>{content.notes}</Text>
        </View>
      ) : null}

      {rows.length > 0 ? (
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
      ) : null}

      <PageFooter />
    </Page>
  );
}

function RefTablePage({
  title,
  sceneHeading,
  shootLabel,
  sceneSlug,
  typeLabel,
  headers,
  rows,
}: {
  title: string;
  sceneHeading: string | null;
  shootLabel?: string | null;
  sceneSlug?: string | null;
  typeLabel: string;
  headers: { width: string; label: string }[];
  rows: string[][];
}) {
  return (
    <Page size="A4" orientation="landscape" style={styles.page}>
      <SectionHeader
        title={title}
        sceneHeading={sceneHeading}
        shootLabel={shootLabel}
        sceneSlug={sceneSlug}
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
  shootLabel,
  sceneSlug,
  nodes,
}: {
  title: string;
  sceneHeading: string | null;
  shootLabel?: string | null;
  sceneSlug?: string | null;
  nodes: ExportCanvasNode[];
}) {
  return (
    <Page size="A4" orientation="landscape" style={styles.page}>
      <SectionHeader
        title={title}
        sceneHeading={sceneHeading}
        shootLabel={shootLabel}
        sceneSlug={sceneSlug}
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

function chunkGridItems<T>(items: T[], pageSize: number): T[][] {
  if (items.length === 0) return [[]];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += pageSize) {
    chunks.push(items.slice(i, i + pageSize));
  }
  return chunks;
}

function imageGridCardWidth(columns: number): string {
  if (columns <= 2) return "48%";
  if (columns >= 4) return "23%";
  return "31%";
}

function ImageGridAppendixPages({
  title,
  sceneHeading,
  shootLabel,
  sceneSlug,
  node,
}: {
  title: string;
  sceneHeading: string | null;
  shootLabel?: string | null;
  sceneSlug?: string | null;
  node: ExportCanvasNode;
}) {
  const cols = node.imageGridColumns ?? 3;
  const items = node.imageGridItems ?? [];
  const perPage = cols * 3;
  const pages = chunkGridItems(items, perPage);
  const cardWidth = imageGridCardWidth(cols);
  const boardTitle = node.imageGridTitle || node.label || "Mood board";

  return (
    <>
      {pages.map((chunk, pageIndex) => (
        <Page
          key={`${node.id}-grid-p${pageIndex}`}
          size="A4"
          orientation="landscape"
          style={styles.page}
        >
          <SectionHeader
            title={title}
            sceneHeading={sceneHeading}
            shootLabel={shootLabel}
            sceneSlug={sceneSlug}
            sectionLabel="Canvas references · Image grid"
          />
          <Text style={styles.sectionTitle}>
            {boardTitle}
            {pages.length > 1 ? ` (${pageIndex + 1}/${pages.length})` : ""}
          </Text>
          {chunk.length === 0 ? (
            <Text style={styles.emptyNote}>No images in this grid.</Text>
          ) : (
            <View style={styles.imageGrid}>
              {chunk.map((item) => (
                <View
                  key={item.id}
                  style={[styles.imageCard, { width: cardWidth }]}
                  wrap={false}
                >
                  {item.imageSrc ? (
                    // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image
                    <Image src={item.imageSrc} style={styles.imageThumb} />
                  ) : (
                    <View style={styles.imageThumb}>
                      <Text style={styles.emptyNote}>Image unavailable</Text>
                    </View>
                  )}
                  {item.caption?.trim() ? (
                    <Text style={styles.imageCaption}>{item.caption.trim()}</Text>
                  ) : null}
                </View>
              ))}
            </View>
          )}
          <PageFooter />
        </Page>
      ))}
    </>
  );
}

function MoodAppendixPage({
  title,
  sceneHeading,
  shootLabel,
  sceneSlug,
  nodes,
}: {
  title: string;
  sceneHeading: string | null;
  shootLabel?: string | null;
  sceneSlug?: string | null;
  nodes: ExportCanvasNode[];
}) {
  return (
    <Page size="A4" orientation="landscape" style={styles.page}>
      <SectionHeader
        title={title}
        sceneHeading={sceneHeading}
        shootLabel={shootLabel}
        sceneSlug={sceneSlug}
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
  typeOrder = TYPE_ORDER,
}: {
  title: string;
  section: SheetSection;
  typeOrder?: CanvasNodeType[];
}) {
  const byType = new Map<CanvasNodeType, ExportCanvasNode[]>();
  for (const type of TYPE_ORDER) byType.set(type, []);
  for (const node of section.canvasNodes) {
    byType.get(node.type)?.push(node);
  }

  const pages: React.ReactNode[] = [];
  const headingProps = {
    sceneHeading: section.sceneHeading,
    shootLabel: section.shootLabel,
    sceneSlug: section.sceneSlug,
  };

  for (const type of typeOrder) {
    const nodes = byType.get(type) ?? [];
    if (nodes.length === 0) continue;

    if (type === "image") {
      pages.push(
        <ImageAppendixPage
          key={`${section.sceneHeading}-image`}
          title={title}
          {...headingProps}
          nodes={nodes}
        />
      );
      continue;
    }

    if (type === "image-grid") {
      for (const node of nodes) {
        if (!(node.imageGridItems && node.imageGridItems.length > 0)) continue;
        pages.push(
          <ImageGridAppendixPages
            key={`${section.sceneHeading}-grid-${node.id}`}
            title={title}
            {...headingProps}
            node={node}
          />
        );
      }
      continue;
    }

    if (type === "mood") {
      pages.push(
        <MoodAppendixPage
          key={`${section.sceneHeading}-mood`}
          title={title}
          {...headingProps}
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
          {...headingProps}
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

    if (type === "scene-synopsis") {
      pages.push(
        <RefTablePage
          key={`${section.sceneHeading}-synopsis`}
          title={title}
          {...headingProps}
          typeLabel={TYPE_LABELS["scene-synopsis"]}
          headers={[{ width: "100%", label: "Synopsis" }]}
          rows={nodes.map((n) => [n.sceneSynopsis || "—"])}
        />
      );
      continue;
    }

    if (type === "performance-notes") {
      for (const node of nodes) {
        pages.push(
          <PerformanceNotesAppendixPages
            key={`${section.sceneHeading}-perf-${node.id}`}
            title={title}
            {...headingProps}
            node={node}
          />
        );
      }
      continue;
    }

    if (type === "video-link") {
      pages.push(
        <RefTablePage
          key={`${section.sceneHeading}-link`}
          title={title}
          {...headingProps}
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
          {...headingProps}
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
      continue;
    }

    if (type === "shot-list") {
      for (const node of nodes) {
        pages.push(
          <ShotListAppendixPages
            key={`${section.sceneHeading}-shot-${node.id}`}
            title={title}
            {...headingProps}
            node={node}
          />
        );
      }
    }
  }

  return <>{pages}</>;
}

function shotCellText(
  col: ShotListColumnId,
  row: ShotListRow & { imageSrc?: string }
): string {
  switch (col) {
    case "status":
      return row.status === "done" ? "Done" : "";
    case "image":
      return row.imageSrc ? "[img]" : "—";
    case "shot":
      return formatShotCode(row.setup, row.camera) || "—";
    case "setup":
      return row.setup.trim() || "—";
    case "description":
      return row.description || "—";
    case "camera":
      return row.camera || "—";
    case "shotSize":
      return row.shotSize || "—";
    case "shotType":
      return row.shotType || "—";
    case "movement":
      return row.movement || "—";
  }
}

/** Narrow caps for short fields; leftover goes to description / image. */
function shotListColumnWidths(
  columns: ShotListColumnId[]
): Record<string, string> {
  const NARROW: Partial<Record<ShotListColumnId, number>> = {
    status: 6,
    setup: 6,
    shot: 6,
    camera: 8,
    shotSize: 8,
    shotType: 10,
    movement: 10,
  };
  const FLEX: ShotListColumnId[] = ["image", "description"];

  const widths: Record<string, string> = {};
  let reserved = 0;
  const flexCols: ShotListColumnId[] = [];

  for (const col of columns) {
    if (FLEX.includes(col)) {
      flexCols.push(col);
      continue;
    }
    const w = NARROW[col] ?? 10;
    widths[col] = `${w}%`;
    reserved += w;
  }

  // Image gets a solid share when present; description takes the rest.
  const remaining = Math.max(100 - reserved, 12);
  if (flexCols.length === 0) {
    // All narrow — scale last column to fill
    const last = columns[columns.length - 1];
    if (last) {
      const lastW = parseInt(widths[last] ?? "10", 10);
      widths[last] = `${lastW + (100 - reserved)}%`;
    }
    return widths;
  }

  if (flexCols.includes("image") && flexCols.includes("description")) {
    const imageShare = Math.min(28, Math.max(20, Math.floor(remaining * 0.45)));
    widths.image = `${imageShare}%`;
    widths.description = `${remaining - imageShare}%`;
  } else if (flexCols.includes("image")) {
    widths.image = `${remaining}%`;
  } else {
    widths.description = `${remaining}%`;
  }

  return widths;
}

const SHOT_LIST_ROWS_WITH_IMAGES = 5;
const SHOT_LIST_ROWS_TEXT = 16;

function chunkShotListRows<T>(
  rows: T[],
  hasImageCol: boolean
): T[][] {
  const size = hasImageCol
    ? SHOT_LIST_ROWS_WITH_IMAGES
    : SHOT_LIST_ROWS_TEXT;
  if (rows.length === 0) return [[]];
  const chunks: T[][] = [];
  for (let i = 0; i < rows.length; i += size) {
    chunks.push(rows.slice(i, i + size));
  }
  return chunks;
}

const PERFORMANCE_NOTES_ROWS_PER_PAGE = 14;

const PERF_COL = {
  character: "19.5%",
  objectives: "40.25%",
  actions: "40.25%",
} as const;

function chunkPerformanceNotesBeats(
  beats: PerformanceNotesBeat[],
  maxRowsPerPage = PERFORMANCE_NOTES_ROWS_PER_PAGE
): PerformanceNotesBeat[][] {
  if (beats.length === 0) return [[]];
  const chunks: PerformanceNotesBeat[][] = [];
  let current: PerformanceNotesBeat[] = [];
  let rowCount = 0;

  for (const beat of beats) {
    const beatRows = Math.max(beat.characters.length, 1);
    if (current.length > 0 && rowCount + beatRows > maxRowsPerPage) {
      chunks.push(current);
      current = [];
      rowCount = 0;
    }
    current.push(beat);
    rowCount += beatRows;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

function PerformanceNotesAppendixPages({
  title,
  sceneHeading,
  shootLabel,
  sceneSlug,
  node,
}: {
  title: string;
  sceneHeading: string | null;
  shootLabel?: string | null;
  sceneSlug?: string | null;
  node: ExportCanvasNode;
}) {
  const listTitle =
    node.performanceNotesTitle || node.label || "Performance notes";
  const beats = node.performanceNotesBeats ?? [];
  const chunks = chunkPerformanceNotesBeats(beats);
  const multi = chunks.length > 1;
  const hasContent = beats.some((b) => b.characters.length > 0);

  if (!hasContent) {
    return (
      <Page size="A4" orientation="landscape" style={styles.page}>
        <SectionHeader
          title={title}
          sceneHeading={sceneHeading}
          shootLabel={shootLabel}
          sceneSlug={sceneSlug}
          sectionLabel="Canvas references · Performance notes"
        />
        <Text style={styles.sectionTitle}>{listTitle}</Text>
        <Text style={styles.emptyNote}>No beats yet.</Text>
        <PageFooter />
      </Page>
    );
  }

  return (
    <>
      {chunks.map((chunk, pageIndex) => (
        <Page
          key={`${node.id}-perf-p${pageIndex}`}
          size="A4"
          orientation="landscape"
          style={styles.page}
        >
          <SectionHeader
            title={title}
            sceneHeading={sceneHeading}
            shootLabel={shootLabel}
            sceneSlug={sceneSlug}
            sectionLabel="Canvas references · Performance notes"
          />
          <Text style={styles.sectionTitle}>
            {multi
              ? `${listTitle} (${pageIndex + 1}/${chunks.length})`
              : listTitle}
          </Text>
          <View style={styles.table}>
            <View style={styles.headerRow}>
              <HeaderCell width="18%">Beat</HeaderCell>
              <HeaderCell width="16%">Character</HeaderCell>
              <HeaderCell width="33%">Objectives</HeaderCell>
              <HeaderCell width="33%">Actions</HeaderCell>
            </View>
            {chunk.map((beat) => (
              <View key={beat.id} style={styles.perfBeatGroup} wrap={false}>
                <View style={styles.perfBeatCell}>
                  <Text style={styles.cellText}>{beat.beat || "—"}</Text>
                </View>
                <View style={styles.perfCharStack}>
                  {beat.characters.map((ch, ci) => (
                    <View
                      key={ch.id}
                      style={[
                        styles.perfCharRow,
                        ci === beat.characters.length - 1
                          ? styles.perfCharRowLast
                          : {},
                      ]}
                    >
                      <BodyCell width={PERF_COL.character}>
                        <Text style={styles.cellText}>
                          {ch.character || "—"}
                        </Text>
                      </BodyCell>
                      <BodyCell width={PERF_COL.objectives}>
                        <Text style={styles.cellText}>
                          {ch.objectives || "—"}
                        </Text>
                      </BodyCell>
                      <BodyCell width={PERF_COL.actions}>
                        <Text style={styles.cellText}>
                          {ch.actions || "—"}
                        </Text>
                      </BodyCell>
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </View>
          <PageFooter />
        </Page>
      ))}
    </>
  );
}

function ShotListAppendixPages({
  title,
  sceneHeading,
  shootLabel,
  sceneSlug,
  node,
}: {
  title: string;
  sceneHeading: string | null;
  shootLabel?: string | null;
  sceneSlug?: string | null;
  node: ExportCanvasNode;
}) {
  const columns = node.shotListColumns ?? [];
  const rows = node.shotListRows ?? [];
  const listTitle = node.shotListTitle || node.label || "Shot list";
  const hasImageCol = columns.includes("image");
  const widths = shotListColumnWidths(columns);
  const chunks = chunkShotListRows(rows, hasImageCol);
  const multi = chunks.length > 1;

  if (columns.length === 0) {
    return (
      <Page size="A4" orientation="landscape" style={styles.page}>
        <SectionHeader
          title={title}
          sceneHeading={sceneHeading}
          shootLabel={shootLabel}
          sceneSlug={sceneSlug}
          sectionLabel="Canvas references · Shot list"
        />
        <Text style={styles.sectionTitle}>{listTitle}</Text>
        <Text style={styles.emptyNote}>No shots yet.</Text>
        <PageFooter />
      </Page>
    );
  }

  return (
    <>
      {chunks.map((chunk, pageIndex) => (
        <Page
          key={`${node.id}-p${pageIndex}`}
          size="A4"
          orientation="landscape"
          style={styles.page}
        >
          <SectionHeader
            title={title}
            sceneHeading={sceneHeading}
            shootLabel={shootLabel}
            sceneSlug={sceneSlug}
            sectionLabel="Canvas references · Shot list"
          />
          <Text style={styles.sectionTitle}>
            {multi
              ? `${listTitle} (${pageIndex + 1}/${chunks.length})`
              : listTitle}
          </Text>
          {chunk.length === 0 ? (
            <Text style={styles.emptyNote}>No shots yet.</Text>
          ) : (
            <View style={styles.table}>
              <View style={styles.headerRow} fixed>
                {columns.map((col) => (
                  <HeaderCell key={col} width={widths[col] ?? "12%"}>
                    {SHOT_LIST_COLUMN_LABELS[col]}
                  </HeaderCell>
                ))}
              </View>
              {chunk.map((row) => (
                <View key={row.id} style={styles.shotListRow} wrap={false}>
                  {columns.map((col) => (
                    <BodyCell key={col} width={widths[col] ?? "12%"}>
                      {col === "image" && row.imageSrc ? (
                        // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image
                        <Image
                          src={row.imageSrc}
                          style={styles.shotListThumb}
                        />
                      ) : col === "image" ? (
                        <Text style={styles.cellText}>—</Text>
                      ) : (
                        <Text style={styles.cellText}>
                          {shotCellText(col, row)}
                        </Text>
                      )}
                    </BodyCell>
                  ))}
                </View>
              ))}
            </View>
          )}
          <PageFooter />
        </Page>
      ))}
    </>
  );
}

function CheatSheetDocument({
  title,
  sections,
  typeOrder = TYPE_ORDER,
}: {
  title: string;
  sections: SheetSection[];
  typeOrder?: CanvasNodeType[];
}) {
  return (
    <Document>
      {sections.map((section, i) => (
        <React.Fragment key={i}>
          <SheetPage title={title} section={section} />
          {section.canvasNodes.length > 0 ? (
            <AppendixPages
              title={title}
              section={section}
              typeOrder={typeOrder}
            />
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
      case "shot-list": {
        const shot = normalizeShotListContent(n.content);
        return {
          ...base,
          shotListTitle: shot.title,
          shotListColumns: shot.columns,
          shotListRows: shot.rows.map((r) => {
            const img = r.imagePath ? readImageAsBase64(r.imagePath) : null;
            return {
              ...r,
              imageSrc: img
                ? `data:${img.mediaType};base64,${img.data}`
                : undefined,
            };
          }),
        };
      }
      case "image-grid": {
        const grid = normalizeImageGridContent(n.content);
        return {
          ...base,
          imageGridTitle: grid.title,
          imageGridColumns: grid.gridColumns,
          imageGridItems: grid.images.map((item) => {
            const img = readImageAsBase64(item.imagePath);
            return {
              ...item,
              imageSrc: img
                ? `data:${img.mediaType};base64,${img.data}`
                : undefined,
            };
          }),
        };
      }
      case "performance-notes": {
        const perf = normalizePerformanceNotesContent(n.content);
        return {
          ...base,
          performanceNotesTitle: perf.title,
          performanceNotesBeats: perf.beats,
        };
      }
      case "scene-synopsis": {
        const syn = normalizeSceneSynopsisContent(n.content);
        return { ...base, sceneSynopsis: syn.synopsis };
      }
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
  /** pack = canvas/reference export without requiring cheat sheets */
  const mode = searchParams.get("mode") === "pack" ? "pack" : "sheet";
  const order =
    searchParams.get("order") === "shoot" ? ("shoot" as const) : ("script" as const);
  const sceneIds = parseSceneIds(searchParams.get("sceneIds"));
  const typeOrder = parseExportTypeOrder(searchParams.get("typeOrder"));
  const disposition =
    searchParams.get("disposition") === "inline" ? "inline" : "attachment";

  if (!projectId) {
    return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
  }

  const access = await requireProjectAccess(projectId);
  if ("error" in access) return access.error;
  const { project } = access;

  if (scope === "all" || (sceneIds && sceneIds.length > 0)) {
    return exportAll(
      projectId,
      project.title,
      format === "zip",
      includeCanvas,
      order,
      mode,
      sceneIds,
      disposition,
      typeOrder
    );
  }

  const projectScripts = listScriptsForProject(projectId);
  const multiScript = projectScripts.length > 1;
  const sceneRow = sceneId
    ? db.select().from(scenes).where(eq(scenes.id, sceneId)).get()
    : db.select().from(scenes).where(eq(scenes.projectId, projectId)).get();
  const scene = sceneRow ? mapScene(sceneRow) : null;
  const sceneScript = scene
    ? projectScripts.find((s) => s.id === scene.scriptId) ?? null
    : null;
  const activeSceneId = scene?.id ?? sceneId;
  const canvas = includeCanvas
    ? toExportNodes(loadSceneCanvasNodes(projectId, activeSceneId))
    : [];

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

  if (mode === "sheet" && !cheatRow) {
    return NextResponse.json(
      { error: "No cheat sheet to export" },
      { status: 404 }
    );
  }

  if (mode === "pack" && !cheatRow && canvas.length === 0) {
    return NextResponse.json(
      {
        error:
          "Nothing to export for this scene yet — add references on the canvas first.",
      },
      { status: 404 }
    );
  }

  const emptyContent: CheatSheetContent = { beats: [] };
  const cheatSheet = cheatRow ? mapCheatSheet(cheatRow) : null;
  const sceneSlug = scene
    ? sceneSlugLabel(scene, sceneScript, multiScript)
    : null;
  // Single-scene export has no order toggle — show shoot chip when scheduled.
  const shootLabel = scene ? shootDayOrderLabel(scene) : null;
  const heading = shootLabel && sceneSlug
    ? `${shootLabel} · ${sceneSlug}`
    : sceneSlug;

  const buffer = await renderToBuffer(
    <CheatSheetDocument
      title={project.title}
      typeOrder={typeOrder}
      sections={[
        {
          sceneHeading: heading,
          shootLabel,
          sceneSlug,
          content: cheatSheet?.content ?? emptyContent,
          version: cheatSheet?.version ?? 1,
          canvasNodes: canvas,
        },
      ]}
    />
  );

  const filename = `${slugify(project.title, heading)}-${
    mode === "pack" ? "pack" : "cheat-sheet"
  }.pdf`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="${filename}"`,
    },
  });
}

function parseSceneIds(raw: string | null): string[] | null {
  if (!raw?.trim()) return null;
  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return ids.length > 0 ? ids : null;
}

async function exportAll(
  projectId: string,
  title: string,
  asZip: boolean,
  includeCanvas: boolean,
  order: "script" | "shoot",
  mode: "pack" | "sheet" = "sheet",
  sceneIds: string[] | null = null,
  disposition: "attachment" | "inline" = "attachment",
  typeOrder: CanvasNodeType[] = TYPE_ORDER
) {
  const projectScripts = listScriptsForProject(projectId);
  const multiScript = projectScripts.length > 1;
  const scriptsById = new Map(projectScripts.map((s) => [s.id, s]));
  const rawScenes = listScenesForProject(projectId);
  const allowed = sceneIds ? new Set(sceneIds) : null;

  const ordered =
    order === "shoot"
      ? sortScenesByShootThenScript(rawScenes, projectScripts)
      : rawScenes;
  const allScenes = allowed
    ? ordered.filter((s) => allowed.has(s.id))
    : ordered;

  const allSheets = db
    .select()
    .from(cheatSheets)
    .where(eq(cheatSheets.projectId, projectId))
    .all()
    .map(mapCheatSheet);

  const headingPartsFor = (scene: Scene) => {
    const script = scriptsById.get(scene.scriptId) ?? null;
    const sceneSlug = sceneSlugLabel(scene, script, multiScript);
    // Only surface shoot day/order in the header when exporting in shoot order.
    const shootLabel =
      order === "shoot" ? shootDayOrderLabel(scene) : null;
    return {
      sceneSlug,
      shootLabel,
      sceneHeading: shootLabel ? `${shootLabel} · ${sceneSlug}` : sceneSlug,
    };
  };

  const emptyContent: CheatSheetContent = { beats: [] };
  const sectionMeta: { scene: Scene | null; label: string }[] = [];
  const sections: SheetSection[] = [];

  if (mode === "sheet") {
    const legacy = allSheets.find((cs) => cs.sceneId === null);
    if (
      !allowed &&
      legacy &&
      !allScenes.some((s) => allSheets.some((cs) => cs.sceneId === s.id))
    ) {
      const first = allScenes[0] ?? null;
      const parts = first
        ? headingPartsFor(first)
        : { sceneHeading: "Scene", shootLabel: null, sceneSlug: "Scene" };
      sectionMeta.push({ scene: first, label: parts.sceneHeading });
      sections.push({
        sceneHeading: parts.sceneHeading,
        shootLabel: parts.shootLabel,
        sceneSlug: parts.sceneSlug,
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
      const parts = headingPartsFor(scene);
      sectionMeta.push({ scene, label: parts.sceneHeading });
      sections.push({
        sceneHeading: parts.sceneHeading,
        shootLabel: parts.shootLabel,
        sceneSlug: parts.sceneSlug,
        content: sheet.content,
        version: sheet.version,
        canvasNodes: includeCanvas
          ? toExportNodes(loadSceneCanvasNodes(projectId, scene.id))
          : [],
      });
    }
  } else {
    // pack mode: one section per scene that has canvas materials (and/or a sheet)
    for (const scene of allScenes) {
      const sheet = allSheets.find((cs) => cs.sceneId === scene.id);
      const canvas = includeCanvas
        ? toExportNodes(loadSceneCanvasNodes(projectId, scene.id))
        : [];
      if (!sheet && canvas.length === 0) continue;
      const parts = headingPartsFor(scene);
      sectionMeta.push({ scene, label: parts.sceneHeading });
      sections.push({
        sceneHeading: parts.sceneHeading,
        shootLabel: parts.shootLabel,
        sceneSlug: parts.sceneSlug,
        content: sheet?.content ?? emptyContent,
        version: sheet?.version ?? 1,
        canvasNodes: canvas,
      });
    }
  }

  if (sections.length === 0) {
    return NextResponse.json(
      {
        error:
          mode === "pack"
            ? "Nothing to export yet — add canvas references to your scenes first."
            : "No cheat sheets to export yet",
      },
      { status: 404 }
    );
  }

  const fileStem = mode === "pack" ? "scene-packs" : "cheat-sheets";

  if (!asZip) {
    const buffer = await renderToBuffer(
      <CheatSheetDocument
        title={title}
        sections={sections}
        typeOrder={typeOrder}
      />
    );
    const filename = `${slugify(title)}-${fileStem}${
      order === "shoot" ? "-shoot-order" : ""
    }.pdf`;
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${disposition}; filename="${filename}"`,
      },
    });
  }

  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  for (const [i, s] of sections.entries()) {
    const buffer = await renderToBuffer(
      <CheatSheetDocument title={title} sections={[s]} typeOrder={typeOrder} />
    );
    const meta = sectionMeta[i];
    const script = meta?.scene
      ? scriptsById.get(meta.scene.scriptId)
      : undefined;
    const epPrefix =
      multiScript && script ? `${scriptShortLabel(script).toLowerCase()}-` : "";
    const suffix = mode === "pack" ? "pack" : "cheat-sheet";
    let name: string;
    if (order === "shoot" && meta?.scene?.shootDay != null) {
      name = `D${String(meta.scene.shootDay).padStart(2, "0")}-${String(
        meta.scene.shootOrder ?? i + 1
      ).padStart(2, "0")}-${epPrefix}${slugify(meta.scene.heading)}-${suffix}.pdf`;
    } else if (order === "shoot") {
      name = `unscheduled-${epPrefix}${String(
        (meta?.scene?.orderIndex ?? i) + 1
      ).padStart(2, "0")}-${slugify(
        meta?.scene?.heading ?? s.sceneHeading ?? "scene"
      )}-${suffix}.pdf`;
    } else {
      name = `${epPrefix}${String(
        (meta?.scene?.orderIndex ?? i) + 1
      ).padStart(2, "0")}-${slugify(
        meta?.scene?.heading ?? s.sceneHeading ?? "scene"
      )}-${suffix}.pdf`;
    }
    zip.file(name, buffer);
  }
  const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
  const filename = `${slugify(title)}-${fileStem}${
    order === "shoot" ? "-shoot-order" : ""
  }.zip`;
  return new NextResponse(new Uint8Array(zipBuffer), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
