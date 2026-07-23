/**
 * Browser-side upload helper with timeout, retries, and safe JSON parsing.
 *
 * Every past upload failure fell into one of three buckets:
 *  1. Network drop mid-request (fetch throws TypeError) — retryable
 *  2. Gateway error while the server restarts (502/503/504) — retryable
 *  3. Non-JSON error body (HTML error page) — res.json() used to throw and
 *     mask the real status code
 */

export class UploadError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "UploadError";
    this.status = status;
  }
}

const RETRYABLE_STATUSES = new Set([502, 503, 504]);

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readJsonSafe(res: Response): Promise<Record<string, unknown>> {
  const raw = await res.text();
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new UploadError(
      `Server returned an unexpected response (HTTP ${res.status}). Please try again.`,
      res.status
    );
  }
}

export interface UploadOptions {
  /** Human label used in error messages, e.g. "Image upload". */
  label: string;
  /** Abort the request after this long. Default 2 minutes (PDF parse is slow). */
  timeoutMs?: number;
  /** Extra attempts after the first failure. Default 2. */
  retries?: number;
}

/**
 * POST a FormData (or JSON string) body and return the parsed JSON response.
 * Retries transient network drops and gateway errors with backoff.
 * Throws UploadError with a user-facing message on failure.
 */
export async function postWithRetry(
  url: string,
  body: FormData | string,
  options: UploadOptions
): Promise<Record<string, unknown>> {
  const { label, timeoutMs = 120_000, retries = 2 } = options;
  const headers =
    typeof body === "string"
      ? { "Content-Type": "application/json" }
      : undefined;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      await delay(1000 * attempt);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method: "POST",
        body,
        headers,
        signal: controller.signal,
      });

      if (RETRYABLE_STATUSES.has(res.status)) {
        lastError = new UploadError(
          `${label} failed — the server was briefly unavailable (HTTP ${res.status}).`,
          res.status
        );
        continue;
      }

      const data = await readJsonSafe(res);
      if (!res.ok) {
        // Real application error (400/401/413/...) — do not retry.
        const message =
          typeof data.error === "string"
            ? data.error
            : `${label} failed (HTTP ${res.status})`;
        throw new UploadError(message, res.status);
      }
      return data;
    } catch (err) {
      if (err instanceof UploadError) {
        if (err.status !== undefined && !RETRYABLE_STATUSES.has(err.status)) {
          throw err;
        }
        lastError = err;
        continue;
      }
      if (err instanceof DOMException && err.name === "AbortError") {
        lastError = new UploadError(
          `${label} timed out. Check your connection and try again.`
        );
        continue;
      }
      if (err instanceof TypeError) {
        // Network drop / connection reset.
        lastError = new UploadError(
          `${label} failed — connection lost. Retrying usually fixes this on a weak signal.`
        );
        continue;
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError ?? new UploadError(`${label} failed after retries.`);
}
