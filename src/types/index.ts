export type CanvasNodeType =
  | "text"
  | "image"
  | "audio"
  | "video-link"
  | "mood"
  | "shot-list"
  | "image-grid"
  | "performance-notes"
  | "scene-synopsis";

export type ShotListColumnId =
  | "status"
  | "image"
  | "setup"
  | "shot"
  | "description"
  | "camera"
  | "shotSize"
  | "shotType"
  | "movement";

export type ShotListRowStatus = "todo" | "done";

export interface ShotListRow {
  id: string;
  status: ShotListRowStatus;
  imagePath: string | null;
  /** Setup number (e.g. "1"); combined with camera letter → shot code "1A". */
  setup: string;
  /** Legacy ordinal; display shot code is derived from setup + camera. */
  shot: number;
  description: string;
  camera: string;
  shotSize: string;
  shotType: string;
  movement: string;
}

export interface ShotListContent {
  title: string;
  /** Visible columns in display order (subset of the template catalog). */
  columns: ShotListColumnId[];
  rows: ShotListRow[];
  /** Canvas node width in px (user-resized). */
  frameWidth?: number;
  /** Canvas node height in px (user-resized). */
  frameHeight?: number;
}

export interface ImageGridItem {
  id: string;
  imagePath: string;
  caption?: string;
}

export interface ImageGridContent {
  title: string;
  /** Display / export order. */
  images: ImageGridItem[];
  /** Grid density: 2 | 3 | 4. */
  gridColumns: number;
  frameWidth?: number;
  frameHeight?: number;
}

export interface PerformanceNotesCharacter {
  id: string;
  character: string;
  objectives: string;
  /** Action verbs — free text, e.g. "to plead, to deflect". */
  actions: string;
}

export interface PerformanceNotesBeat {
  id: string;
  beat: string;
  characters: PerformanceNotesCharacter[];
}

export interface PerformanceNotesContent {
  title: string;
  beats: PerformanceNotesBeat[];
  frameWidth?: number;
  frameHeight?: number;
}

export interface SceneSynopsisContent {
  synopsis: string;
}

export type SceneSourceType = "pdf" | "typed";

export interface ParsedMeta {
  characters: string[];
  detectedBeats: string[];
}

export interface Project {
  id: string;
  userId?: string | null;
  title: string;
  createdAt: string;
  /** ISO date (YYYY-MM-DD) when prep begins. */
  prepStartDate: string | null;
  /** ISO date (YYYY-MM-DD) when principal photography begins. */
  shootStartDate: string | null;
  /** ISO date (YYYY-MM-DD) when the tech recce takes place. */
  techRecceDate: string | null;
  /** When true, prep must finish the day before tech recce instead of shoot start. */
  prepEndBeforeTechRecce: boolean;
  /** How many days per week the user will prep (1–7). */
  prepDaysPerWeek: number;
  /** Accent colour id (see src/lib/color-themes.ts) — "neutral" is the unstyled default. */
  colorTheme: string;
}

export interface Script {
  id: string;
  projectId: string;
  title: string;
  orderIndex: number;
  episodeNumber: number;
  sourceType: SceneSourceType;
  createdAt: string;
}

export interface Scene {
  id: string;
  projectId: string;
  scriptId: string;
  heading: string;
  orderIndex: number;
  /** Production number from the script when known (e.g. "28", "12A"). */
  sceneNumber: string | null;
  shootDay: number | null;
  shootOrder: number | null;
  /** True when the user has marked this scene as prepped. */
  prepped: boolean;
  rawText: string;
  sourceType: SceneSourceType;
  parsedMeta: ParsedMeta | null;
  createdAt: string;
}

export interface CanvasNodeContent {
  text?: string;
  filePath?: string;
  mimeType?: string;
  url?: string;
  mood?: string;
  color?: string;
  /** Present when type === "shot-list" (also mirrored as nested fields). */
  title?: string;
  columns?: ShotListColumnId[];
  rows?: ShotListRow[];
  frameWidth?: number;
  frameHeight?: number;
  /** Present when type === "image-grid". */
  images?: ImageGridItem[];
  gridColumns?: number;
  /** Present when type === "performance-notes". */
  beats?: PerformanceNotesBeat[];
  /** Present when type === "scene-synopsis". */
  synopsis?: string;
}

export interface CanvasNode {
  id: string;
  projectId: string;
  sceneId: string | null;
  type: CanvasNodeType;
  content: CanvasNodeContent;
  positionX: number;
  positionY: number;
  label: string | null;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  projectId: string;
  sceneId: string | null;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface ActionNote {
  /** Primary transitive action verb. */
  verb: string;
  /** 1–2 synonymous alternatives so the director can pick tone on set. */
  synonyms: string[];
  moment: string;
}

export interface CharacterNotes {
  name: string;
  objective: string;
  obstacle: string;
  actions: ActionNote[];
  adjustments: string;
  pitfalls: string;
}

export interface BeatEntry {
  beat: string;
  summary?: string;
  characters: CharacterNotes[];
}

export interface CheatSheetContent {
  beats: BeatEntry[];
  notes?: string;
}

export interface CheatSheet {
  id: string;
  projectId: string;
  sceneId: string | null;
  content: CheatSheetContent;
  version: number;
  createdAt: string;
}

export interface ProjectBundle {
  project: Project;
  scripts: Script[];
  scenes: Scene[];
  canvasNodes: CanvasNode[];
  chatMessages: ChatMessage[];
  cheatSheets: CheatSheet[];
}
