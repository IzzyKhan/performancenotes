import { getDocumentProxy } from "unpdf";
import { isLikelyPageChrome } from "@/lib/screenplay";

interface PdfTextItem {
  str: string;
  transform: number[];
  width?: number;
  hasEOL?: boolean;
}

/**
 * Extract PDF text while reconstructing line breaks from glyph geometry.
 * unpdf's plain extractText collapses many screenplay PDFs into a single
 * line, which breaks scene splitting and makes the script unreadable.
 * Items are grouped into lines by their Y position; a space is inserted
 * when there is a horizontal gap between items on the same line.
 *
 * Repeating page chrome (headers/footers/watermarks) is stripped when the
 * same short line appears across many pages.
 */
export async function extractPdfTextWithLines(
  data: Uint8Array
): Promise<string> {
  const pdf = await getDocumentProxy(data);
  const pageLineLists: string[][] = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const items = content.items as PdfTextItem[];

    const lines: string[] = [];
    let current = "";
    let currentY: number | null = null;
    let prevEndX: number | null = null;

    const flush = () => {
      if (current.trim()) lines.push(current.trimEnd());
      current = "";
      prevEndX = null;
    };

    for (const item of items) {
      if (!item.str) {
        if (item.hasEOL) {
          flush();
          currentY = null;
        }
        continue;
      }

      const x = item.transform[4];
      const y = item.transform[5];

      // New visual line when the Y position jumps
      if (currentY !== null && Math.abs(y - currentY) > 2) {
        flush();
      }
      currentY = y;

      // Insert a space when there's a horizontal gap between items
      if (
        current &&
        prevEndX !== null &&
        x - prevEndX > 1 &&
        !current.endsWith(" ") &&
        !item.str.startsWith(" ")
      ) {
        current += " ";
      }

      current += item.str;
      prevEndX = x + (item.width ?? 0);

      if (item.hasEOL) {
        flush();
        currentY = null;
      }
    }
    flush();

    pageLineLists.push(lines);
  }

  const chrome = detectRepeatedChrome(pageLineLists);
  const cleanedPages = pageLineLists.map((lines) =>
    lines
      .filter(
        (line) =>
          !chrome.has(normalizeChromeKey(line)) && !isLikelyPageChrome(line)
      )
      .join("\n")
  );

  return cleanedPages.join("\n\n").trim();
}

function normalizeChromeKey(line: string): string {
  return line.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Lines that appear (normalized) on many pages are almost always running
 * headers, footers, or watermarks — not scene content.
 */
function detectRepeatedChrome(pages: string[][]): Set<string> {
  const counts = new Map<string, number>();
  for (const page of pages) {
    const seen = new Set<string>();
    for (const line of page) {
      const key = normalizeChromeKey(line);
      if (!key || key.length > 80) continue;
      if (seen.has(key)) continue;
      seen.add(key);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  const threshold = Math.max(2, Math.ceil(pages.length * 0.35));
  const chrome = new Set<string>();
  for (const [key, count] of counts) {
    if (count >= threshold) chrome.add(key);
  }
  return chrome;
}
