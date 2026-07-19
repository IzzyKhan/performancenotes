import { NextResponse } from "next/server";

/**
 * request.formData() can throw "Failed to parse body as FormData" when the
 * multipart body is truncated (proxy/size limits) or headers/filenames are odd.
 */
export async function parseMultipartForm(
  request: Request
): Promise<FormData | NextResponse> {
  try {
    return await request.formData();
  } catch (err) {
    const cause =
      err instanceof Error && "cause" in err && err.cause instanceof Error
        ? err.cause.message
        : err instanceof Error
          ? err.message
          : "unknown";
    console.error("[multipart]", cause, err);
    return NextResponse.json(
      {
        error:
          "Could not read the uploaded file (form data parse failed). Try a smaller PDF, rename it to plain ASCII (letters/numbers/dashes), or upload one episode at a time.",
        detail: cause,
      },
      { status: 400 }
    );
  }
}

/** Strip characters that break undici multipart Content-Disposition parsing. */
export function asciiSafeFilename(name: string, fallback = "upload.pdf"): string {
  const base = name.split(/[/\\]/).pop() || fallback;
  const cleaned = base
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/["\\]/g, "")
    .replace(/\s+/g, "_")
    .trim();
  if (!cleaned || cleaned === ".pdf") return fallback;
  return cleaned.toLowerCase().endsWith(".pdf") ? cleaned : `${cleaned}.pdf`;
}

export function fileWithSafeName(file: File): File {
  const safe = asciiSafeFilename(file.name, "script.pdf");
  if (safe === file.name) return file;
  return new File([file], safe, {
    type: file.type || "application/pdf",
    lastModified: file.lastModified,
  });
}
