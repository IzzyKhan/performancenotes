import { createId } from "@/lib/id";
import type { ShotListColumnId, ShotListContent, ShotListRow } from "@/types";

export const SHOT_LIST_COLUMN_IDS: ShotListColumnId[] = [
  "status",
  "image",
  "setup",
  "camera",
  "shot",
  "description",
  "shotSize",
  "shotType",
  "movement",
];

export const SHOT_LIST_COLUMN_LABELS: Record<ShotListColumnId, string> = {
  status: "Status",
  image: "Image",
  setup: "Setup",
  shot: "Shot",
  description: "Description",
  camera: "Camera",
  shotSize: "Shot size",
  shotType: "Shot type",
  movement: "Movement",
};

export const DEFAULT_SHOT_LIST_COLUMNS: ShotListColumnId[] = [
  ...SHOT_LIST_COLUMN_IDS,
];

export const SHOT_SIZE_PRESETS = [
  "ECU",
  "CU",
  "MCU",
  "MS",
  "Cowboy",
  "WS",
  "EWS",
] as const;

export const SHOT_TYPE_PRESETS = [
  "Single",
  "2-Shot",
  "OTS",
  "Eye Level",
  "High Angle",
  "Low Angle",
  "POV",
] as const;

export const MOVEMENT_PRESETS = [
  "Static",
  "Pan",
  "Tilt",
  "Track",
  "Dolly",
  "Handheld",
  "Crane",
] as const;

export const CAMERA_PRESETS = ["CAM A", "CAM B", "CAM C"] as const;

function isColumnId(v: unknown): v is ShotListColumnId {
  return (
    typeof v === "string" &&
    (SHOT_LIST_COLUMN_IDS as string[]).includes(v)
  );
}

/** Letter/id from camera label: "CAM A" → "A", "B" → "B". */
export function cameraLetter(camera: string): string {
  const trimmed = camera.trim().toUpperCase();
  if (!trimmed) return "A";
  const match = trimmed.match(/(?:CAM\s*)?([A-Z0-9]+)\s*$/);
  return match?.[1] ?? trimmed.slice(-1);
}

/** Setup + camera → shot code, e.g. setup "1" + "CAM A" → "1A". Empty setup → "". */
export function formatShotCode(setup: string, camera: string): string {
  const s = setup.trim();
  if (!s) return "";
  return `${s}${cameraLetter(camera)}`;
}

export function emptyShotListRow(setupNumber = 1): ShotListRow {
  return {
    id: createId("shot"),
    status: "todo",
    imagePath: null,
    setup: String(setupNumber),
    shot: setupNumber,
    description: "",
    camera: "CAM A",
    shotSize: "MS",
    shotType: "Single",
    movement: "Static",
  };
}

export function defaultShotListContent(): ShotListContent {
  return {
    title: "Shot list",
    columns: [...DEFAULT_SHOT_LIST_COLUMNS],
    rows: [emptyShotListRow(1)],
  };
}

function normalizeRow(raw: unknown, fallbackSetup: number): ShotListRow {
  if (!raw || typeof raw !== "object") {
    return emptyShotListRow(fallbackSetup);
  }
  const r = raw as Record<string, unknown>;
  const status = r.status === "done" ? "done" : "todo";
  const shot =
    typeof r.shot === "number" && Number.isFinite(r.shot)
      ? Math.max(1, Math.floor(r.shot))
      : fallbackSetup;
  let setup: string;
  if (typeof r.setup === "string") {
    // Preserve "" while editing; only trim non-empty values.
    setup = r.setup.trim() === "" ? "" : r.setup.trim();
  } else if (typeof r.setup === "number" && Number.isFinite(r.setup)) {
    setup = String(Math.max(1, Math.floor(r.setup)));
  } else {
    // Legacy rows without setup → use shot ordinal.
    setup = String(shot);
  }
  return {
    id: typeof r.id === "string" && r.id ? r.id : createId("shot"),
    status,
    imagePath:
      typeof r.imagePath === "string" && r.imagePath ? r.imagePath : null,
    setup,
    shot,
    description: typeof r.description === "string" ? r.description : "",
    camera: typeof r.camera === "string" ? r.camera : "CAM A",
    shotSize: typeof r.shotSize === "string" ? r.shotSize : "MS",
    shotType: typeof r.shotType === "string" ? r.shotType : "Single",
    movement: typeof r.movement === "string" ? r.movement : "Static",
  };
}

/** Insert setup before shot for older lists that lack the column. */
function ensureSetupInColumns(columns: ShotListColumnId[]): ShotListColumnId[] {
  if (columns.includes("setup")) return columns;
  const shotIdx = columns.indexOf("shot");
  if (shotIdx >= 0) {
    return [
      ...columns.slice(0, shotIdx),
      "setup",
      ...columns.slice(shotIdx),
    ];
  }
  const camIdx = columns.indexOf("camera");
  if (camIdx >= 0) {
    return [
      ...columns.slice(0, camIdx),
      "setup",
      ...columns.slice(camIdx),
    ];
  }
  return ["setup", ...columns];
}

/** Coerce stored / create payloads into a stable ShotListContent shape. */
export function normalizeShotListContent(raw: unknown): ShotListContent {
  if (!raw || typeof raw !== "object") {
    return defaultShotListContent();
  }
  const c = raw as Record<string, unknown>;
  const title =
    typeof c.title === "string"
      ? c.title
      : "Shot list";

  let columns: ShotListColumnId[] = [];
  if (Array.isArray(c.columns)) {
    const seen = new Set<ShotListColumnId>();
    for (const col of c.columns) {
      if (isColumnId(col) && !seen.has(col)) {
        seen.add(col);
        columns.push(col);
      }
    }
  }
  if (columns.length === 0) {
    columns = [...DEFAULT_SHOT_LIST_COLUMNS];
  } else {
    columns = ensureSetupInColumns(columns);
  }

  const rowsRaw = Array.isArray(c.rows) ? c.rows : [];
  const rows =
    rowsRaw.length > 0
      ? rowsRaw.map((r, i) => normalizeRow(r, i + 1))
      : [emptyShotListRow(1)];

  const frameWidth =
    typeof c.frameWidth === "number" &&
    Number.isFinite(c.frameWidth) &&
    c.frameWidth >= 360
      ? Math.min(1200, Math.floor(c.frameWidth))
      : undefined;

  const frameHeight =
    typeof c.frameHeight === "number" &&
    Number.isFinite(c.frameHeight) &&
    c.frameHeight >= 200
      ? Math.min(900, Math.floor(c.frameHeight))
      : undefined;

  return { title, columns, rows, frameWidth, frameHeight };
}

export function formatShotListForContext(
  title: string,
  rows: ShotListRow[]
): string {
  if (rows.length === 0) return `${title}: (empty)`;
  const lines = rows.map((r) => {
    const mark = r.status === "done" ? "✓" : "○";
    const code = formatShotCode(r.setup, r.camera);
    return `${mark} ${code} (setup ${r.setup} / ${r.camera}) ${r.shotSize}/${r.shotType} ${r.movement} — ${r.description || "(no description)"}`;
  });
  return `${title} (${rows.length} shots):\n${lines.join("\n")}`;
}
