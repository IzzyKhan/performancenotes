import { toast } from "sonner";

async function fetchExport(
  params: URLSearchParams,
  failureLabel: string
): Promise<{ blob: Blob; filename: string } | null> {
  const res = await fetch(`/api/export?${params}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: failureLabel }));
    toast.error(
      typeof err.error === "string" ? err.error : failureLabel
    );
    return null;
  }
  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match = disposition.match(/filename="([^"]+)"/);
  return { blob, filename: match?.[1] ?? "export.pdf" };
}

export async function downloadExport(params: URLSearchParams) {
  const result = await fetchExport(params, "Export failed");
  if (!result) return;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(result.blob);
  a.download = result.filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

/**
 * Fetch an inline PDF for in-app preview. Caller must revoke the returned URL.
 */
export async function fetchExportPreview(
  params: URLSearchParams
): Promise<{ url: string; filename: string } | null> {
  const previewParams = new URLSearchParams(params);
  previewParams.set("disposition", "inline");
  previewParams.delete("format");
  const result = await fetchExport(previewParams, "Preview failed");
  if (!result) return null;
  return {
    url: URL.createObjectURL(result.blob),
    filename: result.filename,
  };
}
