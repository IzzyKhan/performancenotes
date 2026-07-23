/**
 * Client-side image preparation before upload.
 *
 * Phone photos are routinely 5–15MB; on a weak connection those uploads drop
 * mid-flight, and on the server they spike memory. Re-encoding to a bounded
 * JPEG in the browser makes uploads ~30x smaller and removes both problems.
 *
 * HEIC is intentionally unsupported: iOS transcodes photo-picker uploads to
 * JPEG automatically, so raw .heic files only arrive via AirDrop/desktop.
 */

const MAX_EDGE_PX = 2000;
const JPEG_QUALITY = 0.82;
/** Below this size, re-encoding saves little — upload as-is. */
const SKIP_BELOW_BYTES = 1_000_000;

export function isHeicFile(file: File): boolean {
  const mime = file.type.toLowerCase();
  if (mime.includes("heic") || mime.includes("heif")) return true;
  return /\.(heic|heif)$/i.test(file.name);
}

export const HEIC_ERROR_MESSAGE =
  "HEIC photos aren't supported — please use JPEG or PNG. (Tip: photos picked from the iPhone photo library convert automatically; this only affects raw .heic files.)";

function decodeImage(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(file);
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not decode image"));
    };
    img.src = url;
  });
}

/**
 * Downscale + re-encode large images to JPEG. Returns the original file when
 * re-encoding isn't worthwhile (small files, GIFs) or fails (corrupt data is
 * left for the server to reject).
 */
export async function prepareImageForUpload(file: File): Promise<File> {
  // Never re-encode GIFs (would lose animation).
  if (file.type === "image/gif") return file;

  if (file.size < SKIP_BELOW_BYTES) return file;

  try {
    const source = await decodeImage(file);
    const width = "naturalWidth" in source ? source.naturalWidth : source.width;
    const height =
      "naturalHeight" in source ? source.naturalHeight : source.height;
    if (!width || !height) return file;

    const scale = Math.min(1, MAX_EDGE_PX / Math.max(width, height));
    const targetW = Math.max(1, Math.round(width * scale));
    const targetH = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    // JPEG has no alpha — flatten transparency onto white instead of black.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, targetW, targetH);
    ctx.drawImage(source, 0, 0, targetW, targetH);
    if ("close" in source) source.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
    );
    if (!blob || blob.size >= file.size) return file;

    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg" });
  } catch {
    return file;
  }
}
