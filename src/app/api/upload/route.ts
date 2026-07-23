import { NextResponse } from "next/server";
import path from "path";
import { requireUser } from "@/lib/auth-guard";
import { createId } from "@/lib/id";
import { parseMultipartForm } from "@/lib/multipart";
import { putUploadObject } from "@/lib/storage";

export const runtime = "nodejs";

/**
 * Images are compressed client-side (~<1MB); audio files can be larger.
 * Anything above this is a client bug or an unprepared file.
 */
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

function isHeic(name: string, mime: string): boolean {
  const lower = name.toLowerCase();
  return (
    mime.includes("heic") ||
    mime.includes("heif") ||
    lower.endsWith(".heic") ||
    lower.endsWith(".heif")
  );
}

function guessExt(mime: string, name: string): string {
  const fromName = path.extname(name);
  if (fromName) return fromName;
  if (mime.includes("png")) return ".png";
  if (mime.includes("jpeg") || mime.includes("jpg")) return ".jpg";
  if (mime.includes("gif")) return ".gif";
  if (mime.includes("webp")) return ".webp";
  if (mime.includes("mp3") || mime.includes("mpeg")) return ".mp3";
  if (mime.includes("wav")) return ".wav";
  if (mime.includes("ogg")) return ".ogg";
  if (mime.includes("m4a")) return ".m4a";
  return "";
}

export async function POST(request: Request) {
  const started = Date.now();
  const contentLength = request.headers.get("content-length") ?? "unknown";
  console.info(`[api/upload] start content-length=${contentLength}`);

  const authResult = await requireUser();
  if ("error" in authResult) {
    console.warn("[api/upload] rejected: unauthorized");
    return authResult.error;
  }

  const formOrErr = await parseMultipartForm(request);
  if (formOrErr instanceof NextResponse) {
    console.error(
      `[api/upload] failed: multipart parse (content-length=${contentLength})`
    );
    return formOrErr;
  }
  const form = formOrErr;
  const file = form.get("file");

  if (!(file instanceof File)) {
    console.warn("[api/upload] rejected: no file field");
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  const mimeType = file.type || "application/octet-stream";
  console.info(
    `[api/upload] file name="${file.name}" mime=${mimeType} bytes=${file.size}`
  );

  if (isHeic(file.name, mimeType)) {
    console.warn(`[api/upload] rejected: HEIC (${file.name})`);
    return NextResponse.json(
      {
        error:
          "HEIC photos aren't supported — please use JPEG or PNG. Photos picked from the iPhone photo library convert automatically.",
      },
      { status: 415 }
    );
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    console.warn(
      `[api/upload] rejected: too large (${(file.size / 1024 / 1024).toFixed(1)}MB)`
    );
    return NextResponse.json(
      {
        error: `File is too large (${(file.size / 1024 / 1024).toFixed(1)}MB, max 25MB). Images are compressed automatically — try re-selecting the file, or use a shorter audio clip.`,
      },
      { status: 413 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = guessExt(mimeType, file.name);
  const filename = `${createId("file")}${ext || ".bin"}`;

  try {
    const stored = await putUploadObject(filename, buffer, mimeType);
    console.info(
      `[api/upload] stored ${filename} bytes=${buffer.length} ms=${Date.now() - started}`
    );
    return NextResponse.json({
      filePath: stored.filePath,
      mimeType,
      url: `/api/media/${filename}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    console.error(
      `[api/upload] failed: disk write (${filename}, bytes=${buffer.length})`,
      err
    );
    return NextResponse.json(
      {
        error: `Could not save the file on the server (${message}). If this persists, the storage volume may be missing or full.`,
      },
      { status: 500 }
    );
  }
}
