import { createId } from "@/lib/id";
import type { ImageGridContent, ImageGridItem } from "@/types";

export const IMAGE_GRID_COLUMN_OPTIONS = [2, 3, 4] as const;

export function defaultImageGridContent(): ImageGridContent {
  return {
    title: "Mood board",
    images: [],
    gridColumns: 3,
  };
}

function normalizeItem(raw: unknown): ImageGridItem | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.imagePath !== "string" || !r.imagePath) return null;
  return {
    id: typeof r.id === "string" && r.id ? r.id : createId("img"),
    imagePath: r.imagePath,
    caption: typeof r.caption === "string" ? r.caption : undefined,
  };
}

export function normalizeImageGridContent(raw: unknown): ImageGridContent {
  if (!raw || typeof raw !== "object") {
    return defaultImageGridContent();
  }
  const c = raw as Record<string, unknown>;
  const title =
    typeof c.title === "string"
      ? c.title
      : "Mood board";

  const imagesRaw = Array.isArray(c.images) ? c.images : [];
  const images = imagesRaw
    .map(normalizeItem)
    .filter((item): item is ImageGridItem => item !== null);

  let gridColumns = 3;
  if (
    typeof c.gridColumns === "number" &&
    IMAGE_GRID_COLUMN_OPTIONS.includes(
      c.gridColumns as (typeof IMAGE_GRID_COLUMN_OPTIONS)[number]
    )
  ) {
    gridColumns = c.gridColumns;
  }

  const frameWidth =
    typeof c.frameWidth === "number" &&
    Number.isFinite(c.frameWidth) &&
    c.frameWidth >= 280
      ? Math.min(1200, Math.floor(c.frameWidth))
      : undefined;

  const frameHeight =
    typeof c.frameHeight === "number" &&
    Number.isFinite(c.frameHeight) &&
    c.frameHeight >= 200
      ? Math.min(900, Math.floor(c.frameHeight))
      : undefined;

  return { title, images, gridColumns, frameWidth, frameHeight };
}

export function formatImageGridForContext(
  title: string,
  images: ImageGridItem[]
): string {
  if (images.length === 0) return `${title}: (empty)`;
  const lines = images.map((img, i) => {
    const cap = img.caption?.trim() ? ` — ${img.caption.trim()}` : "";
    return `${i + 1}. ${img.imagePath}${cap}`;
  });
  return `${title} (${images.length} images):\n${lines.join("\n")}`;
}

/** Flatten image paths from single-image and image-grid nodes (order preserved). */
export function collectImagePaths(nodes: {
  type: string;
  content: {
    filePath?: string;
    images?: ImageGridItem[];
  };
}[]): string[] {
  const paths: string[] = [];
  for (const n of nodes) {
    if (n.type === "image" && n.content.filePath) {
      paths.push(n.content.filePath);
    } else if (n.type === "image-grid" && Array.isArray(n.content.images)) {
      for (const img of n.content.images) {
        if (img.imagePath) paths.push(img.imagePath);
      }
    }
  }
  return paths;
}
