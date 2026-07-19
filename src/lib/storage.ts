/**
 * Upload storage abstraction (Phase 3).
 *
 * Today: local disk under `data/uploads` (Railway volume).
 * Next: when moving off a single volume, install `@aws-sdk/client-s3` and
 * implement put/get against S3_BUCKET / S3_ENDPOINT (R2, MinIO, AWS).
 *
 * Env (future):
 *   S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_ENDPOINT?
 */

import fs from "fs";
import path from "path";
import { UPLOADS_DIR, ensureUploadsDir } from "@/lib/media";

export function useObjectStorage(): boolean {
  return Boolean(process.env.S3_BUCKET);
}

export async function putUploadObject(
  filename: string,
  data: Buffer,
  _contentType: string
): Promise<{ filePath: string }> {
  if (useObjectStorage()) {
    throw new Error(
      "S3_BUCKET is set but object storage is not wired yet. Unset S3_BUCKET to use the local volume, or implement S3 in src/lib/storage.ts (see docs/ROADMAP.md Phase 3)."
    );
  }

  ensureUploadsDir();
  const dest = path.join(UPLOADS_DIR, filename);
  fs.writeFileSync(dest, data);
  return { filePath: `uploads/${filename}` };
}

export async function getUploadObject(
  filename: string
): Promise<{ body: Buffer; contentType: string } | null> {
  if (useObjectStorage()) {
    throw new Error(
      "S3_BUCKET is set but object storage is not wired yet. See docs/ROADMAP.md Phase 3."
    );
  }

  const safe = path.basename(filename);
  const full = path.join(UPLOADS_DIR, safe);
  if (!fs.existsSync(full)) return null;
  return {
    body: fs.readFileSync(full),
    contentType: guessContentType(safe),
  };
}

function guessContentType(name: string): string {
  const ext = path.extname(name).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".gif") return "image/gif";
  if (ext === ".webp") return "image/webp";
  if (ext === ".mp3") return "audio/mpeg";
  if (ext === ".wav") return "audio/wav";
  if (ext === ".m4a") return "audio/mp4";
  return "application/octet-stream";
}
