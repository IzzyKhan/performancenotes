/**
 * Per-project accent colour presets. Selecting one personalises the scene
 * list, header buttons, and footer text in the UI, and — for anything but
 * the neutral default — the scene slug / schedule numbering in exported
 * PDFs too.
 */

export type ColorThemeId =
  | "neutral"
  | "blue"
  | "indigo"
  | "violet"
  | "rose"
  | "amber"
  | "emerald"
  | "teal";

export interface ColorTheme {
  id: ColorThemeId;
  label: string;
  hex: string;
}

export const COLOR_THEMES: ColorTheme[] = [
  { id: "neutral", label: "Neutral", hex: "#6b7280" },
  { id: "blue", label: "Blue", hex: "#3b82f6" },
  { id: "indigo", label: "Indigo", hex: "#6366f1" },
  { id: "violet", label: "Violet", hex: "#8b5cf6" },
  { id: "rose", label: "Rose", hex: "#e11d48" },
  { id: "amber", label: "Amber", hex: "#d97706" },
  { id: "emerald", label: "Emerald", hex: "#10b981" },
  { id: "teal", label: "Teal", hex: "#14b8a6" },
];

export const DEFAULT_COLOR_THEME_ID: ColorThemeId = "neutral";

const THEME_IDS = new Set<string>(COLOR_THEMES.map((t) => t.id));

export function isColorThemeId(value: string): value is ColorThemeId {
  return THEME_IDS.has(value);
}

export function getColorTheme(id: string | null | undefined): ColorTheme {
  return COLOR_THEMES.find((t) => t.id === id) ?? COLOR_THEMES[0];
}

/** Hex for UI accents (scene list, header buttons, footer) — always a real colour, including neutral's grey. */
export function getColorThemeHex(id: string | null | undefined): string {
  return getColorTheme(id).hex;
}

/**
 * Hex for the PDF export, or `null` for the neutral default so exports stay
 * pixel-identical to before this feature for anyone who hasn't customised.
 */
export function getPdfAccentColor(id: string | null | undefined): string | null {
  const theme = getColorTheme(id);
  return theme.id === "neutral" ? null : theme.hex;
}
