/**
 * Upload storage (Stage 5b).
 *
 * Local default: `data/uploads` (dev / no S3 env).
 * Hosted: set S3_BUCKET + keys + S3_ENDPOINT (Cloudflare R2).
 *
 * Env:
 *   S3_BUCKET
 *   S3_REGION=auto
 *   S3_ACCESS_KEY_ID
 *   S3_SECRET_ACCESS_KEY
 *   S3_ENDPOINT=https://<accountid>.r2.cloudflarestorage.com
 */

import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import fs from "fs";
import path from "path";

const UPLOADS_DIR = path.join(
  /* turbopackIgnore: true */ process.cwd(),
  "data",
  "uploads"
);

const globalForS3 = globalThis as unknown as { __pn_s3?: S3Client };

export function useObjectStorage(): boolean {
  return Boolean(process.env.S3_BUCKET?.trim());
}

function objectKey(filename: string): string {
  return `uploads/${path.basename(filename)}`;
}

function s3Client(): S3Client {
  if (!globalForS3.__pn_s3) {
    const bucket = process.env.S3_BUCKET?.trim();
    const accessKeyId = process.env.S3_ACCESS_KEY_ID?.trim();
    const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY?.trim();
    const endpoint = process.env.S3_ENDPOINT?.trim();
    if (!bucket || !accessKeyId || !secretAccessKey || !endpoint) {
      throw new Error(
        "S3_BUCKET is set but S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, or S3_ENDPOINT is missing."
      );
    }
    globalForS3.__pn_s3 = new S3Client({
      region: process.env.S3_REGION?.trim() || "auto",
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: true,
      // AWS SDK default checksums break Cloudflare R2 PutObject.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  }
  return globalForS3.__pn_s3;
}

function ensureUploadsDir() {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

export async function putUploadObject(
  filename: string,
  data: Buffer,
  contentType: string
): Promise<{ filePath: string }> {
  const safe = path.basename(filename);
  if (useObjectStorage()) {
    await s3Client().send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET!.trim(),
        Key: objectKey(safe),
        Body: data,
        ContentType: contentType || guessContentType(safe),
      })
    );
    return { filePath: `uploads/${safe}` };
  }

  ensureUploadsDir();
  fs.writeFileSync(path.join(UPLOADS_DIR, safe), data);
  return { filePath: `uploads/${safe}` };
}

export async function getUploadObject(
  filename: string
): Promise<{ body: Buffer; contentType: string } | null> {
  const safe = path.basename(filename);
  if (useObjectStorage()) {
    try {
      const res = await s3Client().send(
        new GetObjectCommand({
          Bucket: process.env.S3_BUCKET!.trim(),
          Key: objectKey(safe),
        })
      );
      const bytes = await res.Body?.transformToByteArray();
      if (!bytes) return null;
      return {
        body: Buffer.from(bytes),
        contentType:
          res.ContentType || guessContentType(safe),
      };
    } catch (err) {
      const name =
        err && typeof err === "object" && "name" in err
          ? String((err as { name: string }).name)
          : "";
      const httpStatus =
        err && typeof err === "object" && "$metadata" in err
          ? (err as { $metadata?: { httpStatusCode?: number } }).$metadata
              ?.httpStatusCode
          : undefined;
      if (
        name === "NoSuchKey" ||
        name === "NotFound" ||
        httpStatus === 404
      ) {
        return null;
      }
      throw err;
    }
  }

  const full = path.join(UPLOADS_DIR, safe);
  if (!fs.existsSync(full)) return null;
  return {
    body: fs.readFileSync(full),
    contentType: guessContentType(safe),
  };
}

export function guessContentType(name: string): string {
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
