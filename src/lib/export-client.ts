import { toast } from "sonner";

export type ExportFetchOk = { ok: true; blob: Blob; filename: string };
export type ExportFetchErr = { ok: false; error: string };
export type ExportFetchResult = ExportFetchOk | ExportFetchErr;

async function fetchExport(
  params: URLSearchParams,
  failureLabel: string
): Promise<ExportFetchResult> {
  const res = await fetch(`/api/export?${params}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: failureLabel }));
    return {
      ok: false,
      error: typeof err.error === "string" ? err.error : failureLabel,
    };
  }
  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match = disposition.match(/filename="([^"]+)"/);
  return { ok: true, blob, filename: match?.[1] ?? "export.pdf" };
}

export async function downloadExport(
  params: URLSearchParams,
  options?: { toastOnError?: boolean }
): Promise<ExportFetchResult> {
  const result = await fetchExport(params, "Export failed");
  if (!result.ok) {
    if (options?.toastOnError !== false) {
      toast.error(result.error);
    }
    return result;
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(result.blob);
  a.download = result.filename;
  a.click();
  URL.revokeObjectURL(a.href);
  return result;
}

/**
 * Fetch an inline PDF for in-app preview. Caller must revoke the returned URL.
 */
export async function fetchExportPreview(
  params: URLSearchParams,
  options?: { toastOnError?: boolean }
): Promise<
  | { ok: true; url: string; filename: string }
  | ExportFetchErr
> {
  const previewParams = new URLSearchParams(params);
  previewParams.set("disposition", "inline");
  previewParams.delete("format");
  const result = await fetchExport(previewParams, "Preview failed");
  if (!result.ok) {
    if (options?.toastOnError !== false) {
      toast.error(result.error);
    }
    return result;
  }
  return {
    ok: true,
    url: URL.createObjectURL(result.blob),
    filename: result.filename,
  };
}
