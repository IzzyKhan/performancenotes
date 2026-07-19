import { NextResponse } from "next/server";
import path from "path";
import convert from "heic-convert";
import { requireUser } from "@/lib/auth-guard";
import { createId } from "@/lib/id";
import { putUploadObject } from "@/lib/storage";

export const runtime = "nodejs";

function isHeicFile(name: string, mime: string): boolean {
  const lower = name.toLowerCase();
  return (
    mime === "image/heic" ||
    mime === "image/heif" ||
    mime === "image/heic-sequence" ||
    mime === "image/heif-sequence" ||
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
  if (mime.includes("heic") || mime.includes("heif")) return ".heic";
  if (mime.includes("mp3") || mime.includes("mpeg")) return ".mp3";
  if (mime.includes("wav")) return ".wav";
  if (mime.includes("ogg")) return ".ogg";
  if (mime.includes("m4a")) return ".m4a";
  return "";
}

export async function POST(request: Request) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const form = await request.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  let buffer = Buffer.from(await file.arrayBuffer());
  let mimeType = file.type || "application/octet-stream";
  let ext = guessExt(mimeType, file.name);

  if (isHeicFile(file.name, mimeType)) {
    try {
      const converted = await convert({
        buffer,
        format: "JPEG",
        quality: 0.92,
      });
      buffer = Buffer.from(converted);
      mimeType = "image/jpeg";
      ext = ".jpg";
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "HEIC conversion failed";
      return NextResponse.json(
        {
          error: `Could not convert HEIC image. Try exporting as JPEG first. (${message})`,
        },
        { status: 400 }
      );
    }
  }

  const filename = `${createId("file")}${ext || ".bin"}`;
  try {
    const stored = await putUploadObject(filename, buffer, mimeType);
    return NextResponse.json({
      filePath: stored.filePath,
      mimeType,
      url: `/api/media/${filename}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
