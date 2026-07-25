export type CanvasNodeType = "text" | "image" | "audio" | "video-link" | "mood";

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
